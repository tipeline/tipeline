import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { ProjectService } from '@database/services/ProjectService';
import { TrashService } from '@database/services/TrashService';

// Real in-memory SQLite with the real migrations, foreign keys on as in Core: deleting a
// project with or without its workflows and apps, and what the preview reports.
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
  await knex.raw('PRAGMA foreign_keys = ON');
  Model.knex(knex);
});
afterAll(() => knex.destroy());

beforeEach(async () => {
  for (const table of ['trash_item', 'schedule', 'project_task', 'project_app', 'task', 'app', 'project']) await knex(table).del();

  const [sales] = await knex('project').insert({ identifier: 'p-sales', name: 'Sales', color: '#f00' });
  const [ops] = await knex('project').insert({ identifier: 'p-ops', name: 'Ops' });
  await knex('task').insert([
    // Sales: one workflow used only inside, one used by Ops too, one nobody uses.
    { identifier: 'wf-crm', name: 'CRM lookup', source: '{}' },
    { identifier: 'wf-quote', name: 'Quote', source: workflowSource(step('wf-crm')) },
    { identifier: 'wf-idle', name: 'Idle', source: '{}' },
    { identifier: 'wf-report', name: 'Report', source: workflowSource(step('wf-quote')) },
    // In both projects.
    { identifier: 'wf-both', name: 'Both', source: '{}' },
  ]);
  await knex('app').insert([
    { identifier: 'app-deals', name: 'Deals', source: appSource('wf-crm') },
    { identifier: 'app-desk', name: 'Desk', source: appSource('wf-crm') },
  ]);
  const taskId = async (identifier: string) => (await knex('task').where({ identifier }).first('id')).id;
  const appId = async (identifier: string) => (await knex('app').where({ identifier }).first('id')).id;
  await knex('project_task').insert([
    { project_id: sales, task_id: await taskId('wf-crm') },
    { project_id: sales, task_id: await taskId('wf-quote') },
    { project_id: sales, task_id: await taskId('wf-idle') },
    { project_id: ops, task_id: await taskId('wf-report') },
    { project_id: sales, task_id: await taskId('wf-both') },
    { project_id: ops, task_id: await taskId('wf-both') },
  ]);
  await knex('project_app').insert([
    { project_id: sales, app_id: await appId('app-deals') },
    { project_id: ops, app_id: await appId('app-desk') },
  ]);
  const crm = (await knex('task').where({ identifier: 'wf-crm' }).first()).id;
  await knex('schedule').insert({ identifier: 's-1', task_id: crm, cron: '0 9 * * *', variables: '{}', enabled: true });
});

describe('ProjectService.deletePreview', () => {
  it("lists the project's workflows with everything that uses them, and its apps", async () => {
    const preview = await ProjectService.deletePreview('p-sales');
    expect(preview?.name).toBe('Sales');
    expect(preview?.apps).toEqual([{ identifier: 'app-deals', name: 'Deals', alsoIn: [] }]);

    const byId = Object.fromEntries((preview?.workflows ?? []).map((w) => [w.identifier, w]));
    expect(Object.keys(byId)).toEqual(['wf-both', 'wf-crm', 'wf-idle', 'wf-quote']);
    expect(byId['wf-both'].alsoIn).toEqual([{ identifier: 'p-ops', name: 'Ops' }]);
    expect(byId['wf-crm'].alsoIn).toEqual([]);
    expect(byId['wf-crm'].apps.map((a) => [a.identifier, a.projects.map((p) => p.identifier)])).toEqual([
      ['app-deals', ['p-sales']],
      ['app-desk', ['p-ops']],
    ]);
    expect(byId['wf-crm'].workflows.map((w) => w.identifier)).toEqual(['wf-quote']);
    expect(byId['wf-crm'].schedules.map((s) => s.identifier)).toEqual(['s-1']);
    expect(byId['wf-quote'].workflows).toEqual([
      { identifier: 'wf-report', name: 'Report', projects: [{ identifier: 'p-ops', name: 'Ops', color: null }] },
    ]);
    expect(byId['wf-idle']).toMatchObject({ apps: [], workflows: [], schedules: [] });
  });

  it('is null for a project that does not exist', async () => {
    expect(await ProjectService.deletePreview('p-none')).toBeNull();
  });
});

describe('ProjectService.delete', () => {
  const projectsOf = async (identifier: string) =>
    await knex('project_task')
      .join('task', 'task.id', 'project_task.task_id')
      .join('project', 'project.id', 'project_task.project_id')
      .where('task.identifier', identifier)
      .pluck('project.identifier');

  it('keeps the workflows and apps by default, out of the project and still in any others', async () => {
    await ProjectService.delete('p-sales');
    expect(await knex('project').where({ identifier: 'p-sales' }).first()).toBeUndefined();
    expect(await projectsOf('wf-crm')).toEqual([]);
    expect(await projectsOf('wf-both')).toEqual(['p-ops']);
    expect(await knex('project_app').count({ n: '*' }).first()).toEqual({ n: 1 });
    expect(await knex('trash_item').count({ n: '*' }).first()).toEqual({ n: 0 });
  });

  it('refuses to delete a workflow that is also in another project', async () => {
    await expect(ProjectService.delete('p-sales', { workflows: ['wf-both'] })).rejects.toThrow(
      'Workflow "wf-both" is also in Ops, so it\'s kept'
    );
    expect(await knex('project').where({ identifier: 'p-sales' }).first()).toBeDefined();
  });

  it('moves the named workflows and apps to the Trash and keeps the rest', async () => {
    const result = await ProjectService.delete('p-sales', { workflows: ['wf-idle', 'wf-quote'], apps: ['app-deals'] });
    expect(result).toEqual({ identifier: 'p-sales', workflows: ['wf-idle', 'wf-quote'], apps: ['app-deals'] });

    expect(await knex('task').orderBy('identifier').pluck('identifier')).toEqual(['wf-both', 'wf-crm', 'wf-report']);
    expect(await knex('app').orderBy('identifier').pluck('identifier')).toEqual(['app-desk']);
    expect(await projectsOf('wf-crm')).toEqual([]);
    expect((await TrashService.list()).map((i) => [i.kind, i.identifier]).sort()).toEqual([
      ['app', 'app-deals'],
      ['task', 'wf-idle'],
      ['task', 'wf-quote'],
    ]);
  });

  it("refuses an item that isn't in the project, before changing anything", async () => {
    await expect(ProjectService.delete('p-sales', { workflows: ['wf-idle', 'wf-report'] })).rejects.toThrow(
      'Workflow "wf-report" isn\'t in this project'
    );
    await expect(ProjectService.delete('p-sales', { apps: ['app-desk'] })).rejects.toThrow(
      'App "app-desk" isn\'t in this project'
    );
    expect(await knex('project').where({ identifier: 'p-sales' }).first()).toBeDefined();
    expect(await knex('task').where({ identifier: 'wf-idle' }).first()).toBeDefined();
  });

  it('restores a trashed workflow into no project once the project is gone', async () => {
    await ProjectService.delete('p-sales', { workflows: ['wf-crm'] });
    const [item] = await TrashService.list();
    await TrashService.restore(item.id);
    const restored = await knex('task').where({ identifier: 'wf-crm' }).first();
    expect(await projectsOf('wf-crm')).toEqual([]);
    expect(await knex('schedule').where({ task_id: restored.id }).pluck('enabled')).toEqual([0]);
  });
});
