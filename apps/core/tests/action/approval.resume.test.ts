import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';

// Resume jobs run in this process instead of a worker.
vi.mock('@engine/runner/JobRunnerFactory', () => ({ getJobRunner: vi.fn() }));

import Core from '@engine/Core';
import { executeJob } from '@engine/worker/JobExecutor';
import { getJobRunner } from '@engine/runner/JobRunnerFactory';
import { GroupSSH } from '@/action/actions/ssh/actions';

// A pause and its resume against a real (in-memory) SQLite with the real migrations: what
// a run saves before it pauses has to load again when it resumes, and a resume that breaks
// must end the run. approval.test.ts mocks the run services, which is how a saved `null`
// failing to load went unnoticed.
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

// Like drupal-restore-backup: live-type variables left empty, the approval comes first,
// and the connection is opened after it.
const workflow = {
  version: '1.0.0',
  name: 'Resume with empty variables',
  description: 'Pauses for an approval before opening a connection.',
  author: 'tests',
  pipeline: {
    variables: [
      { type: 'sshConnection', name: 'connection' },
      { type: 'oauthToken', name: 'googleToken' },
      { type: 'string', name: 'done', value: '' },
    ],
    actions: [
      { identifier: 'ask', group: 'approval', name: 'request', params: { title: 'Go ahead?' } },
      {
        identifier: 'open',
        group: 'ssh',
        name: 'connect',
        params: { config: { host: 'example.test', username: 'u', password: 'p' } },
        destination: 'connection',
      },
      {
        identifier: 'token',
        group: 'variable',
        name: 'set',
        params: { name: 'googleToken', value: { access_token: 'tok' } },
      },
      { identifier: 'say', group: 'system', name: 'message', params: { text: 'finished' }, destination: 'done' },
    ],
  },
};

const fakeSsh = { execCommand: async () => ({}), dispose: () => {}, isConnected: () => true };

let resumes: Promise<unknown>[];
let seenAtConnect: Record<string, unknown> | null;

beforeEach(async () => {
  await knex('pipeline_variable').del();
  await knex('pipeline_action').del();
  await knex('pipeline_block').del();
  await knex('pipeline').del();
  await knex('task').del();
  await knex('task').insert({
    identifier: 'wf-resume',
    name: workflow.name,
    source: JSON.stringify(workflow),
  });

  resumes = [];
  vi.mocked(getJobRunner).mockReturnValue({
    submit: (job: any) => {
      const done = executeJob(job);
      resumes.push(done.catch(() => {}));
      return done;
    },
  } as any);

  // No network: the step still runs and fills its destination, and shows what the
  // run's variables held when it started.
  seenAtConnect = null;
  vi.spyOn(GroupSSH, 'connect').mockImplementation((async (_params: unknown, task: any) => {
    const pipeline = task.getPipeline();
    seenAtConnect = {
      connection: pipeline.getVariableByName('connection').getValue(),
      googleToken: pipeline.getVariableByName('googleToken').getValue(),
    };
    return fakeSsh;
  }) as any);
});
afterEach(() => vi.restoreAllMocks());

async function startAndPause() {
  await executeJob({ type: 'exec', identifier: 'wf-resume', correlationId: 'corr-exec' } as any);
  const run = await knex('pipeline').first();
  expect(run.status).toBe('paused');
  return run;
}

async function savedVariables(pipelineId: number) {
  const rows = await knex('pipeline_variable').where({ pipeline_id: pipelineId }).whereNull('block_id');
  return Object.fromEntries(rows.map((row: any) => [row.name, row.value]));
}

describe('resuming a run with empty live-type variables', () => {
  it('pauses at the approval, is approved and finishes, the variables empty until a step sets them', async () => {
    const run = await startAndPause();
    expect(await savedVariables(run.id)).toMatchObject({ connection: 'null', googleToken: 'null' });
    expect(await Core.approvalList()).toEqual([
      expect.objectContaining({ pipelineIdentifier: run.identifier }),
    ]);

    await Core.approvalDecide({ pipelineIdentifier: run.identifier, approved: true });
    await Promise.all(resumes);

    const ended = await knex('pipeline').where({ id: run.id }).first();
    expect(ended.status).toBe('completed');
    expect(seenAtConnect).toEqual({ connection: null, googleToken: null });
    const values = await savedVariables(run.id);
    // A connection is never saved; the token and the message are.
    expect(values.connection).toBe('null');
    expect(JSON.parse(values.googleToken)).toEqual({ access_token: 'tok' });
    expect(JSON.parse(values.done)).toBe('finished');
  });

  it('a resume that breaks while loading the run ends it as failed with the error, not running', async () => {
    const run = await startAndPause();
    // The saved copy of the workflow can't be read back.
    await knex('pipeline').where({ id: run.id }).update({ source: '{not json' });

    await Core.approvalDecide({ pipelineIdentifier: run.identifier, approved: true });
    await Promise.all(resumes);

    const ended = await knex('pipeline').where({ id: run.id }).first();
    expect(ended.status).toBe('failed');
    expect(ended.finished_at).toBeTruthy();
    const metadata = JSON.parse(ended.metadata);
    expect(metadata).toMatchObject({ reason: 'action_error', message: expect.stringMatching(/JSON/) });
    // The decision is kept; nothing is waiting any more.
    expect(metadata.approval).toBeUndefined();
    expect(Object.values(metadata.approvals)).toEqual([expect.objectContaining({ approved: true })]);
    const steps = await knex('pipeline_action').where({ pipeline_id: run.id });
    expect(steps.map((s: any) => s.status)).not.toContain('paused');
    expect(steps.find((s: any) => s.status === 'failed')?.error).toMatch(/JSON/);
  });

  it('the same goes for a resume from the CLI, which also hears the error', async () => {
    const run = await startAndPause();
    await knex('pipeline').where({ id: run.id }).update({ source: '{not json' });

    await expect(Core.pipelineResume(run.identifier, 'corr-cli')).rejects.toThrow(/JSON/);

    const ended = await knex('pipeline').where({ id: run.id }).first();
    expect(ended.status).toBe('failed');
    expect(JSON.parse(ended.metadata)).toMatchObject({ reason: 'action_error' });
  });

  it('a step failing after the resume keeps its own failure', async () => {
    const run = await startAndPause();
    vi.mocked(GroupSSH.connect).mockRejectedValue(new Error('Connection refused'));

    await Core.approvalDecide({ pipelineIdentifier: run.identifier, approved: true });
    await Promise.all(resumes);

    const ended = await knex('pipeline').where({ id: run.id }).first();
    expect(ended.status).toBe('failed');
    expect(JSON.parse(ended.metadata)).toMatchObject({
      reason: 'action_error',
      message: expect.stringContaining('Connection refused'),
    });
  });
});
