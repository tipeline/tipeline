import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { TaskService } from '@database/services/TaskService';
import { TrashService, TRASH_KEEP_DAYS } from '@database/services/TrashService';

// Real in-memory SQLite with the real migrations, foreign keys on as in Core: the
// point is what survives the delete's cascades and what a restore puts back.
let knex: Knex;

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
  for (const table of ['trash_item', 'task_revision', 'schedule', 'pipeline', 'task_tag', 'tag', 'task_hub_link', 'app_hub_link', 'task', 'app', 'project', 'hub']) {
    await knex(table).del();
  }
});
afterEach(() => {
  vi.useRealTimers();
});

const source = (message: string) =>
  JSON.stringify({ name: 'Flow', pipeline: { variables: [], actions: [{ group: 'math', name: 'sum', params: { message } }] } });

async function workflowWithEverything() {
  await knex('hub').insert({ id: 'hub-1', name: 'Hub', type: 'local_folder', target: '/tmp/hub' });
  const [projectId] = await knex('project').insert({ identifier: 'proj-1', name: 'Ops' });
  const task = await TaskService.install({
    name: 'Flow',
    source: source('first'),
    tags: ['Reports', 'daily'],
    metadata: { image: 'assets/tasks/flow.png' },
  });
  await knex('task').where({ id: task.id }).update({ project_id: projectId });
  await TaskService.updateSource(task.identifier, source('second'));
  await knex('task_hub_link').insert({ task_id: task.id, hub_id: 'hub-1', hub_task_identifier: 'hub-flow', hub_version: '1.0.0' });
  await knex('schedule').insert({ identifier: 'sch-1', task_id: task.id, cron: '0 9 * * *', enabled: true, variables: '{}' });
  await knex('pipeline').insert({ identifier: 'run-1', task_id: task.id, status: 'completed', source: '{}' });
  return task;
}

describe('TrashService', () => {
  it('moves a workflow to the Trash: gone from everywhere, listed in the Trash', async () => {
    const task = await workflowWithEverything();
    await TrashService.trash('task', task.identifier);

    expect(await TaskService.getByIdentifier(task.identifier)).toBeUndefined();
    expect(await knex('schedule').count('* as n').first()).toMatchObject({ n: 0 });
    expect(await knex('pipeline').count('* as n').first()).toMatchObject({ n: 0 });

    const [item] = await TrashService.list();
    expect(item).toMatchObject({
      kind: 'task',
      identifier: task.identifier,
      name: 'Flow',
      image: 'assets/tasks/flow.png',
      projectName: 'Ops',
      schedules: 1,
      versions: 2,
    });
    expect(Date.parse(item.expiresAt) - Date.parse(item.deletedAt)).toBe(TRASH_KEEP_DAYS * 86400000);
  });

  it('restores a workflow with its identifier, project, tags, hub link and versions; schedules off; runs gone', async () => {
    const task = await workflowWithEverything();
    const id = await TrashService.trash('task', task.identifier);
    expect(await TrashService.restore(id)).toMatchObject({ kind: 'task', identifier: task.identifier });

    const restored = await TaskService.getByIdentifier(task.identifier);
    expect(restored).toMatchObject({ name: 'Flow', project_identifier: 'proj-1', hub_id: 'hub-1', hub_version: '1.0.0' });
    expect(restored.tags.sort()).toEqual(['daily', 'reports']);
    expect(restored.metadata).toMatchObject({ image: 'assets/tasks/flow.png' });
    expect(JSON.parse(restored.source).pipeline.actions[0].params.message).toBe('second');

    const versions = await knex('task_revision').where({ task_id: restored.id }).orderBy('id');
    expect(versions.map((v) => v.origin)).toEqual(['created', 'edit']);
    const [schedule] = await knex('schedule').where({ task_id: restored.id });
    expect(schedule).toMatchObject({ identifier: 'sch-1', cron: '0 9 * * *', enabled: 0 });
    expect(await knex('pipeline').count('* as n').first()).toMatchObject({ n: 0 });
    expect(await TrashService.list()).toEqual([]);
  });

  it('keeps a restored version pointing at the version it put back', async () => {
    const task = await TaskService.install({ name: 'Flow', source: source('a') });
    await TaskService.updateSource(task.identifier, source('b'));
    const [first] = await knex('task_revision').where({ task_id: task.id }).orderBy('id');
    await TaskService.updateSource(task.identifier, source('a'), 'restore', { restoredFrom: first.id });

    await TrashService.restore(await TrashService.trash('task', task.identifier));
    const restored = await TaskService.getByIdentifier(task.identifier);
    const versions = await knex('task_revision').where({ task_id: restored.id }).orderBy('id');
    expect(versions[2].restored_from).toBe(versions[0].id);
  });

  it('restores without a project or hub that were deleted in the meantime', async () => {
    const task = await workflowWithEverything();
    const id = await TrashService.trash('task', task.identifier);
    await knex('project').del();
    await knex('hub').del();

    await TrashService.restore(id);
    const restored = await TaskService.getByIdentifier(task.identifier);
    expect(restored).toMatchObject({ project_id: null, source_type: 'local' });
  });

  it("refuses to restore over a workflow that now has the same identifier", async () => {
    const task = await TaskService.install({ name: 'Flow', source: source('a') });
    const id = await TrashService.trash('task', task.identifier);
    await knex('task').insert({ identifier: task.identifier, name: 'Other', source: source('b') });
    await expect(TrashService.restore(id)).rejects.toThrow(/already exists/);
    expect(await TrashService.list()).toHaveLength(1);
  });

  it('moves an app to the Trash and back, with its hub link', async () => {
    await knex('hub').insert({ id: 'hub-1', name: 'Hub', type: 'local_folder', target: '/tmp/hub' });
    const [appId] = await knex('app').insert({ identifier: 'app-1', name: 'Board', source: '{"pages":[]}' });
    await knex('app_hub_link').insert({ app_id: appId, hub_id: 'hub-1', hub_app_identifier: 'hub-board' });

    const id = await TrashService.trash('app', 'app-1');
    expect(await knex('app').where({ identifier: 'app-1' }).first()).toBeUndefined();
    expect(await knex('app_hub_link').count('* as n').first()).toMatchObject({ n: 0 });

    await TrashService.restore(id);
    const app = await knex('app').where({ identifier: 'app-1' }).first();
    expect(app).toMatchObject({ name: 'Board', source: '{"pages":[]}' });
    expect(await knex('app_hub_link').where({ app_id: app.id }).first()).toMatchObject({ hub_app_identifier: 'hub-board' });
  });

  it('fails for something that does not exist', async () => {
    await expect(TrashService.trash('task', 'nope')).rejects.toThrow(/not found/);
  });

  it('deletes for good, one item or all, and purges what is past the keep window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T10:00:00Z'));
    const old = await TaskService.install({ name: 'Old', source: source('a') });
    await TrashService.trash('task', old.identifier);
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
    const recent = await TaskService.install({ name: 'Recent', source: source('b') });
    const recentId = await TrashService.trash('task', recent.identifier);

    expect(await TrashService.purgeExpired()).toEqual([{ kind: 'task', identifier: old.identifier }]);
    expect((await TrashService.list()).map((i) => i.name)).toEqual(['Recent']);

    expect(await TrashService.remove([recentId])).toEqual([{ kind: 'task', identifier: recent.identifier }]);
    expect(await TrashService.list()).toEqual([]);

    await TrashService.trash('task', (await TaskService.install({ name: 'X', source: source('c') })).identifier);
    expect(await TrashService.empty()).toHaveLength(1);
    expect(await TrashService.list()).toEqual([]);
  });
});
