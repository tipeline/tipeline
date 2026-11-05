import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { TaskService } from '@database/services/TaskService';
import { TaskRevisionService, KEEP_ALL_DAYS } from '@database/services/TaskRevisionService';

// Real in-memory SQLite with the real migrations: what matters is which versions end
// up stored after each kind of write.
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

beforeEach(async () => {
  await knex('task_revision').del();
  await knex('task').del();
});
afterEach(() => {
  vi.useRealTimers();
});

const step = (group: string, name: string, extra: Record<string, unknown> = {}) => ({ group, name, ...extra });
const source = (actions: any[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: 'Flow', ...extra, pipeline: { variables: [], actions } });

const revisions = (taskId: number) => knex('task_revision').where({ task_id: taskId }).orderBy('id');

describe('TaskRevisionService', () => {
  it('records the first version when a workflow is installed', async () => {
    const task = await TaskService.install({ name: 'Flow', source: source([step('log', 'info')]) });
    const rows = await revisions(task.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe('created');
  });

  it('keeps what a workflow held before its first recorded save', async () => {
    const before = source([step('log', 'info')]);
    const [id] = await knex('task').insert({ identifier: 'old', name: 'Flow', source: before, updated_at: '2026-09-01 08:00:00' });
    await TaskService.updateSource('old', source([step('log', 'info'), step('http', 'request')]));

    const rows = await revisions(id);
    expect(rows.map((r) => r.origin)).toEqual(['earlier', 'edit']);
    expect(rows[0].source).toBe(before);
    expect(rows[0].created_at).toBe('2026-09-01T08:00:00.000Z');
  });

  it('merges edits saved close together, and summarizes the whole burst', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
    const task = await TaskService.install({ name: 'Flow', source: source([step('log', 'info')]) });
    vi.setSystemTime(new Date('2026-10-24T10:00:30Z'));
    await TaskService.updateSource(task.identifier, source([step('log', 'info'), step('http', 'request')]));
    vi.setSystemTime(new Date('2026-10-24T10:01:00Z'));
    await TaskService.updateSource(task.identifier, source([step('log', 'info'), step('http', 'request'), step('file', 'write')]));

    const list = await TaskRevisionService.list(task.id);
    expect(list.map((r) => r.origin)).toEqual(['edit', 'created']);
    expect(list[0].summary).toMatchObject({ added: ['http.request', 'file.write'], addedCount: 2, removedCount: 0 });
    expect(list[0].current).toBe(true);

    vi.setSystemTime(new Date('2026-10-24T10:05:00Z'));
    await TaskService.updateSource(task.identifier, source([step('log', 'info')]));
    expect(await TaskRevisionService.list(task.id)).toHaveLength(3);
  });

  it('skips a save that changed nothing', async () => {
    const original = source([step('log', 'info')]);
    const task = await TaskService.install({ name: 'Flow', source: original });
    await TaskService.updateSource(task.identifier, original);
    expect(await revisions(task.id)).toHaveLength(1);
  });

  it('never merges hub updates, restores or reloads into an edit', async () => {
    const task = await TaskService.install({ name: 'Flow', source: source([step('log', 'info')]) });
    await TaskService.updateSource(task.identifier, source([step('a', 'b')]));
    await TaskService.markSynced(task.identifier, '2.0.0', source([step('c', 'd')], { version: '2.0.0' }));
    await TaskService.updateSource(task.identifier, source([step('e', 'f')]));
    expect((await revisions(task.id)).map((r) => r.origin)).toEqual(['created', 'edit', 'hub', 'edit']);
  });

  it('records a metadata edit', async () => {
    const task = await TaskService.install({ name: 'Flow', source: source([step('log', 'info')]) });
    await TaskService.updateMeta(task.identifier, { description: 'Now with words' });
    const list = await TaskRevisionService.list(task.id);
    expect(list[0].summary).toMatchObject({ details: true, variables: false, changed: 0, addedCount: 0 });
  });

  it('summarizes removed and changed steps, matching builder steps by identifier', () => {
    const before = source([
      step('log', 'info', { identifier: 'a', params: { message: 'hi' } }),
      step('http', 'request', { identifier: 'b' }),
    ]);
    const after = source([step('log', 'info', { identifier: 'a', params: { message: 'hello' } })]);
    expect(TaskRevisionService.summarize(before, after)).toMatchObject({
      added: [],
      removed: ['http.request'],
      changed: 1,
      details: false,
    });
  });

  it('thins versions older than the keep-all window to one per day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-01T09:00:00Z'));
    const task = await TaskService.install({ name: 'Flow', source: source([step('s', '0')]) });
    for (let i = 1; i <= 3; i++) {
      vi.setSystemTime(new Date(`2026-08-01T${9 + i}:00:00Z`));
      await TaskService.updateSource(task.identifier, source([step('s', String(i))]));
    }
    vi.setSystemTime(new Date('2026-08-02T09:00:00Z'));
    await TaskService.updateSource(task.identifier, source([step('s', '4')]));
    expect(await revisions(task.id)).toHaveLength(5);

    vi.setSystemTime(new Date(Date.parse('2026-08-02T09:00:00Z') + (KEEP_ALL_DAYS + 2) * 86400000));
    await TaskService.updateSource(task.identifier, source([step('s', '5')]));
    const kept = await revisions(task.id);
    // Aug 1: only the last one; Aug 2: its one; and today's.
    expect(kept.map((r) => JSON.parse(r.source).pipeline.actions[0].name)).toEqual(['3', '4', '5']);
  });

  it('goes away with its workflow', async () => {
    const task = await TaskService.install({ name: 'Flow', source: source([step('log', 'info')]) });
    await knex.raw('PRAGMA foreign_keys = ON');
    await TaskService.uninstall(task.identifier);
    expect(await revisions(task.id)).toHaveLength(0);
  });
});
