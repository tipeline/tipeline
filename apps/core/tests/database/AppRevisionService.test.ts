import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import Core from '@engine/Core';
import { AppService } from '@database/services/AppService';
import { AppRevisionService } from '@database/services/AppRevisionService';
import { TaskService } from '@database/services/TaskService';
import { TrashService } from '@database/services/TrashService';

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
  await knex('app_revision').del();
  await knex('app_hub_link').del();
  await knex('app').del();
  await knex('trash_item').del();
});
afterEach(() => {
  vi.useRealTimers();
});

const layout = { x: 0, y: 0, w: 4, h: 4 };
const text = (id: string, content = 'Hello') => ({ id, type: 'text', name: id, layout, props: { content } });
const page = (id: string, components: any[] = [], extra: Record<string, unknown> = {}) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  showInMenu: true,
  runnables: {},
  events: {},
  components,
  ...extra,
});
const app = (pages: any[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ schemaVersion: 4, version: '1.0.0', workflows: {}, state: {}, pages, ...extra });

const revisions = (appId: number) => knex('app_revision').where({ app_id: appId }).orderBy('id');

describe('AppRevisionService', () => {
  it('records the first version when an app is created', async () => {
    const created = await AppService.install({ name: 'App', source: app([page('home')]) });
    const rows = await revisions(created.id);
    expect(rows.map((r) => r.origin)).toEqual(['created']);
  });

  it('keeps what an app held before its first recorded save', async () => {
    const before = app([page('home')]);
    const [id] = await knex('app').insert({ identifier: 'old', name: 'App', source: before, updated_at: '2026-09-01 08:00:00' });
    await AppService.updateSource('old', app([page('home', [text('title')])]));

    const rows = await revisions(id);
    expect(rows.map((r) => r.origin)).toEqual(['earlier', 'edit']);
    expect(rows[0].source).toBe(before);
    expect(rows[0].created_at).toBe('2026-09-01T08:00:00.000Z');
  });

  it('merges builder saves close together, and summarizes the whole burst', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
    const created = await AppService.install({ name: 'App', source: app([page('home')]) });

    vi.setSystemTime(new Date('2026-11-26T10:00:30Z'));
    await AppService.updateSource(created.identifier, app([page('home', [text('title')])]));
    vi.setSystemTime(new Date('2026-11-26T10:01:00Z'));
    await AppService.updateSource(created.identifier, app([page('home', [text('title'), text('intro')])]));

    const list = await AppRevisionService.list(created.id);
    expect(list.map((r) => r.origin)).toEqual(['edit', 'created']);
    expect(list[0].summary).toMatchObject({ added: ['title (text)', 'intro (text)'], addedCount: 2 });

    // Past the merge window: a new version.
    vi.setSystemTime(new Date('2026-11-26T10:05:00Z'));
    await AppService.updateSource(created.identifier, app([page('home', [text('title')])]));
    expect((await AppRevisionService.list(created.id)).map((r) => r.origin)).toEqual(['edit', 'edit', 'created']);
  });

  it('records nothing when the source did not change', async () => {
    const source = app([page('home')]);
    const created = await AppService.install({ name: 'App', source });
    await AppService.updateSource(created.identifier, source);
    expect(await revisions(created.id)).toHaveLength(1);
  });

  it('records hub installs and hub updates', async () => {
    await knex('hub').insert({ id: 'h1', name: 'Hub', type: 'local_folder', target: '/tmp/hub' }).onConflict('id').ignore();
    const installed = await AppService.installFromHub({
      name: 'App',
      source: app([page('home')]),
      hub_id: 'h1',
      hub_app_identifier: 'app',
      hub_version: '1.0.0',
    });
    await AppService.markSynced(installed.identifier, { source: app([page('home', [text('title')])]), hubVersion: '1.1.0' });
    expect((await revisions(installed.id)).map((r) => r.origin)).toEqual(['hub', 'hub']);
  });
});

describe('AppRevisionService.summarize', () => {
  it('names pages and components added and removed, and counts edited components', () => {
    const before = app([page('home', [text('title'), text('old')]), page('settings')]);
    const after = app([page('home', [text('title', 'Changed'), text('chart')]), page('reports')]);
    expect(AppRevisionService.summarize(before, after)).toEqual({
      pagesAdded: ['Reports'],
      pagesRemoved: ['Settings'],
      added: ['chart (text)'],
      removed: ['old (text)'],
      addedCount: 1,
      removedCount: 1,
      changed: 1,
      workflows: false,
      details: false,
    });
  });

  it('tells workflow changes apart from other settings', () => {
    const before = app([page('home')]);
    const withWorkflow = app([page('home')], { workflows: { orders: { identifier: 'wf1' } } });
    expect(AppRevisionService.summarize(before, withWorkflow)).toMatchObject({ workflows: true, details: false });

    const renamed = app([page('home', [], { name: 'Start' })]);
    expect(AppRevisionService.summarize(before, renamed)).toMatchObject({ workflows: false, details: true });
  });

  it('counts a page moved in the menu as a settings change', () => {
    const before = app([page('home'), page('reports')]);
    const after = app([page('reports'), page('home')]);
    expect(AppRevisionService.summarize(before, after)).toMatchObject({ details: true, changed: 0, pagesAdded: [] });
  });
});

describe('Core app versions', () => {
  it('puts an old version back as a new version, keeping the one it replaced', async () => {
    const created = await Core.appNew({ name: 'App' });
    await Core.appUpdateSource(created.identifier, app([page('home', [text('title')])]));
    const [, first] = await Core.appRevisionList(created.identifier);

    const restored = await Core.appRevisionRestore(created.identifier, first.id);
    expect(JSON.parse(restored!.source!).pages[0].components).toEqual([]);

    const list = await Core.appRevisionList(created.identifier);
    expect(list.map((r) => r.origin)).toEqual(['restore', 'edit', 'created']);
    expect(list[0]).toMatchObject({ restoredFrom: first.id, current: true });
  });

  it('lists the workflows a version uses that are no longer installed', async () => {
    const task = await TaskService.install({
      name: 'Flow',
      source: JSON.stringify({ name: 'Flow', pipeline: { variables: [], actions: [] } }),
    });
    const created = await AppService.install({
      name: 'App',
      source: app([page('home')], { workflows: { kept: { identifier: task.identifier }, gone: { identifier: 'deleted' } } }),
    });
    const [version] = await Core.appRevisionList(created.identifier);
    const detail = await Core.appRevisionDetail(created.identifier, version.id);
    expect(detail.missingWorkflows).toEqual(['gone']);
  });

  it('refuses a version that is not this app’s', async () => {
    const one = await AppService.install({ name: 'One', source: app([page('home')]) });
    const two = await AppService.install({ name: 'Two', source: app([page('home')]) });
    const [version] = await Core.appRevisionList(one.identifier);
    await expect(Core.appRevisionRestore(two.identifier, version.id)).rejects.toThrow(/Version not found/);
  });
});

describe('Trash keeps app versions', () => {
  it('brings an app’s versions back when it is restored', async () => {
    const created = await AppService.install({ name: 'App', source: app([page('home')]) });
    await AppService.updateSource(created.identifier, app([page('home', [text('title')])]), 'restore', { restoredFrom: 0 });
    const before = await AppRevisionService.list(created.id);

    const trashId = await TrashService.trash('app', created.identifier);
    expect(await knex('app_revision').count('* as n').first()).toEqual({ n: 0 });
    expect((await TrashService.list())[0].versions).toBe(2);

    await TrashService.restore(trashId);
    const back = await AppService.getByIdentifier(created.identifier);
    const after = await AppRevisionService.list(back.id);
    expect(after.map((r) => r.origin)).toEqual(before.map((r) => r.origin));
  });
});
