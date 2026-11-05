import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';

// The job runner stands in for the worker thread: it emits what a finished run emits
// (taskStart, then taskEnd with the requested outputs), or fails.
const submit = vi.fn();
vi.mock('@engine/runner/JobRunnerFactory', () => ({ getJobRunner: () => ({ submit }) }));

import Core from '@engine/Core';
import { coreEvents } from '@engine/CoreEvents';

let knex: Knex;

beforeAll(async () => {
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);
});
afterAll(() => knex.destroy());

const workflow = (cache?: Record<string, unknown>) => ({
  name: 'List People',
  description: 'Returns the team',
  ...(cache ? { cache } : {}),
  pipeline: {
    variables: [
      { name: 'team', type: 'string', value: 'all', visibility: 'public' },
      { name: 'people', type: 'array', value: [], visibility: 'public' },
      { name: 'region', type: 'string', valueFromGlobal: 'region' },
    ],
    actions: [{ group: 'script', name: 'runScript', params: { code: 'return 1' }, destination: 'people' }],
  },
});

async function saveWorkflow(source: unknown) {
  await knex('task').del();
  await knex('task').insert({ identifier: 'wf', name: 'List People', source: JSON.stringify(source) });
}

let runs = 0;
beforeEach(async () => {
  await knex('cache_entries').del();
  await knex('pipeline_variable').del();
  await knex('pipeline').del();
  await knex('global_variable').del();
  runs = 0;
  submit.mockReset();
  submit.mockImplementation(async (job: any) => {
    runs++;
    coreEvents.emit(`taskStart:${job.correlationId}`, { name: 'List People', pipelineIdentifier: `p-${runs}` });
    coreEvents.emit(`taskEnd:${job.correlationId}`, {
      name: 'List People',
      pipelineIdentifier: `p-${runs}`,
      taskIdentifier: 'wf',
      ...(job.outputs ? { outputs: { people: [`run ${runs}`, job.variables?.team ?? 'all'] } } : {}),
    });
  });
});

/** Runs Core.exec like an app does, collecting the taskEnd events it reports. */
async function exec(options: Record<string, unknown> = {}, variables: Record<string, unknown> = {}) {
  const correlationId = `c-${Math.random()}`;
  const ends: any[] = [];
  const onEnd = (data: any) => ends.push(data);
  coreEvents.on(`taskEnd:${correlationId}`, onEnd);
  try {
    await Core.exec('wf', correlationId, variables, false, false, { ephemeral: true, outputs: ['people'], ...options });
  } finally {
    coreEvents.off(`taskEnd:${correlationId}`, onEnd);
  }
  return ends.at(-1);
}

describe('Core.exec — workflow cache', () => {
  it('runs once, then answers with the stored outputs without starting a run', async () => {
    await saveWorkflow(workflow({ ttl: '10m' }));
    expect((await exec()).outputs).toEqual({ people: ['run 1', 'all'] });
    const second = await exec();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ outputs: { people: ['run 1', 'all'] }, cached: true, cachedFrom: 'p-1' });
  });

  it('runs again for different inputs', async () => {
    await saveWorkflow(workflow({ ttl: '10m' }));
    await exec({}, { team: 'a' });
    expect((await exec({}, { team: 'b' })).outputs).toEqual({ people: ['run 2', 'b'] });
    expect((await exec({}, { team: 'a' })).cached).toBe(true);
  });

  it('only keys on the inputs named in `inputs`', async () => {
    await saveWorkflow(workflow({ ttl: '10m', inputs: ['region'] }));
    await exec({}, { team: 'a' });
    expect((await exec({}, { team: 'b' })).cached).toBe(true);
  });

  it('runs again when a global variable it reads has changed', async () => {
    await saveWorkflow(workflow({ ttl: '10m' }));
    await knex('global_variable').insert({ identifier: 'g1', name: 'region', value: 'eu', type: 'string' });
    await exec();
    await knex('global_variable').update({ value: 'us' });
    expect((await exec()).cached).toBeUndefined();
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('starts fresh once the workflow is edited', async () => {
    await saveWorkflow(workflow({ ttl: '10m' }));
    await exec();
    await saveWorkflow({ ...workflow({ ttl: '10m' }), description: 'Edited' });
    expect((await exec()).cached).toBeUndefined();
  });

  it('runs for real without `cache`, without requested outputs, in bypass and when debugging', async () => {
    await saveWorkflow(workflow());
    await exec();
    await exec();
    expect(submit).toHaveBeenCalledTimes(2);

    await saveWorkflow(workflow({ ttl: '10m' }));
    await exec({ outputs: undefined });
    await exec({ outputs: undefined });
    await exec({ cacheMode: 'bypass' });
    await exec({ cacheMode: 'bypass' });
    expect(submit).toHaveBeenCalledTimes(6);
    expect(await knex('cache_entries').count({ n: '*' }).first()).toEqual({ n: 0 });

    await exec();
    await Core.exec('wf', 'dbg', {}, true, false, { ephemeral: true, outputs: ['people'] });
    expect(submit).toHaveBeenCalledTimes(8);
  });

  it('refresh runs and replaces the stored outputs', async () => {
    await saveWorkflow(workflow({ ttl: '10m' }));
    await exec();
    expect((await exec({ cacheMode: 'refresh' })).outputs).toEqual({ people: ['run 2', 'all'] });
    expect((await exec()).outputs).toEqual({ people: ['run 2', 'all'] });
  });

  it('stores nothing when the run fails, is paused or canceled', async () => {
    await saveWorkflow(workflow({ ttl: '10m' }));
    submit.mockRejectedValueOnce(new Error('boom'));
    await expect(exec()).rejects.toThrow('boom');
    submit.mockImplementationOnce(async (job: any) => {
      coreEvents.emit(`taskEnd:${job.correlationId}`, { outputs: { people: [] }, status: 'canceled' });
    });
    await exec();
    expect(await knex('cache_entries').count({ n: '*' }).first()).toEqual({ n: 0 });
  });

  it('records a cached run in history when the run would have been saved', async () => {
    await saveWorkflow(workflow({ ttl: '10m' }));
    await exec({ ephemeral: false });
    const end = await exec({ ephemeral: false });
    expect(end.pipelineIdentifier).not.toBe('');
    const [run] = await knex('pipeline').where({ identifier: end.pipelineIdentifier });
    expect(run.status).toBe('completed');
    expect(JSON.parse(run.metadata)).toMatchObject({ cached: true, cachedFrom: 'p-1' });
    const vars = await knex('pipeline_variable').where({ pipeline_id: run.id });
    expect(vars.map((v: any) => [v.name, JSON.parse(v.value)])).toEqual([['people', ['run 1', 'all']]]);
  });

  it('turns the cache on and off from the workflow settings, refusing workflows that cannot be cached', async () => {
    await saveWorkflow(workflow());
    const on = await Core.taskUpdateMeta('wf', { cache: { ttl: '15m' } });
    expect(JSON.parse(on!.source as string).cache).toEqual({ ttl: '15m' });
    const off = await Core.taskUpdateMeta('wf', { name: 'People', cache: null });
    expect(JSON.parse(off!.source as string)).not.toHaveProperty('cache');
    expect(off!.name).toBe('People');

    const sends = workflow();
    sends.pipeline.actions.push({ group: 'email', name: 'send', params: {} } as any);
    await saveWorkflow(sends);
    await expect(Core.taskUpdateMeta('wf', { name: 'Renamed', cache: { ttl: '15m' } })).rejects.toThrow(/email.send/);
    // Nothing was written.
    const [row] = await knex('task').where({ identifier: 'wf' });
    expect(row.name).toBe('List People');
  });

  it('marks a workflow as a helper and back, alongside the cache setting', async () => {
    await saveWorkflow(workflow());
    const on = await Core.taskUpdateMeta('wf', { cache: { ttl: '1h' }, helper: true });
    expect(JSON.parse(on!.source as string)).toMatchObject({ cache: { ttl: '1h' }, helper: true });
    // The workflows list reads it straight from the source.
    const [listed] = await knex('task').select(knex.raw(`json_extract(source, '$.helper') as helper`));
    expect(listed.helper).toBe(1);

    const off = await Core.taskUpdateMeta('wf', { name: 'People', helper: false });
    expect(JSON.parse(off!.source as string)).not.toHaveProperty('helper');
    expect(JSON.parse(off!.source as string).cache).toEqual({ ttl: '1h' });
    expect(off!.name).toBe('People');
  });
});
