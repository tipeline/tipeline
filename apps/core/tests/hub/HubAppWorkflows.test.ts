import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/HubUpdateEventService', () => ({
  HubUpdateEventService: { setAttention: vi.fn(), recordUpdated: vi.fn() },
}));
vi.mock('@database/services/HubService', () => ({ HubService: { getById: vi.fn() } }));
vi.mock('@/hub/HubProviderFactory', () => ({ HubProviderFactory: { getProvider: vi.fn() } }));
vi.mock('@database/services/TaskService', () => ({
  TaskService: { getByHubRef: vi.fn(), installFromHub: vi.fn() },
}));
vi.mock('@database/services/AppService', () => ({
  AppService: {
    getByHubRef: vi.fn(),
    installFromHub: vi.fn(),
    getByIdentifier: vi.fn(),
    markSynced: vi.fn(),
    setHubStatus: vi.fn(),
  },
}));

import { HubSyncService } from '@/hub/HubSyncService';
import { HubService } from '@database/services/HubService';
import { HubProviderFactory } from '@/hub/HubProviderFactory';
import { TaskService } from '@database/services/TaskService';
import { AppService } from '@database/services/AppService';

// A local hub folder with one app that declares two hub workflows.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-hub-'));
const workflowYaml = (name: string) =>
  `name: ${name}\nversion: 1.0.0\ndescription: d\npipeline:\n  variables: []\n  actions:\n    - group: system\n      name: message\n      params: { text: hi }\n`;
fs.writeFileSync(path.join(dir, 'list.yml'), workflowYaml('List'));
fs.writeFileSync(path.join(dir, 'save.yml'), workflowYaml('Save'));
const appYaml = (workflows: string) =>
  `schemaVersion: 2\nname: Hub App\nversion: 1.0.0\nworkflows:\n${workflows}\npages:\n  - id: main\n    name: Main\n    runnables:\n      load: { mode: run, workflow: list, trigger: load }\n      save: { mode: run, workflow: save }\n`;

const hub = { id: 'hub-1', name: 'Team Hub' };
let catalog: any[];
const installed = new Map<string, string>(); // hub item → local workflow identifier

beforeEach(() => {
  installed.clear();
  fs.writeFileSync(
    path.join(dir, 'app.yml'),
    appYaml('  list: { hub: list-records }\n  save: { hub: save-record }')
  );
  catalog = [
    { type: 'app', identifier: 'hub-app', version: '1.0.0', file: 'app.yml' },
    { type: 'task', identifier: 'list-records', version: '1.0.0', file: 'list.yml' },
    { type: 'task', identifier: 'save-record', version: '1.0.0', file: 'save.yml' },
  ];
  vi.mocked(HubService.getById).mockResolvedValue(hub as any);
  vi.mocked(HubProviderFactory.getProvider).mockReturnValue({
    fetchCatalog: async () => catalog,
    fetchFile: async (_hub: unknown, item: any) => path.join(dir, item.file),
    fetchImageFile: async () => null,
  } as any);
  vi.mocked(TaskService.getByHubRef)
    .mockReset()
    .mockImplementation(async (_hubId: string, ref: string) =>
      installed.has(ref) ? ({ identifier: installed.get(ref) } as any) : undefined
    );
  vi.mocked(TaskService.installFromHub)
    .mockReset()
    .mockImplementation(async (data: any) => {
      const identifier = `local-${data.hub_task_identifier}`;
      installed.set(data.hub_task_identifier, identifier);
      return { identifier } as any;
    });
  vi.mocked(AppService.getByHubRef).mockResolvedValue(undefined as any);
  vi.mocked(AppService.installFromHub)
    .mockReset()
    .mockImplementation(async (data: any) => ({ identifier: 'app-x', ...data }));
});

describe('hub apps that bring their workflows', () => {
  it('installs the workflows the app needs from the same hub and stores their identifiers', async () => {
    const app: any = await HubSyncService.installApp('hub-1', 'hub-app');

    expect(
      vi.mocked(TaskService.installFromHub).mock.calls.map(([d]: any) => d.hub_task_identifier)
    ).toEqual(['list-records', 'save-record']);
    expect(JSON.parse(app.source).workflows).toEqual({
      list: { identifier: 'local-list-records' },
      save: { identifier: 'local-save-record' },
    });
  });

  it('reuses workflows already installed from that hub', async () => {
    installed.set('list-records', 'already-here');

    const app: any = await HubSyncService.installApp('hub-1', 'hub-app');

    expect(
      vi.mocked(TaskService.installFromHub).mock.calls.map(([d]: any) => d.hub_task_identifier)
    ).toEqual(['save-record']);
    expect(JSON.parse(app.source).workflows.list).toEqual({ identifier: 'already-here' });
  });

  it('installs nothing when a referenced workflow is not on the hub', async () => {
    catalog = catalog.filter((i) => i.identifier !== 'save-record');

    await expect(HubSyncService.installApp('hub-1', 'hub-app')).rejects.toThrow(
      'Workflow "save-record" (used by "save") is not on hub "Team Hub"'
    );
    expect(TaskService.installFromHub).not.toHaveBeenCalled();
    expect(AppService.installFromHub).not.toHaveBeenCalled();
  });

  it('installs nothing when the app itself is invalid', async () => {
    fs.writeFileSync(
      path.join(dir, 'app.yml'),
      appYaml('  list: { hub: list-records }').replace('workflow: save', 'workflow: missing')
    );

    await expect(HubSyncService.installApp('hub-1', 'hub-app')).rejects.toThrow(
      'unknown workflow alias "missing"'
    );
    expect(TaskService.installFromHub).not.toHaveBeenCalled();
  });

  it('an update installs workflows a new version of the app added', async () => {
    installed.set('list-records', 'local-list-records');
    vi.mocked(AppService.getByIdentifier).mockResolvedValue({
      source_type: 'hub',
      hub_id: 'hub-1',
      hub_app_identifier: 'hub-app',
    } as any);
    vi.mocked(AppService.markSynced).mockImplementation(async (_id: string, data: any) => data);

    const updated: any = await HubSyncService.updateApp('app-x');

    expect(
      vi.mocked(TaskService.installFromHub).mock.calls.map(([d]: any) => d.hub_task_identifier)
    ).toEqual(['save-record']);
    expect(JSON.parse(updated.source).workflows.save).toEqual({ identifier: 'local-save-record' });
  });
});
