import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { home } = vi.hoisted(() => ({ home: `${process.env.TMPDIR ?? '/tmp'}/tipeline-update-flow-${process.pid}` }));

vi.mock('os', async (original) => {
  const actual = await original<typeof import('os')>();
  return { ...actual, default: { ...actual, homedir: () => home } };
});

import { HubSyncService } from '@/hub/HubSyncService';
import { PLUGINS_DIR } from '@/plugin/PluginLoader';
import { HubService } from '@database/services/HubService';
import { HubUpdateEventService } from '@database/services/HubUpdateEventService';
import { PluginService } from '@database/services/PluginService';
import { TaskService } from '@database/services/TaskService';
import { AppService } from '@database/services/AppService';

// Nothing mocked but the home folder: real migrations, services, a folder hub on disk and
// real plugin packages, extracted, npm-installed and imported.
let knex: Knex;
let hubId: string;
const hubDir = path.join(home, 'hub');
let items: any[] = [];

const publish = () => fs.writeFileSync(path.join(hubDir, 'hub.json'), JSON.stringify({ items }));

function publishWorkflow(listed: string, served = listed, extraVariables = '[]') {
  fs.writeFileSync(
    path.join(hubDir, 'hello.yml'),
    `name: Hello\nversion: ${served}\ndescription: d\npipeline:\n  variables: ${extraVariables}\n  actions:\n    - group: system\n      name: message\n      params: { text: hi }\n`
  );
  items = items.filter((i) => i.type !== 'task');
  items.push({ type: 'task', identifier: 'hello', name: 'Hello', version: listed, file: 'hello.yml' });
  publish();
}

function publishApp(listed: string, pages: string[] = ['main']) {
  const list = pages.map((id) => `  - id: ${id}\n    name: ${id}\n`).join('');
  fs.writeFileSync(path.join(hubDir, 'app.yml'), `schemaVersion: 2\nname: Hub App\nversion: ${listed}\npages:\n${list}`);
  items = items.filter((i) => i.type !== 'app');
  items.push({ type: 'app', identifier: 'hub-app', name: 'Hub App', version: listed, file: 'app.yml' });
  publish();
}

function publishPlugin(listed: string, code: string, packageVersion = listed) {
  const build = path.join(home, 'plugin-build');
  fs.rmSync(build, { recursive: true, force: true });
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, 'index.mjs'), code);
  fs.writeFileSync(path.join(build, 'package.json'), JSON.stringify({ name: 'greeting', version: packageVersion, type: 'module' }));
  execFileSync('tar', ['-czf', path.join(hubDir, 'greeting.tar.gz'), '-C', build, 'index.mjs', 'package.json']);
  items = items.filter((i) => i.type !== 'plugin');
  items.push({ type: 'plugin', identifier: 'greeting', name: 'Greeting', version: listed, file: 'greeting.tar.gz' });
  publish();
}

const plugin = (version: string) =>
  `export default { group: 'greeting', name: 'Greeting', version: '${version}', actions: {} };\n`;

const kinds = async () => (await HubUpdateEventService.list()).map((e) => [e.kind, e.to_version]);

beforeAll(async () => {
  fs.mkdirSync(hubDir, { recursive: true });
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);
  publish();
  hubId = (await HubService.add({ name: 'Team Hub', type: 'local_folder', target: hubDir })).id;
});
afterAll(async () => {
  await knex.destroy();
  fs.rmSync(home, { recursive: true, force: true });
});

beforeEach(async () => {
  await knex('hub_update_event').del();
  await knex('task').del();
  await knex('app').del();
  await knex('plugin').del();
  fs.rmSync(PLUGINS_DIR, { recursive: true, force: true });
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  items = [];
  publish();
});

describe('hub updates end to end', () => {
  it('a workflow: minor installs, major waits, approval installs, older is refused', async () => {
    publishWorkflow('1.0.0');
    const { identifier } = await HubSyncService.installTask(hubId, 'hello');

    publishWorkflow('1.1.0');
    await HubSyncService.checkHub(hubId);
    let task: any = await TaskService.getByIdentifier(identifier);
    expect(task.version).toBe('1.1.0');
    expect(task.hub_update_state).toBe('current');
    expect(await kinds()).toEqual([['updated', '1.1.0']]);

    publishWorkflow('2.0.0');
    await HubSyncService.checkHub(hubId);
    await HubSyncService.checkHub(hubId);
    task = await TaskService.getByIdentifier(identifier);
    expect(task.version).toBe('1.1.0');
    expect(task.hub_update_state).toBe('major');
    expect(task.hub_status).toBe('ok');
    expect(await kinds()).toEqual([['major_waiting', '2.0.0'], ['updated', '1.1.0']]);

    const preview: any = await HubSyncService.previewUpdate('task', identifier);
    expect(preview).toMatchObject({ name: 'Hello', fromVersion: '1.1.0', toVersion: '2.0.0', state: 'major' });
    // Generated step identifiers don't count as changes.
    expect(preview.workflow.steps).toMatchObject({ addedCount: 0, removedCount: 0, changed: 0 });

    await HubSyncService.updateTask(identifier);
    task = await TaskService.getByIdentifier(identifier);
    expect(task.version).toBe('2.0.0');
    expect(await kinds()).toEqual([['updated', '2.0.0'], ['updated', '1.1.0']]);

    publishWorkflow('1.5.0');
    await HubSyncService.checkHub(hubId);
    task = await TaskService.getByIdentifier(identifier);
    expect(task.version).toBe('2.0.0');
    expect(task.hub_update_state).toBe('older');
    await expect(HubSyncService.updateTask(identifier)).rejects.toThrow(/older/);
    expect((await TaskService.getByIdentifier(identifier) as any).source).toContain('"version":"2.0.0"');
  });

  it('a workflow: a newer listing with an older file changes nothing, and recovers', async () => {
    publishWorkflow('1.2.0');
    const { identifier } = await HubSyncService.installTask(hubId, 'hello');

    publishWorkflow('1.3.0', '1.1.0');
    await HubSyncService.checkHub(hubId);
    let task: any = await TaskService.getByIdentifier(identifier);
    expect(task.version).toBe('1.2.0');
    expect(task.hub_status).toBe('error');
    expect(await kinds()).toEqual([['blocked', '1.1.0']]);

    publishWorkflow('1.3.0');
    await HubSyncService.checkHub(hubId);
    task = await TaskService.getByIdentifier(identifier);
    expect(task.version).toBe('1.3.0');
    expect(task.hub_status).toBe('ok');
    expect(await kinds()).toEqual([['updated', '1.3.0']]);
  });

  it('a workflow: the preview names what would break', async () => {
    publishWorkflow('1.0.0', '1.0.0', '[{ name: city, type: string, visibility: public }]');
    const { identifier } = await HubSyncService.installTask(hubId, 'hello');

    publishWorkflow('2.0.0', '2.0.0', '[{ name: town, type: string, visibility: public }]');
    const preview: any = await HubSyncService.previewUpdate('task', identifier);
    expect(preview.workflow.inputs).toEqual({ added: ['town'], removed: ['city'], changed: [] });
  });

  it('an app: a major version waits, and the switch is respected', async () => {
    publishApp('1.0.0');
    const { identifier } = await HubSyncService.installApp(hubId, 'hub-app');

    publishApp('2.0.0', ['main', 'reports']);
    await HubSyncService.checkHub(hubId);
    let app: any = await AppService.getByIdentifier(identifier);
    expect(app.version).toBe('1.0.0');
    expect(app.hub_update_state).toBe('major');
    const preview: any = await HubSyncService.previewUpdate('app', identifier);
    expect(preview.app.pages).toEqual({ added: ['reports'], removed: [] });

    await HubSyncService.updateApp(identifier);
    publishApp('2.1.0');
    await AppService.setAutoUpdate(identifier, false);
    await HubSyncService.checkHub(hubId);
    app = await AppService.getByIdentifier(identifier);
    expect(app.version).toBe('2.0.0');
    expect((await kinds())[0]).toEqual(['update_available', '2.1.0']);
  });

  it('a plugin: a real package updates, a broken one leaves the old one in place', async () => {
    publishPlugin('1.0.0', plugin('1.0.0'));
    const { identifier } = (await HubSyncService.installPlugin(hubId, 'greeting')) as any;
    const entry = path.join(PLUGINS_DIR, 'greeting', 'index.mjs');

    publishPlugin('1.1.0', plugin('1.1.0'));
    await HubSyncService.checkHub(hubId);
    let record: any = await PluginService.getByIdentifier(identifier);
    expect(record.version).toBe('1.1.0');
    expect(record.hub_status).toBe('ok');

    // A plugin that throws as it loads.
    publishPlugin('1.2.0', `throw new Error('broken on purpose');\n`);
    await HubSyncService.checkHub(hubId);
    record = await PluginService.getByIdentifier(identifier);
    expect(record.version).toBe('1.1.0');
    expect(record.hub_status).toBe('error');
    expect(fs.readFileSync(entry, 'utf8')).toContain("version: '1.1.0'");
    expect((await kinds())[0][0]).toBe('failed');
    expect(fs.readdirSync(path.join(PLUGINS_DIR, '.staging'))).toEqual([]);

    // Listed as a minor, but the package says otherwise.
    publishPlugin('1.2.0', plugin('2.0.0'));
    await HubSyncService.checkHub(hubId);
    record = await PluginService.getByIdentifier(identifier);
    expect(record.version).toBe('1.1.0');
    expect(record.hub_status).toBe('ok');
    expect((await kinds())[0]).toEqual(['major_waiting', '2.0.0']);

    // The review offers what's really waiting, not what the catalog claimed.
    record = await PluginService.getByIdentifier(identifier);
    expect(record.hub_update_state).toBe('major');
    expect(await HubSyncService.previewUpdate('plugin', identifier)).toMatchObject({ toVersion: '2.0.0', state: 'major' });

    await HubSyncService.updatePlugin(identifier);
    record = await PluginService.getByIdentifier(identifier);
    expect(record.version).toBe('2.0.0');
  });

  it("a plugin: a package refused by its package.json never runs", async () => {
    publishPlugin('1.0.0', plugin('1.0.0'));
    const { identifier } = (await HubSyncService.installPlugin(hubId, 'greeting')) as any;
    const marker = path.join(home, 'plugin-ran');

    publishPlugin(
      '1.1.0',
      `import fs from 'fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\n${plugin('2.0.0')}`,
      '2.0.0'
    );
    await HubSyncService.checkHub(hubId);

    expect(fs.existsSync(marker)).toBe(false);
    expect((await PluginService.getByIdentifier(identifier) as any).version).toBe('1.0.0');
    expect((await kinds())[0]).toEqual(['major_waiting', '2.0.0']);
  });

  it('a workflow: a listing ahead of an unbumped file is refused, then recovers', async () => {
    publishWorkflow('1.0.0');
    const { identifier } = await HubSyncService.installTask(hubId, 'hello');

    publishWorkflow('1.1.0', '1.0.0');
    await HubSyncService.checkHub(hubId);
    await HubSyncService.checkHub(hubId);
    let task: any = await TaskService.getByIdentifier(identifier);
    expect(task.hub_status).toBe('error');
    expect(await kinds()).toEqual([['not_bumped', '1.0.0']]);

    publishWorkflow('1.1.0');
    await HubSyncService.checkHub(hubId);
    task = await TaskService.getByIdentifier(identifier);
    expect(task.version).toBe('1.1.0');
    expect(task.hub_status).toBe('ok');
    expect(await kinds()).toEqual([['updated', '1.1.0']]);
  });
});
