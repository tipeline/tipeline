import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { ProjectService } from '@database/services/ProjectService';

// Real in-memory SQLite with the real migrations: adding a workflow or app to a project
// brings along the sub-workflows that are in no project, and leaves other projects' alone.
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
  for (const table of ['task', 'app', 'project']) await knex(table).del();
  [testing] = await knex('project').insert({ identifier: 'p-test', name: 'Testing' });
  [ops] = await knex('project').insert({ identifier: 'p-ops', name: 'Ops' });
  await knex('task').insert([
    // parent → child → grandchild (all loose), parent → shared (owned by Ops) → ops-only (loose)
    { identifier: 'wf-parent', name: 'Parent', source: workflowSource(step('wf-child'), step('wf-shared')) },
    { identifier: 'wf-child', name: 'Child', source: workflowSource({ group: 'flow', name: 'ifConditional', params: { actions: [step('wf-grand')] } }) },
    { identifier: 'wf-grand', name: 'Grandchild', source: workflowSource() },
    { identifier: 'wf-shared', name: 'Shared', source: workflowSource(step('wf-ops-only')), project_id: ops },
    { identifier: 'wf-ops-only', name: 'Ops only', source: workflowSource() },
    { identifier: 'wf-app', name: 'App workflow', source: workflowSource(step('wf-grand')) },
  ]);
  await knex('app').insert({ identifier: 'app-log', name: 'Activity Log', source: appSource('wf-app', 'wf-shared') });
});

const projectOf = async (identifier: string, table = 'task') =>
  (await knex(table).where({ identifier }).first()).project_id ?? null;

describe('ProjectService.assignTask', () => {
  it('brings along loose sub-workflows at any depth, and reports them', async () => {
    const result: any = await ProjectService.assignTask('p-test', 'wf-parent');

    expect(await projectOf('wf-parent')).toBe(testing);
    expect(await projectOf('wf-child')).toBe(testing);
    expect(await projectOf('wf-grand')).toBe(testing);
    expect(result.alsoAdded.map((w: any) => w.name).sort()).toEqual(['Child', 'Grandchild']);
  });

  it("leaves a sub-workflow another project owns, and doesn't follow into it", async () => {
    await ProjectService.assignTask('p-test', 'wf-parent');

    expect(await projectOf('wf-shared')).toBe(ops);
    expect(await projectOf('wf-ops-only')).toBeNull();
  });
});

describe('ProjectService.assignApp', () => {
  it("brings along the app's loose workflows and what they run", async () => {
    const result: any = await ProjectService.assignApp('p-test', 'app-log');

    expect(await projectOf('app-log', 'app')).toBe(testing);
    expect(await projectOf('wf-app')).toBe(testing);
    expect(await projectOf('wf-grand')).toBe(testing);
    expect(await projectOf('wf-shared')).toBe(ops);
    expect(result.alsoAdded.map((w: any) => w.name).sort()).toEqual(['App workflow', 'Grandchild']);
  });
});
