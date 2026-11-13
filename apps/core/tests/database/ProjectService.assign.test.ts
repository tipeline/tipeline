import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { ProjectService } from '@database/services/ProjectService';

// Real in-memory SQLite with the real migrations: adding a workflow or app to a project
// brings along the sub-workflows that are in no project, and leaves ones already in a
// project where they are. A workflow can be in several projects.
let knex: Knex;

const step = (identifier: string) => ({ group: 'subtask', name: 'exec', params: { identifier } });
const workflowSource = (...actions: any[]) => JSON.stringify({ pipeline: { actions } });
const appSource = (...identifiers: string[]) =>
  JSON.stringify({
    schemaVersion: 3,
    workflows: Object.fromEntries(identifiers.map((id, i) => [`wf${i + 1}`, { identifier: id }])),
    pages: [],
  });

let testing: number;
let ops: number;

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

beforeEach(async () => {
  for (const table of ['project_task', 'project_app', 'task', 'app', 'project']) await knex(table).del();
  [testing] = await knex('project').insert({ identifier: 'p-test', name: 'Testing' });
  [ops] = await knex('project').insert({ identifier: 'p-ops', name: 'Ops' });
  await knex('task').insert([
    // parent → child → grandchild (all loose), parent → shared (owned by Ops) → ops-only (loose)
    { identifier: 'wf-parent', name: 'Parent', source: workflowSource(step('wf-child'), step('wf-shared')) },
    { identifier: 'wf-child', name: 'Child', source: workflowSource({ group: 'flow', name: 'ifConditional', params: { actions: [step('wf-grand')] } }) },
    { identifier: 'wf-grand', name: 'Grandchild', source: workflowSource() },
    { identifier: 'wf-shared', name: 'Shared', source: workflowSource(step('wf-ops-only')) },
    { identifier: 'wf-ops-only', name: 'Ops only', source: workflowSource() },
    { identifier: 'wf-app', name: 'App workflow', source: workflowSource(step('wf-grand')) },
  ]);
  const shared = await knex('task').where({ identifier: 'wf-shared' }).first('id');
  await knex('project_task').insert({ project_id: ops, task_id: shared.id });
  await knex('app').insert({ identifier: 'app-log', name: 'Activity Log', source: appSource('wf-app', 'wf-shared') });
});

/** The project ids it's in. */
const projectsOf = async (identifier: string, table: 'task' | 'app' = 'task') => {
  const row = await knex(table).where({ identifier }).first('id');
  const [link, fk] = table === 'task' ? ['project_task', 'task_id'] : ['project_app', 'app_id'];
  return (await knex(link).where({ [fk]: row.id }).orderBy('project_id').pluck('project_id')) as number[];
};

describe('ProjectService.assignTask', () => {
  it('brings along loose sub-workflows at any depth, and reports them', async () => {
    const result: any = await ProjectService.assignTask('p-test', 'wf-parent');

    expect(await projectsOf('wf-parent')).toEqual([testing]);
    expect(await projectsOf('wf-child')).toEqual([testing]);
    expect(await projectsOf('wf-grand')).toEqual([testing]);
    expect(result.alsoAdded.map((w: any) => w.name).sort()).toEqual(['Child', 'Grandchild']);
  });

  it("leaves a sub-workflow another project owns, and doesn't follow into it", async () => {
    await ProjectService.assignTask('p-test', 'wf-parent');

    expect(await projectsOf('wf-shared')).toEqual([ops]);
    expect(await projectsOf('wf-ops-only')).toEqual([]);
  });
});

describe('ProjectService.getByIdentifier', () => {
  it("lists a project's workflows and apps, and works for an empty project", async () => {
    await ProjectService.assignTask('p-test', 'wf-grand');
    await ProjectService.assignApp('p-ops', 'app-log');
    const testing: any = await ProjectService.getByIdentifier('p-test');
    expect(testing.tasks.map((t: any) => t.identifier)).toEqual(['wf-grand']);
    expect(testing.tasks[0]).toMatchObject({ name: 'Grandchild' });
    const ops: any = await ProjectService.getByIdentifier('p-ops');
    expect(ops.apps.map((a: any) => a.identifier)).toEqual(['app-log']);
    await ProjectService.create({ name: 'Empty' });
    const empty: any = await ProjectService.getByIdentifier((await knex('project').where({ name: 'Empty' }).first()).identifier);
    expect(empty).toMatchObject({ name: 'Empty', tasks: [], apps: [] });
  });
});

describe('ProjectService membership', () => {
  it('adds a workflow that is in another project without taking it out of that one', async () => {
    const result: any = await ProjectService.assignTask('p-test', 'wf-shared');
    expect(await projectsOf('wf-shared')).toEqual([testing, ops].sort((a, b) => a - b));
    // Its sub-workflow was loose: it comes along.
    expect(result.alsoAdded.map((w: any) => w.identifier)).toEqual(['wf-ops-only']);
  });

  it('adding twice changes nothing', async () => {
    await ProjectService.assignTask('p-ops', 'wf-shared');
    expect(await projectsOf('wf-shared')).toEqual([ops]);
  });

  it('takes it out of one project only', async () => {
    await ProjectService.assignTask('p-test', 'wf-shared');
    await ProjectService.unassignTask('p-ops', 'wf-shared');
    expect(await projectsOf('wf-shared')).toEqual([testing]);
  });

  it('takes an app out of one project only', async () => {
    await ProjectService.assignApp('p-test', 'app-log');
    await ProjectService.assignApp('p-ops', 'app-log');
    await ProjectService.unassignApp('p-test', 'app-log');
    expect(await projectsOf('app-log', 'app')).toEqual([ops]);
  });
});

describe('ProjectService.assignApp', () => {
  it("brings along the app's loose workflows and what they run", async () => {
    const result: any = await ProjectService.assignApp('p-test', 'app-log');

    expect(await projectsOf('app-log', 'app')).toEqual([testing]);
    expect(await projectsOf('wf-app')).toEqual([testing]);
    expect(await projectsOf('wf-grand')).toEqual([testing]);
    expect(await projectsOf('wf-shared')).toEqual([ops]);
    expect(result.alsoAdded.map((w: any) => w.name).sort()).toEqual(['App workflow', 'Grandchild']);
  });
});
