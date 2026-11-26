import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pluginsDir, service } = vi.hoisted(() => ({
  pluginsDir: `${process.env.TMPDIR ?? '/tmp'}/tipeline-update-plugins-${process.pid}`,
  service: () => ({
    getInstalledForHub: vi.fn(async () => []),
    getAllWithSource: vi.fn(async () => []),
    getByIdentifier: vi.fn(),
    markSynced: vi.fn(),
    setHubStatus: vi.fn(),
    setHubVersion: vi.fn(),
  }),
}));

vi.mock('decompress', () => ({ default: vi.fn() }));
vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('@/plugin/PluginLoader', () => ({
  PLUGINS_DIR: pluginsDir,
  PLUGIN_STAGING_DIR: '.staging',
  PluginLoader: { reloadSingle: vi.fn(), inspect: vi.fn() },
}));
vi.mock('@database/services/HubService', () => ({
  HubService: { getById: vi.fn(), markChecked: vi.fn() },
}));
vi.mock('@database/services/HubUpdateEventService', () => ({
  HubUpdateEventService: { setAttention: vi.fn(), recordUpdated: vi.fn() },
}));
vi.mock('@database/services/TaskService', () => ({ TaskService: service() }));
vi.mock('@database/services/AppService', () => ({ AppService: service() }));
vi.mock('@database/services/PluginService', () => ({ PluginService: service() }));

import decompress from 'decompress';
import { spawn } from 'child_process';
import { HubSyncService } from '@/hub/HubSyncService';
import { hubUpdateState } from '@/hub/HubUpdatePolicy';
import { PluginLoader } from '@/plugin/PluginLoader';
import { HubService } from '@database/services/HubService';
import { HubUpdateEventService } from '@database/services/HubUpdateEventService';
import { TaskService } from '@database/services/TaskService';
import { AppService } from '@database/services/AppService';
import { PluginService } from '@database/services/PluginService';

const workflowFile = (version: string) =>
  `name: Hello\nversion: ${version}\ndescription: d\npipeline:\n  variables: []\n  actions:\n    - group: system\n      name: message\n      params: { text: hi }\n`;
const appFile = (version: string) => `schemaVersion: 2\nname: Hub App\nversion: ${version}\npages:\n  - id: main\n    name: Main\n`;

let hubDir: string;
let catalog: any[];
const hub = () => ({ id: 'hub-1', name: 'Team Hub', type: 'local_folder', target: hubDir });

// Every hub item needs a checksum: the sha256 of its file as it is on disk now.
const checksumOf = (file: string) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

const installedTask = (over: Record<string, unknown> = {}) => ({
  identifier: 'wf-1',
  name: 'Hello',
  version: '1.2.0',
  hub_task_identifier: 'hello',
  hub_version: '1.2.0',
  hub_status: 'ok',
  auto_update: true,
  ...over,
});

// One workflow installed from the hub, with the hub listing `listed` and serving `served`.
function hubListsWorkflow(listed: string, served: string, over: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(hubDir, 'hello.yml'), workflowFile(served));
  catalog = [{ type: 'task', identifier: 'hello', name: 'Hello', version: listed, file: 'hello.yml', checksum: checksumOf(path.join(hubDir, 'hello.yml')) }];
  fs.writeFileSync(path.join(hubDir, 'hub.json'), JSON.stringify({ items: catalog }));
  const record = installedTask(over);
  vi.mocked(TaskService.getInstalledForHub).mockResolvedValue([record] as any);
  vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
    ...record,
    source_type: 'hub',
    hub_id: 'hub-1',
    hub_name: 'Team Hub',
  } as any);
  vi.mocked(TaskService.markSynced).mockImplementation(
    async (_id: string, _v: string, source: string) => ({ version: JSON.parse(source).version }) as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-update-hub-'));
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(path.join(hubDir, 'hub.json'), JSON.stringify({ items: [] }));
  vi.mocked(HubService.getById).mockImplementation(async () => hub() as any);
  vi.mocked(TaskService.getInstalledForHub).mockResolvedValue([]);
  vi.mocked(AppService.getInstalledForHub).mockResolvedValue([]);
  vi.mocked(PluginService.getInstalledForHub).mockResolvedValue([]);
});

afterEach(() => {
  fs.rmSync(hubDir, { recursive: true, force: true });
  fs.rmSync(pluginsDir, { recursive: true, force: true });
});

describe('hubUpdateState', () => {
  it.each([
    ['1.2.0', '1.2.0', 'current'],
    ['1.2.0', '1.2.1', 'available'],
    ['1.2.0', '1.3.0', 'available'],
    ['1.2.0', '2.0.0', 'major'],
    ['1.2.0', '1.1.0', 'older'],
    ['2.0.0', '1.9.0', 'older'],
    [null, '1.0.0', 'available'],
    ['1.2.0', 'latest', 'current'],
    ['1.2.0', null, 'current'],
  ])('installed %s, listed %s: %s', (installed, listed, state) => {
    expect(hubUpdateState(installed, listed)).toBe(state);
  });
});

describe('the hub lists an older version', () => {
  it("doesn't install it, and says so", async () => {
    hubListsWorkflow('1.1.0', '1.1.0');
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.markSynced).not.toHaveBeenCalled();
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1' }),
      { kind: 'older_listed', toVersion: '1.1.0' }
    );
  });

  it('refuses it when asked directly, too', async () => {
    hubListsWorkflow('1.1.0', '1.1.0');
    await expect(HubSyncService.updateTask('wf-1')).rejects.toThrow(/older than the installed 1\.2\.0/);
    expect(TaskService.markSynced).not.toHaveBeenCalled();
  });
});

describe('the hub lists a newer version but serves an older file', () => {
  it('keeps the installed copy and flags the item', async () => {
    hubListsWorkflow('1.3.0', '1.1.0');
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.markSynced).not.toHaveBeenCalled();
    expect(TaskService.setHubStatus).toHaveBeenCalledWith('wf-1', 'error');
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1' }),
      expect.objectContaining({ kind: 'blocked', toVersion: '1.1.0' })
    );
  });

  it("isn't marked as healthy afterwards by the same check", async () => {
    hubListsWorkflow('1.3.0', '1.1.0', { hub_status: 'error' });
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.setHubStatus).not.toHaveBeenCalledWith('wf-1', 'ok');
  });
});

describe('the hub lists a newer version but the file was not bumped', () => {
  it("doesn't reinstall it hourly over the user's copy", async () => {
    hubListsWorkflow('1.3.0', '1.2.0');
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.markSynced).not.toHaveBeenCalled();
    expect(TaskService.setHubStatus).toHaveBeenCalledWith('wf-1', 'error');
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1' }),
      expect.objectContaining({ kind: 'not_bumped', toVersion: '1.2.0' })
    );
  });

  it("does nothing, and reports no problem, when there's simply nothing new", async () => {
    hubListsWorkflow('1.2.0', '1.2.0');
    await HubSyncService.updateTask('wf-1');
    expect(TaskService.markSynced).not.toHaveBeenCalled();
    expect(TaskService.setHubStatus).not.toHaveBeenCalled();
    expect(HubUpdateEventService.setAttention).not.toHaveBeenCalled();
  });
});

describe('a major version', () => {
  it('waits for approval, with auto-update on', async () => {
    hubListsWorkflow('2.0.0', '2.0.0');
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.markSynced).not.toHaveBeenCalled();
    expect(TaskService.setHubVersion).toHaveBeenCalledWith('wf-1', '2.0.0');
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1' }),
      { kind: 'major_waiting', toVersion: '2.0.0' }
    );
  });

  it('waits too when only the file is major, and that is not an error', async () => {
    hubListsWorkflow('1.3.0', '2.0.0');
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.markSynced).not.toHaveBeenCalled();
    expect(TaskService.setHubStatus).not.toHaveBeenCalledWith('wf-1', 'error');
    // What the review will offer is the file's version, not the catalog's.
    expect(TaskService.setHubVersion).toHaveBeenLastCalledWith('wf-1', '2.0.0');
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1' }),
      { kind: 'major_waiting', toVersion: '2.0.0' }
    );
  });

  it('installs when the user approves it', async () => {
    hubListsWorkflow('2.0.0', '2.0.0');
    await HubSyncService.updateTask('wf-1');
    expect(TaskService.markSynced).toHaveBeenCalled();
    expect(HubUpdateEventService.recordUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1', fromVersion: '1.2.0' }),
      '2.0.0',
      true
    );
  });
});

describe('minor and patch versions', () => {
  it('install on their own and are announced', async () => {
    hubListsWorkflow('1.3.0', '1.3.0');
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.markSynced).toHaveBeenCalled();
    expect(HubUpdateEventService.recordUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1' }),
      '1.3.0',
      false
    );
  });

  it('are flagged instead when auto-update is off', async () => {
    hubListsWorkflow('1.3.0', '1.3.0', { auto_update: false });
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.markSynced).not.toHaveBeenCalled();
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1' }),
      { kind: 'update_available', toVersion: '1.3.0' }
    );
  });
});

describe('a failed update', () => {
  it('is recorded with its reason', async () => {
    hubListsWorkflow('1.3.0', '1.3.0');
    fs.rmSync(path.join(hubDir, 'hello.yml'));
    await HubSyncService.checkHub('hub-1');
    expect(TaskService.setHubStatus).toHaveBeenCalledWith('wf-1', 'error');
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'wf-1' }),
      expect.objectContaining({ kind: 'failed', message: expect.any(String) })
    );
  });
});

describe('apps', () => {
  function hubListsApp(listed: string, served: string) {
    fs.writeFileSync(path.join(hubDir, 'app.yml'), appFile(served));
    fs.writeFileSync(
      path.join(hubDir, 'hub.json'),
      JSON.stringify({ items: [{ type: 'app', identifier: 'hub-app', name: 'Hub App', version: listed, file: 'app.yml', checksum: checksumOf(path.join(hubDir, 'app.yml')) }] })
    );
    const record = {
      identifier: 'app-1',
      name: 'Hub App',
      version: '1.0.0',
      hub_app_identifier: 'hub-app',
      hub_status: 'ok',
      auto_update: true,
    };
    vi.mocked(AppService.getInstalledForHub).mockResolvedValue([record] as any);
    vi.mocked(AppService.getByIdentifier).mockResolvedValue({ ...record, source_type: 'hub', hub_id: 'hub-1' } as any);
  }

  it('hold a major version', async () => {
    hubListsApp('2.0.0', '2.0.0');
    await HubSyncService.checkHub('hub-1');
    expect(AppService.markSynced).not.toHaveBeenCalled();
  });

  it('refuse an older file behind a newer listing', async () => {
    hubListsApp('1.1.0', '0.9.0');
    await HubSyncService.checkHub('hub-1');
    expect(AppService.markSynced).not.toHaveBeenCalled();
    expect(AppService.setHubStatus).toHaveBeenCalledWith('app-1', 'error');
  });
});

describe('plugin updates', () => {
  const installedDir = path.join(pluginsDir, 'greeting');
  const entry = path.join(installedDir, 'index.mjs');

  beforeEach(() => {
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(entry, 'old code');
    fs.writeFileSync(path.join(hubDir, 'greeting.zip'), 'zip');
    fs.writeFileSync(
      path.join(hubDir, 'hub.json'),
      JSON.stringify({ items: [{ type: 'plugin', identifier: 'greeting', name: 'Greeting', version: '1.1.0', file: 'greeting.zip', checksum: checksumOf(path.join(hubDir, 'greeting.zip')) }] })
    );
    const record = {
      identifier: 'greeting',
      group: 'greeting',
      name: 'Greeting',
      version: '1.0.0',
      hub_plugin_identifier: 'greeting',
      hub_status: 'ok',
      auto_update: true,
    };
    vi.mocked(PluginService.getInstalledForHub).mockResolvedValue([record] as any);
    vi.mocked(PluginService.getByIdentifier).mockResolvedValue({ ...record, source_type: 'hub', hub_id: 'hub-1' } as any);
    vi.mocked(decompress).mockImplementation(async (_src: any, dest: any) => {
      fs.writeFileSync(path.join(dest, 'index.mjs'), 'new code');
      return [] as any;
    });
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter() as any;
      child.kill = vi.fn();
      setImmediate(() => child.emit('exit', 0));
      return child;
    });
    vi.mocked(PluginLoader.inspect).mockResolvedValue(greetingPlugin('1.1.0'));
    vi.mocked(PluginLoader.reloadSingle).mockResolvedValue('greeting');
  });

  // A plugin with one action, `greeting.say`, taking a required `text`.
  function greetingPlugin(version: string, over: Record<string, unknown> = {}) {
    return {
      group: 'greeting',
      version,
      actions: { say: {} },
      params: { say: [{ name: 'text', type: 'string', required: true }] },
      ...over,
    } as any;
  }

  // A saved workflow with a `greeting.say` step inside a loop.
  function workflowUsesGreeting(params: Record<string, unknown>) {
    const source = {
      name: 'Morning',
      pipeline: {
        variables: [],
        actions: [
          { group: 'system', name: 'message', params: { text: 'start' } },
          {
            group: 'loop',
            name: 'forEach',
            params: { actions: [{ group: 'greeting', name: 'say', source: 'plugin', params }] },
          },
        ],
      },
    };
    vi.mocked(TaskService.getAllWithSource).mockResolvedValue([
      { identifier: 'morning', name: 'Morning', source: JSON.stringify(source) },
    ]);
  }

  const stagingLeft = () => {
    const staging = path.join(pluginsDir, '.staging');
    return fs.existsSync(staging) ? fs.readdirSync(staging) : [];
  };

  it('replace the installed plugin once the new one loads', async () => {
    await HubSyncService.updatePlugin('greeting');
    expect(fs.readFileSync(entry, 'utf8')).toBe('new code');
    expect(stagingLeft()).toEqual([]);
  });

  it('leave the plugin alone when npm install fails', async () => {
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter() as any;
      child.kill = vi.fn();
      setImmediate(() => child.emit('exit', 1));
      return child;
    });
    await expect(HubSyncService.updatePlugin('greeting')).rejects.toThrow(/npm install/);
    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');
    expect(PluginLoader.reloadSingle).not.toHaveBeenCalled();
    expect(stagingLeft()).toEqual([]);
  });

  it('leave the plugin alone when the package is not a valid plugin', async () => {
    vi.mocked(PluginLoader.inspect).mockResolvedValue(null);
    await expect(HubSyncService.updatePlugin('greeting')).rejects.toThrow(/valid/);
    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');
  });

  it('put the old plugin back when the new one fails after the swap', async () => {
    vi.mocked(PluginLoader.reloadSingle).mockResolvedValueOnce(null).mockResolvedValueOnce('greeting');
    await expect(HubSyncService.updatePlugin('greeting')).rejects.toThrow(/valid/);
    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');
    expect(PluginLoader.reloadSingle).toHaveBeenCalledTimes(2);
    expect(stagingLeft()).toEqual([]);
  });

  it('refuse a package older than the installed one', async () => {
    vi.mocked(PluginLoader.inspect).mockResolvedValue(greetingPlugin('0.9.0'));
    await HubSyncService.checkHub('hub-1');
    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');
    expect(PluginService.setHubStatus).toHaveBeenCalledWith('greeting', 'error');
  });

  it('refuse from package.json before npm install or loading anything', async () => {
    vi.mocked(decompress).mockImplementation(async (_src: any, dest: any) => {
      fs.writeFileSync(path.join(dest, 'index.mjs'), 'new code');
      fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify({ version: '0.9.0' }));
      return [] as any;
    });
    await expect(HubSyncService.updatePlugin('greeting')).rejects.toThrow(/older/);
    expect(spawn).not.toHaveBeenCalled();
    expect(PluginLoader.inspect).not.toHaveBeenCalled();
    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');
  });

  it('hold a package whose code says it is a major version', async () => {
    vi.mocked(PluginLoader.inspect).mockResolvedValue(greetingPlugin('2.0.0'));
    await HubSyncService.checkHub('hub-1');
    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'greeting' }),
      { kind: 'major_waiting', toVersion: '2.0.0' }
    );
  });
  it('install a version the saved workflows still pass', async () => {
    workflowUsesGreeting({ text: 'hello' });
    await HubSyncService.updatePlugin('greeting');
    expect(fs.readFileSync(entry, 'utf8')).toBe('new code');
  });

  it('hold back a minor version that would break a saved step, even with auto-update on', async () => {
    workflowUsesGreeting({ text: 'hello' });
    vi.mocked(PluginLoader.inspect).mockResolvedValue(
      greetingPlugin('1.1.0', {
        params: { say: [{ name: 'message', type: 'string', required: true }] },
      })
    );
    await HubSyncService.checkHub('hub-1');

    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');
    expect(PluginLoader.reloadSingle).not.toHaveBeenCalled();
    expect(stagingLeft()).toEqual([]);
    expect(PluginService.setHubStatus).toHaveBeenCalledWith('greeting', 'ok');
    const [, attention] = vi.mocked(HubUpdateEventService.setAttention).mock.calls.at(-1)!;
    expect(attention).toMatchObject({ kind: 'breaks_workflows', toVersion: '1.1.0' });
    const problems = JSON.parse(attention!.message!);
    expect(problems.map((p: any) => [p.workflow.name, p.position, p.action, p.kind])).toEqual([
      ['Morning', '2.1', 'greeting.say', 'invalid_settings'],
      ['Morning', '2.1', 'greeting.say', 'setting_removed'],
    ]);
  });

  it('say which steps break when the user updates, and install only when they accept', async () => {
    workflowUsesGreeting({ text: 'hello' });
    vi.mocked(PluginLoader.inspect).mockResolvedValue(greetingPlugin('1.1.0', { actions: { greet: {} } }));

    await expect(HubSyncService.updatePlugin('greeting')).rejects.toThrow(
      /would break 1 step\(s\) in 1 workflow\(s\)[\s\S]*Morning, step 2.1 \(greeting.say\): action no longer exists/
    );
    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');

    await HubSyncService.updatePlugin('greeting', { acceptBreaking: true });
    expect(fs.readFileSync(entry, 'utf8')).toBe('new code');
  });

  it('treat a renamed group as every step losing its action', async () => {
    workflowUsesGreeting({ text: 'hello' });
    vi.mocked(PluginLoader.inspect).mockResolvedValue(greetingPlugin('1.1.0', { group: 'greetings' }));
    await expect(HubSyncService.updatePlugin('greeting')).rejects.toThrow(/action no longer exists/);
    expect(fs.readFileSync(entry, 'utf8')).toBe('old code');
  });

  it('still hold a major for approval before checking workflows', async () => {
    workflowUsesGreeting({ other: 1 });
    vi.mocked(PluginLoader.inspect).mockResolvedValue(greetingPlugin('2.0.0'));
    await HubSyncService.checkHub('hub-1');
    expect(HubUpdateEventService.setAttention).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'greeting' }),
      { kind: 'major_waiting', toVersion: '2.0.0' }
    );
  });
});
