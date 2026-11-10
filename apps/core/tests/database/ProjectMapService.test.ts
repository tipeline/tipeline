import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { ProjectMapService, isoTime, workflowFields, workflowGlobals } from '@database/services/ProjectMapService';

// Against a real (in-memory) SQLite with the real migrations: the live map read from
// workflow, app and schedule definitions, and the stored plan.
let knex: Knex;

const source = (pipeline: any, extra: Record<string, unknown> = {}) => JSON.stringify({ ...extra, pipeline });
const subtask = (identifier: string) => ({ group: 'subtask', name: 'exec', params: { identifier } });
const appSource = (...identifiers: string[]) =>
  JSON.stringify({
    schemaVersion: 3,
    workflows: Object.fromEntries(identifiers.map((id, i) => [`wf${i + 1}`, { identifier: id }])),
    pages: [],
  });

const join = async (table: 'task' | 'app', identifier: string, projectId: number) => {
  const { id } = await knex(table).where({ identifier }).first('id');
  await knex(table === 'task' ? 'project_task' : 'project_app').insert({ project_id: projectId, [`${table}_id`]: id });
};
const projectsOf = async (identifier: string) =>
  await knex('project_task')
    .join('task', 'task.id', 'project_task.task_id')
    .join('project', 'project.id', 'project_task.project_id')
    .where('task.identifier', identifier)
    .orderBy('project.identifier')
    .pluck('project.identifier');

beforeAll(async () => {
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);

  const [cache] = await knex('project').insert({ identifier: 'p-cache', name: 'Caching toolkit', color: '#f80' });
  const [agenda] = await knex('project').insert({ identifier: 'p-agenda', name: 'Agenda' });
  await knex('global_variable').insert({ identifier: 'g1', name: 'cacheConfig', type: 'object', value: '{}' });

  await knex('task').insert([
    {
      identifier: 'wf-sites',
      name: 'Data: get customer sites',
      source: source({ variables: [{ name: 'sites', output: true }], actions: [] }, { helper: true }),
    },
    {
      identifier: 'wf-fetch',
      name: 'Fetch cache config',
      source: source({ actions: [{ group: 'http', name: 'get', params: { url: 'x' }, destination: '_global.cacheConfig' }] }),
    },
    {
      identifier: 'wf-purge',
      name: 'Purge cache by tag',
      source: source({
        variables: [
          { name: 'tag', visibility: 'public' },
          { name: 'base', visibility: 'public', valueFromGlobal: 'cacheConfig' },
          { name: 'purged', output: true },
        ],
        actions: [subtask('wf-sites'), { group: 'http', name: 'post', params: { url: '{{ _global.cacheConfig.cdn }}/purge' } }],
      }),
    },
    { identifier: 'wf-other', name: 'Unrelated', source: source({ actions: [] }) },
  ]);
  const purge = (await knex('task').where({ identifier: 'wf-purge' }).first()).id;
  await knex('schedule').insert({ identifier: 's-daily', task_id: purge, cron: '0 7 * * *', variables: '{}', enabled: true });
  await knex('app').insert({ identifier: 'app-console', name: 'Purge console', source: appSource('wf-purge') });
  await join('task', 'wf-sites', agenda);
  await join('task', 'wf-fetch', cache);
  await join('task', 'wf-purge', cache);
  await join('task', 'wf-other', agenda);
  await join('app', 'app-console', cache);
});
afterAll(() => knex.destroy());

describe('workflowGlobals', () => {
  it('finds writes in destinations and variable.set, reads in templates and valueFromGlobal', () => {
    const g = workflowGlobals(
      source({
        variables: [{ name: 'a', valueFromGlobal: '_global.fromVar' }],
        actions: [
          { group: 'x', name: 'y', params: { text: 'Hi {{ _global.greeting | upcase }}' }, destination: '_global.out' },
          { group: 'variable', name: 'set', params: { name: '_global.counter', value: '{= _global.base =}' } },
          { group: 'flow', name: 'if', params: { statements: [{ actions: [{ group: 'x', name: 'z', params: { v: '{% if _global.flag %}1{% endif %}' } }] }] } },
        ],
      })
    );
    expect(g.writes.sort()).toEqual(['counter', 'out']);
    expect(g.reads.sort()).toEqual(['base', 'flag', 'fromVar', 'greeting']);
    expect(g.dynamic).toBe(false);
  });

  it('skips descriptions, which show templates as help text but never run them', () => {
    const g = workflowGlobals(
      source(
        {
          variables: [{ name: 'a', description: 'Like {{ _global.inVarHelp }}' }],
          actions: [{ group: 'x', name: 'y', description: 'Uses {{ _global.inStepHelp }}', params: { description: '{{ _global.used }}' } }],
        },
        { description: '- `{{ _global.varName }}` — a global variable' }
      )
    );
    expect(g.reads).toEqual(['used']);
  });

  it('ignores "_global." outside templates and marks names built while running as dynamic', () => {
    const plain = workflowGlobals(source({ actions: [{ group: 'x', name: 'y', params: { text: 'see _global.docs' } }] }));
    expect(plain.reads).toEqual([]);
    const dynamic = workflowGlobals(
      source({ actions: [{ group: 'x', name: 'y', params: {}, destination: '_global.{{ which }}' }] })
    );
    expect(dynamic).toEqual({ reads: [], writes: [], dynamic: true });
  });

  it('treats a broken source as using nothing', () => {
    expect(workflowGlobals('{not json')).toEqual({ reads: [], writes: [], dynamic: false });
  });
});

describe('workflowFields', () => {
  it('reads public inputs (not ones filled from a global or env) and outputs', () => {
    expect(
      workflowFields(
        source({
          variables: [
            { name: 'tag', visibility: 'public' },
            { name: 'secretish' },
            { name: 'fromEnv', visibility: 'public', valueFromEnv: 'X' },
            { name: 'result', output: true, visibility: 'public' },
          ],
        }, { helper: true })
      )
    ).toEqual({ inputs: ['tag'], outputs: ['result'], helper: true });
  });
});

describe('ProjectMapService.live', () => {
  it("draws one project's nodes and what they touch, each line from the one doing it", async () => {
    const map = await ProjectMapService.live('p-cache');
    const keys = map.nodes.map((n) => n.key).sort();
    expect(keys).toEqual(['app:app-console', 'global:cacheConfig', 'schedule:s-daily', 'task:wf-fetch', 'task:wf-purge', 'task:wf-sites']);
    expect(map.edges).toEqual(
      expect.arrayContaining([
        { from: 'task:wf-purge', to: 'task:wf-sites', kind: 'calls' },
        { from: 'task:wf-fetch', to: 'global:cacheConfig', kind: 'writes' },
        { from: 'task:wf-purge', to: 'global:cacheConfig', kind: 'reads' },
        { from: 'app:app-console', to: 'task:wf-purge', kind: 'runs' },
        { from: 'schedule:s-daily', to: 'task:wf-purge', kind: 'triggers' },
      ])
    );
    expect(map.edges).toHaveLength(5);

    const sites = map.nodes.find((n) => n.key === 'task:wf-sites')!;
    expect(sites).toMatchObject({ kind: 'helper', external: true, projects: [{ identifier: 'p-agenda' }] });
    const purge = map.nodes.find((n) => n.key === 'task:wf-purge')!;
    expect(purge).toMatchObject({ inputs: ['tag'], outputs: ['purged'] });
    expect(purge.external).toBeUndefined();
    expect(map.nodes.find((n) => n.key === 'schedule:s-daily')!.name).toMatch(/07:00/);
  });

  it('marks a global used but never created as missing', async () => {
    await knex('task').insert({
      identifier: 'wf-ttl',
      name: 'Reads a missing global',
      source: source({ actions: [{ group: 'x', name: 'y', params: { v: '{{ _global.cacheTtl }}' } }] }),
    });
    await join('task', 'wf-ttl', (await knex('project').where({ identifier: 'p-cache' }).first()).id);
    const map = await ProjectMapService.live('p-cache');
    expect(map.nodes.find((n) => n.key === 'global:cacheTtl')).toMatchObject({ missing: true });
    expect(map.nodes.find((n) => n.key === 'global:cacheConfig')!.missing).toBe(false);
    const ttl = await knex('task').where({ identifier: 'wf-ttl' }).first('id');
    await knex('project_task').where({ task_id: ttl.id }).delete();
    await knex('task').where({ id: ttl.id }).delete();
  });

  it('without a project, draws everything and nothing is borrowed', async () => {
    const map = await ProjectMapService.live(null);
    expect(map.nodes.map((n) => n.key)).toContain('task:wf-other');
    expect(map.nodes.some((n) => n.external)).toBe(false);
  });

  it('draws a workflow that is in two projects as its own on both maps', async () => {
    const agenda = (await knex('project').where({ identifier: 'p-agenda' }).first()).id;
    await join('task', 'wf-fetch', agenda);
    for (const project of ['p-cache', 'p-agenda']) {
      const fetch = (await ProjectMapService.live(project)).nodes.find((n) => n.key === 'task:wf-fetch')!;
      expect(fetch.external).toBeUndefined();
      expect(fetch.projects.map((p) => p.identifier).sort()).toEqual(['p-agenda', 'p-cache']);
    }
    await knex('project_task').where({ project_id: agenda, task_id: (await knex('task').where({ identifier: 'wf-fetch' }).first()).id }).delete();
  });
});

describe('what statuses are worked out from', () => {
  it("reads a workflow's draft mark, newest saved version and newest successful run", async () => {
    const fetch = (await knex('task').where({ identifier: 'wf-fetch' }).first()).id;
    const purge = (await knex('task').where({ identifier: 'wf-purge' }).first()).id;
    await knex('task').where({ id: purge }).update({ metadata: JSON.stringify({ draft: true }) });
    await knex('task_revision').insert([
      { task_id: fetch, source: '{}', origin: 'created', created_at: '2026-11-01T10:00:00.000Z' },
      { task_id: fetch, source: '{}', origin: 'edit', created_at: '2026-11-02T10:00:00.000Z' },
    ]);
    await knex('pipeline').insert([
      { identifier: 'run-1', task_id: fetch, status: 'completed', source: '{}', started_at: '2026-11-03 09:00:00', finished_at: '2026-11-03T09:01:00.000Z' },
      { identifier: 'run-2', task_id: fetch, status: 'failed', source: '{}', started_at: '2026-11-04 09:00:00' },
    ]);
    const map = await ProjectMapService.live('p-cache');
    expect(map.nodes.find((n) => n.key === 'task:wf-fetch')).toMatchObject({
      draft: false,
      changedAt: '2026-11-02T10:00:00.000Z',
      lastSuccessAt: '2026-11-03T09:01:00.000Z',
    });
    expect(map.nodes.find((n) => n.key === 'task:wf-purge')).toMatchObject({ draft: true, lastSuccessAt: null });
    expect(map.nodes.find((n) => n.key === 'schedule:s-daily')).toMatchObject({ enabled: true });
    await knex('task').where({ id: purge }).update({ metadata: null });
  });

  it('reads SQLite, ISO and millisecond times alike', () => {
    expect(isoTime('2026-11-03 09:00:00')).toBe('2026-11-03T09:00:00.000Z');
    expect(isoTime('2026-11-03T09:00:00.000Z')).toBe('2026-11-03T09:00:00.000Z');
    expect(isoTime(Date.UTC(2026, 10, 3, 9))).toBe('2026-11-03T09:00:00.000Z');
    expect(isoTime('nope')).toBeNull();
    expect(isoTime(null)).toBeNull();
  });
});

describe('linking outside the project', () => {
  it('lists every workflow, app and global as something to link to, but no schedules', async () => {
    const keys = (await ProjectMapService.linkCandidates()).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['task:wf-other', 'task:wf-sites', 'app:app-console', 'global:cacheConfig']));
    // A schedule starts one workflow: a planned one is always made new, never linked.
    expect(keys.some((k) => k.startsWith('schedule:'))).toBe(false);
    const helper = (await ProjectMapService.linkCandidates()).find((c) => c.key === 'task:wf-sites')!;
    expect(helper).toMatchObject({ kind: 'helper', projects: ['Agenda'] });
  });

  it("puts what a plan node was linked to on the map, even from another project or an unused global", async () => {
    await knex('global_variable').insert({ identifier: 'g2', name: 'unused', type: 'string', value: '""' });
    const map = await ProjectMapService.live('p-cache', ['task:wf-other', 'global:unused', 'task:gone']);
    expect(map.nodes.find((n) => n.key === 'task:wf-other')).toMatchObject({ external: true });
    const unused = map.nodes.find((n) => n.key === 'global:unused');
    expect(unused).toMatchObject({ kind: 'global' });
    expect(unused!.missing).toBeFalsy();
    expect(map.nodes.some((n) => n.key === 'task:gone')).toBe(false);
  });
});

describe('ProjectMapService plans', () => {
  it('starts empty, saves, and drops lines to planned nodes that are gone', async () => {
    expect((await ProjectMapService.getPlan('p-cache')).nodes).toEqual([]);
    const saved = await ProjectMapService.savePlan('p-cache', {
      nodes: [{ id: 'n1', kind: 'workflow', name: 'Warm cache' }],
      edges: [
        { id: 'e1', from: 'app:app-console', to: 'plan:n1', kind: 'runs' },
        { id: 'e2', from: 'app:app-console', to: 'plan:gone', kind: 'runs' },
      ],
    });
    expect(saved.edges.map((e) => e.id)).toEqual(['e1']);
    expect(saved.nodes[0]).toMatchObject({ inputs: [], outputs: [] });
    expect((await ProjectMapService.getPlan('p-cache')).edges).toHaveLength(1);
    expect(await ProjectMapService.allPlans()).toHaveProperty('p-cache');
  });

  it('refuses a plan that is not one', async () => {
    await expect(ProjectMapService.savePlan('p-cache', { nodes: [{ id: 'x', kind: 'robot', name: 'A' }] })).rejects.toThrow(/Invalid map/);
    await expect(
      ProjectMapService.savePlan('p-cache', {
        nodes: [
          { id: 'x', kind: 'app', name: 'A' },
          { id: 'x', kind: 'app', name: 'B' },
        ],
      })
    ).rejects.toThrow(/share an id/);
    await expect(ProjectMapService.getPlan('nope')).rejects.toThrow(/Project not found/);
  });

  it('links a planned node to what it became', async () => {
    const plan = await ProjectMapService.link('p-cache', 'n1', 'task:wf-fetch');
    expect(plan.nodes[0]).toMatchObject({ link: 'task:wf-fetch' });
    await expect(ProjectMapService.link('p-cache', 'missing', 'task:x')).rejects.toThrow(/not found/);
  });

  it('adds what a planned card is linked to to the project, keeping its other projects', async () => {
    const plan = await ProjectMapService.getPlan('p-cache');
    plan.nodes.push({ id: 'n2', kind: 'workflow', name: 'Other', inputs: [], outputs: [] });
    plan.nodes.push({ id: 'n3', kind: 'app', name: 'Planned app', inputs: [], outputs: [] });
    await ProjectMapService.savePlan('p-cache', plan);
    await ProjectMapService.link('p-cache', 'n2', 'task:wf-other');
    expect(await projectsOf('wf-other')).toEqual(['p-agenda', 'p-cache']);
    expect((await ProjectMapService.live('p-cache')).nodes.find((n) => n.key === 'task:wf-other')!.external).toBeUndefined();
  });

  it("doesn't put back a linked workflow someone took out of the project when the map is saved again", async () => {
    const cache = (await knex('project').where({ identifier: 'p-cache' }).first()).id;
    const other = (await knex('task').where({ identifier: 'wf-other' }).first()).id;
    await knex('project_task').where({ project_id: cache, task_id: other }).delete();
    await ProjectMapService.savePlan('p-cache', await ProjectMapService.getPlan('p-cache'));
    expect(await projectsOf('wf-other')).toEqual(['p-agenda']);
  });

  it('goes with its project', async () => {
    const id = (await knex('project').where({ identifier: 'p-cache' }).first()).id;
    await knex('project').where({ id }).delete();
    expect(await knex('project_map').where({ project_id: id })).toEqual([]);
  });
});
