import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { WorkflowUsageService, appWorkflowIdentifiers, calledWorkflowIdentifiers } from '@database/services/WorkflowUsageService';

// Against a real (in-memory) SQLite with the real migrations: which apps use which
// workflows, read from the apps' `workflows:` maps, across projects.
let knex: Knex;

const step = (identifier: string) => ({ group: 'subtask', name: 'exec', params: { identifier } });
const workflowSource = (...actions: any[]) => JSON.stringify({ pipeline: { actions } });

const appSource = (...identifiers: string[]) =>
  JSON.stringify({
    schemaVersion: 3,
    workflows: Object.fromEntries(identifiers.map((id, i) => [`wf${i + 1}`, { identifier: id }])),
    pages: [],
  });

beforeAll(async () => {
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);

  const [sales] = await knex('project').insert({ identifier: 'p-sales', name: 'Sales', color: '#f00' });
  const [ops] = await knex('project').insert({ identifier: 'p-ops', name: 'Ops' });

  await knex('task').insert([
    { identifier: 'wf-crm', name: 'CRM lookup', source: '{}' },
    { identifier: 'wf-mail', name: 'Send mail', source: '{}' },
    { identifier: 'wf-loose', name: 'Loose', source: '{}' },
    // Runs CRM lookup inside an If block, in Ops.
    {
      identifier: 'wf-report',
      name: 'Report',
      source: workflowSource({ group: 'flow', name: 'if', params: { statements: [{ actions: [step('wf-crm')] }] } }),
    },
    // No project; runs it at the top level and names CRM lookup only in text.
    { identifier: 'wf-digest', name: 'Digest', source: workflowSource(step('wf-crm'), { group: 'string', name: 'x', params: { value: 'wf-crm' } }) },
    // Templated identifier: can't be known, so it calls nothing.
    { identifier: 'wf-dynamic', name: 'Dynamic', source: workflowSource(step('{{ which }}')) },
    { identifier: 'wf-broken', name: 'Broken', source: '{not json wf-crm' },
  ]);
  const crm = (await knex('task').where({ identifier: 'wf-crm' }).first()).id;
  await knex('schedule').insert([
    { identifier: 's-hourly', task_id: crm, cron: '0 * * * *', variables: '{}', enabled: true },
    { identifier: 's-once', task_id: crm, run_at: '2026-11-01T09:00:00.000Z', variables: '{}', enabled: false },
  ]);
  await knex('app').insert([
    // Sales app: its own workflow, one from Ops and one with no project.
    { identifier: 'app-deals', name: 'Deals', source: appSource('wf-crm', 'wf-mail', 'wf-loose') },
    // Ops app reuses Sales' workflow.
    { identifier: 'app-desk', name: 'Desk', source: appSource('wf-crm') },
    // No project; the same workflow under two aliases counts once.
    { identifier: 'app-misc', name: 'Misc', source: appSource('wf-mail', 'wf-mail') },
    // Broken source: uses nothing, breaks nothing.
    { identifier: 'app-broken', name: 'Broken', source: '{not json' },
  ]);
  const member = async (table: 'task' | 'app', identifier: string, projectId: number) => {
    const { id } = await knex(table).where({ identifier }).first('id');
    await knex(table === 'task' ? 'project_task' : 'project_app').insert({ project_id: projectId, [`${table}_id`]: id });
  };
  await member('task', 'wf-crm', sales);
  await member('task', 'wf-mail', ops);
  await member('task', 'wf-report', ops);
  await member('app', 'app-deals', sales);
  await member('app', 'app-desk', ops);
  await member('app', 'app-broken', sales);
  // In both projects: Ops' apps don't borrow it, Sales' don't either.
  await knex('task').insert({ identifier: 'wf-both', name: 'Both', source: '{}' });
  await member('task', 'wf-both', sales);
  await member('task', 'wf-both', ops);
  await knex('app').insert({ identifier: 'app-both-user', name: 'Uses both', source: appSource('wf-both') });
  await member('app', 'app-both-user', ops);
});
afterAll(() => knex.destroy());

describe('appWorkflowIdentifiers', () => {
  it('reads the identifiers in the workflows map, once each', () => {
    expect(appWorkflowIdentifiers(appSource('a', 'b', 'a'))).toEqual(['a', 'b']);
  });

  it('treats a missing, broken or map-less source as using nothing', () => {
    expect(appWorkflowIdentifiers(null)).toEqual([]);
    expect(appWorkflowIdentifiers('{not json')).toEqual([]);
    expect(appWorkflowIdentifiers(JSON.stringify({ schemaVersion: 3, workflows: [] }))).toEqual([]);
  });

  it('migrates a v1 source (identifiers on page actions) first', () => {
    const v1 = { pages: [{ id: 'home', name: 'Home', events: { ready: [{ type: 'exec', taskIdentifier: 'wf-old' }] }, components: [] }] };
    expect(appWorkflowIdentifiers(JSON.stringify(v1))).toEqual(['wf-old']);
  });
});

describe('WorkflowUsageService.usedBy', () => {
  it('lists the apps using a workflow with their projects, by name', async () => {
    expect(await WorkflowUsageService.usedBy('wf-crm')).toEqual([
      { identifier: 'app-deals', name: 'Deals', projects: [{ identifier: 'p-sales', name: 'Sales', color: '#f00' }] },
      { identifier: 'app-desk', name: 'Desk', projects: [{ identifier: 'p-ops', name: 'Ops', color: null }] },
    ]);
    expect((await WorkflowUsageService.usedBy('wf-mail')).map((a) => a.identifier)).toEqual(['app-deals', 'app-misc']);
    expect(await WorkflowUsageService.usedBy('wf-unused')).toEqual([]);
  });
});

describe('WorkflowUsageService.sharedIntoProject', () => {
  it("lists workflows the project's apps use from another project or none, not its own", async () => {
    const shared = await WorkflowUsageService.sharedIntoProject('p-sales');
    expect(shared).toEqual([
      {
        identifier: 'wf-loose',
        name: 'Loose',
        description: null,
        projects: [],
        apps: [{ identifier: 'app-deals', name: 'Deals' }],
      },
      {
        identifier: 'wf-mail',
        name: 'Send mail',
        description: null,
        projects: [{ identifier: 'p-ops', name: 'Ops', color: null }],
        apps: [{ identifier: 'app-deals', name: 'Deals' }],
      },
    ]);
  });

  it('works the other way round, and is empty for a project without apps', async () => {
    // wf-both is in Ops too, so an Ops app using it isn't borrowing it.
    expect(
      (await WorkflowUsageService.sharedIntoProject('p-ops')).map((w) => [w.identifier, w.projects.map((p) => p.identifier)])
    ).toEqual([['wf-crm', ['p-sales']]]);
    expect(await WorkflowUsageService.sharedIntoProject('p-none')).toEqual([]);
  });
});

describe('calledWorkflowIdentifiers', () => {
  it('finds subtask identifiers at any depth, once each, skipping templated ones', () => {
    const source = { pipeline: { actions: [step('a'), { params: { actions: [step('b'), step('a')] } }, step('{= x =}')] } };
    expect(calledWorkflowIdentifiers(source)).toEqual(['a', 'b']);
    expect(calledWorkflowIdentifiers(JSON.stringify(source))).toEqual(['a', 'b']);
  });

  it('treats a missing or broken source as calling nothing', () => {
    expect(calledWorkflowIdentifiers(null)).toEqual([]);
    expect(calledWorkflowIdentifiers('{not json')).toEqual([]);
  });
});

describe('WorkflowUsageService.calledBy', () => {
  it('lists the workflows that run it as a sub-workflow, with their projects', async () => {
    expect(await WorkflowUsageService.calledBy('wf-crm')).toEqual([
      { identifier: 'wf-digest', name: 'Digest', projects: [] },
      { identifier: 'wf-report', name: 'Report', projects: [{ identifier: 'p-ops', name: 'Ops', color: null }] },
    ]);
    expect(await WorkflowUsageService.calledBy('wf-mail')).toEqual([]);
  });
});

describe('WorkflowUsageService.usage', () => {
  it('puts apps, calling workflows and schedules together', async () => {
    const usage = await WorkflowUsageService.usage('wf-crm');
    expect(usage.apps.map((a) => a.identifier)).toEqual(['app-deals', 'app-desk']);
    expect(usage.workflows.map((w) => w.identifier)).toEqual(['wf-digest', 'wf-report']);
    expect(usage.schedules).toEqual([
      { identifier: 's-hourly', cron: '0 * * * *', run_at: null, every_seconds: null, enabled: true },
      { identifier: 's-once', cron: null, run_at: '2026-11-01T09:00:00.000Z', every_seconds: null, enabled: false },
    ]);
    expect(await WorkflowUsageService.usage('wf-unused')).toEqual({ apps: [], workflows: [], schedules: [] });
  });
});
