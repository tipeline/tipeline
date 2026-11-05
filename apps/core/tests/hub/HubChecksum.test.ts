import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pluginsDir } = vi.hoisted(() => ({
  pluginsDir: `${process.env.TMPDIR ?? '/tmp'}/tipeline-checksum-plugins-${process.pid}`,
}));

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('decompress', () => ({ default: vi.fn() }));
vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('@/plugin/PluginLoader', () => ({
  PLUGINS_DIR: pluginsDir,
  PLUGIN_STAGING_DIR: '.staging',
  PluginLoader: { reloadSingle: vi.fn(), inspect: vi.fn() },
}));
vi.mock('@database/services/HubUpdateEventService', () => ({
  HubUpdateEventService: { setAttention: vi.fn(), recordUpdated: vi.fn() },
}));
vi.mock('@database/services/HubService', () => ({ HubService: { getById: vi.fn() } }));
vi.mock('@database/services/TaskService', () => ({
  TaskService: {
    getByHubRef: vi.fn(),
    installFromHub: vi.fn(),
    getByIdentifier: vi.fn(),
    markSynced: vi.fn(),
    setHubStatus: vi.fn(),
  },
}));
vi.mock('@database/services/AppService', () => ({
  AppService: { getByHubRef: vi.fn(), installFromHub: vi.fn() },
}));
vi.mock('@database/services/PluginService', () => ({
  PluginService: {
    getByHubRef: vi.fn(),
    markHubInstalled: vi.fn(),
    getByIdentifier: vi.fn(),
    markSynced: vi.fn(),
    setHubStatus: vi.fn(),
  },
}));

import axios from 'axios';
import decompress from 'decompress';
import { spawn } from 'child_process';
import { HubSyncService } from '@/hub/HubSyncService';
import { RemoteHubProvider } from '@/hub/RemoteHubProvider';
import { PluginLoader } from '@/plugin/PluginLoader';
import { HubService } from '@database/services/HubService';
import { TaskService } from '@database/services/TaskService';
import { AppService } from '@database/services/AppService';
import { PluginService } from '@database/services/PluginService';

const sha256 = (data: string | Buffer) => `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
const WRONG = `sha256:${'0'.repeat(64)}`;

const workflowYaml = `name: Hello\nversion: 1.0.0\ndescription: d\npipeline:\n  variables: []\n  actions:\n    - group: system\n      name: message\n      params: { text: hi }\n`;
const appYaml = `schemaVersion: 2\nname: Hub App\nversion: 1.0.0\npages:\n  - id: main\n    name: Main\n`;
const pluginZip = Buffer.from('pretend this is a zip');

// A local folder hub holding one workflow, one app and one plugin zip.
let hubDir: string;
let hub: any;
let catalog: any[];

function item(identifier: string) {
  return catalog.find((i) => i.identifier === identifier);
}

beforeEach(() => {
  vi.clearAllMocks();
  hubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-checksum-hub-'));
  fs.writeFileSync(path.join(hubDir, 'hello.yml'), workflowYaml);
  fs.writeFileSync(path.join(hubDir, 'app.yml'), appYaml);
  fs.writeFileSync(path.join(hubDir, 'greeting.zip'), pluginZip);
  fs.writeFileSync(path.join(hubDir, 'hub.json'), JSON.stringify({ items: [] }));
  fs.rmSync(pluginsDir, { recursive: true, force: true });
  fs.mkdirSync(pluginsDir, { recursive: true });

  hub = { id: 'hub-1', name: 'Team Hub', type: 'local_folder', target: hubDir };
  catalog = [
    { type: 'task', identifier: 'hello', name: 'Hello', version: '1.0.0', file: 'hello.yml', checksum: sha256(workflowYaml) },
    { type: 'app', identifier: 'hub-app', name: 'Hub App', version: '1.0.0', file: 'app.yml', checksum: sha256(appYaml) },
    { type: 'plugin', identifier: 'greeting', name: 'Greeting', version: '1.0.0', file: 'greeting.zip', checksum: sha256(pluginZip) },
  ];
  const writeCatalog = () => fs.writeFileSync(path.join(hubDir, 'hub.json'), JSON.stringify({ items: catalog }));
  writeCatalog();
  // Tests edit `catalog` after this point; keep hub.json in step with it.
  vi.mocked(HubService.getById).mockImplementation(async () => {
    writeCatalog();
    return hub;
  });

  vi.mocked(TaskService.getByHubRef).mockResolvedValue(undefined as any);
  vi.mocked(TaskService.installFromHub).mockImplementation(async (data: any) => ({ identifier: 'wf-1', ...data }));
  vi.mocked(AppService.getByHubRef).mockResolvedValue(undefined as any);
  vi.mocked(AppService.installFromHub).mockImplementation(async (data: any) => ({ identifier: 'app-1', ...data }));
  vi.mocked(PluginService.getByHubRef).mockResolvedValue(undefined as any);
  vi.mocked(PluginService.markHubInstalled).mockImplementation(
    async (group: string) => ({ identifier: group, image: 'set' }) as any
  );

  // Extraction writes the plugin's entry file; npm install exits cleanly.
  vi.mocked(decompress).mockImplementation(async (_src: any, dest: any) => {
    fs.writeFileSync(path.join(dest, 'index.mjs'), 'export default {}');
    return [] as any;
  });
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter() as any;
    child.kill = vi.fn();
    setImmediate(() => child.emit('exit', 0));
    return child;
  });
  vi.mocked(PluginLoader.reloadSingle).mockResolvedValue('greeting');
  vi.mocked(PluginLoader.inspect).mockResolvedValue({ group: 'greeting', version: '1.0.0' });
});

afterEach(() => {
  fs.rmSync(hubDir, { recursive: true, force: true });
  fs.rmSync(pluginsDir, { recursive: true, force: true });
});

describe('hub checksums: local folder hub', () => {
  it('installs a workflow, an app and a plugin whose checksums match', async () => {
    await HubSyncService.installTask('hub-1', 'hello');
    await HubSyncService.installApp('hub-1', 'hub-app');
    await HubSyncService.installPlugin('hub-1', 'greeting');

    expect(TaskService.installFromHub).toHaveBeenCalledOnce();
    expect(AppService.installFromHub).toHaveBeenCalledOnce();
    expect(PluginService.markHubInstalled).toHaveBeenCalledOnce();
    expect(fs.existsSync(path.join(pluginsDir, 'greeting', 'index.mjs'))).toBe(true);
  });

  it('refuses a workflow whose steps have invalid params', async () => {
    const yaml = [
      'name: Bad',
      'version: 1.0.0',
      'description: d',
      'pipeline:',
      '  actions:',
      '    - group: file',
      '      name: read',
      '      params:',
      '        path: /tmp/wrong-name.txt',
    ].join('\n');
    fs.writeFileSync(path.join(hubDir, 'hello.yml'), yaml);
    item('hello').checksum = sha256(yaml);

    await expect(HubSyncService.installTask('hub-1', 'hello')).rejects.toThrow('file.read at pipeline.actions[0]');
    expect(TaskService.installFromHub).not.toHaveBeenCalled();
  });

  it('accepts an upper-case hex digest', async () => {
    item('hello').checksum = `sha256:${item('hello').checksum.slice(7).toUpperCase()}`;
    await HubSyncService.installTask('hub-1', 'hello');
    expect(TaskService.installFromHub).toHaveBeenCalledOnce();
  });

  it('refuses a workflow whose checksum does not match, naming the item, hub and both hashes', async () => {
    item('hello').checksum = WRONG;

    const error = await HubSyncService.installTask('hub-1', 'hello').catch((e) => e);

    expect(error.message).toContain('Workflow "hello" from hub "Team Hub"');
    expect(error.message).toContain(`Expected: ${WRONG}`);
    expect(error.message).toContain(`Actual:   ${sha256(workflowYaml)}`);
    expect(TaskService.installFromHub).not.toHaveBeenCalled();
    // The hub's own file is not a download, so it is left alone.
    expect(fs.existsSync(path.join(hubDir, 'hello.yml'))).toBe(true);
  });

  it('refuses an app whose checksum does not match', async () => {
    item('hub-app').checksum = WRONG;
    await expect(HubSyncService.installApp('hub-1', 'hub-app')).rejects.toThrow('App "hub-app" from hub "Team Hub"');
    expect(AppService.installFromHub).not.toHaveBeenCalled();
  });

  it('refuses a plugin before extracting it or running npm install, writing nothing to disk', async () => {
    item('greeting').checksum = WRONG;

    await expect(HubSyncService.installPlugin('hub-1', 'greeting')).rejects.toThrow(
      'Plugin "greeting" from hub "Team Hub" failed its checksum check'
    );
    expect(decompress).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(PluginService.markHubInstalled).not.toHaveBeenCalled();
    expect(fs.readdirSync(pluginsDir)).toEqual([]);
  });

  it('a plugin update with a bad checksum keeps the installed plugin as it was', async () => {
    const installedDir = path.join(pluginsDir, 'greeting');
    fs.mkdirSync(installedDir);
    fs.writeFileSync(path.join(installedDir, 'index.mjs'), 'old version');
    vi.mocked(PluginService.getByIdentifier).mockResolvedValue({
      identifier: 'greeting',
      source_type: 'hub',
      hub_id: 'hub-1',
      hub_plugin_identifier: 'greeting',
    } as any);
    item('greeting').checksum = WRONG;

    await expect(HubSyncService.updatePlugin('greeting')).rejects.toThrow('failed its checksum check');

    expect(fs.readFileSync(path.join(installedDir, 'index.mjs'), 'utf-8')).toBe('old version');
    expect(decompress).not.toHaveBeenCalled();
    expect(PluginService.markSynced).not.toHaveBeenCalled();
    expect(PluginService.setHubStatus).toHaveBeenCalledWith('greeting', 'error');
  });

  it('a workflow update with a bad checksum changes nothing', async () => {
    vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
      identifier: 'wf-1',
      source_type: 'hub',
      hub_id: 'hub-1',
      hub_task_identifier: 'hello',
    } as any);
    item('hello').checksum = WRONG;

    await expect(HubSyncService.updateTask('wf-1')).rejects.toThrow('failed its checksum check');
    expect(TaskService.markSynced).not.toHaveBeenCalled();
    expect(TaskService.setHubStatus).toHaveBeenCalledWith('wf-1', 'error');
  });

  it('installs items without a checksum, as older hubs have none', async () => {
    for (const i of catalog) delete i.checksum;

    await HubSyncService.installTask('hub-1', 'hello');
    await HubSyncService.installPlugin('hub-1', 'greeting');

    expect(TaskService.installFromHub).toHaveBeenCalledOnce();
    expect(PluginService.markHubInstalled).toHaveBeenCalledOnce();
  });

  it('refuses a checksum that is not sha256:<hex>', async () => {
    item('hello').checksum = `md5:${'a'.repeat(32)}`;
    await expect(HubSyncService.installTask('hub-1', 'hello')).rejects.toThrow(
      'Only "sha256:<hex>" is supported'
    );
    expect(TaskService.installFromHub).not.toHaveBeenCalled();
  });
});

describe('hub checksums: remote hub', () => {
  let tmpRoot: string;
  const remoteHub: any = { id: 'hub-2', name: 'Web Hub', type: 'remote', target: 'https://hub.example.com/' };
  const remoteItem = (checksum?: string): any => ({
    type: 'plugin',
    identifier: 'greeting',
    name: 'Greeting',
    version: '1.0.0',
    file: 'plugins/greeting.zip',
    checksum,
  });

  beforeEach(() => {
    // Downloads land in a temp dir under os.tmpdir(); point that at an empty folder to watch it.
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-checksum-tmp-'));
    vi.spyOn(os, 'tmpdir').mockReturnValue(tmpRoot);
    vi.mocked(axios.get).mockImplementation(async () => ({ data: Readable.from([pluginZip]) }) as any);
  });

  afterEach(() => {
    vi.mocked(os.tmpdir).mockRestore();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns the downloaded file when the checksum matches', async () => {
    const filePath = await new RemoteHubProvider().fetchFile(remoteHub, remoteItem(sha256(pluginZip)));

    expect(axios.get).toHaveBeenCalledWith('https://hub.example.com/plugins/greeting.zip', { responseType: 'stream' });
    expect(fs.readFileSync(filePath)).toEqual(pluginZip);
  });

  it('deletes the download and refuses on a mismatch', async () => {
    const error = await new RemoteHubProvider().fetchFile(remoteHub, remoteItem(WRONG)).catch((e) => e);

    expect(error.message).toContain('Plugin "greeting" from hub "Web Hub" failed its checksum check');
    expect(error.message).toContain(`Expected: ${WRONG}`);
    expect(error.message).toContain(`Actual:   ${sha256(pluginZip)}`);
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });

  it('downloads without a check when there is no checksum', async () => {
    const filePath = await new RemoteHubProvider().fetchFile(remoteHub, remoteItem());
    expect(fs.readFileSync(filePath)).toEqual(pluginZip);
  });

  it('refuses an unsupported checksum before downloading anything', async () => {
    await expect(new RemoteHubProvider().fetchFile(remoteHub, remoteItem('sha1:abc'))).rejects.toThrow(
      'Only "sha256:<hex>" is supported'
    );
    expect(axios.get).not.toHaveBeenCalled();
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });
});
