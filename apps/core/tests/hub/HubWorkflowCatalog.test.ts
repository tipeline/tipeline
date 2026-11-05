import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@database/services/HubService', () => ({
  HubService: { listEnabled: vi.fn(), getById: vi.fn() },
}));
vi.mock('@database/services/TaskService', () => ({
  TaskService: { getAll: vi.fn() },
}));
vi.mock('@database/services/PluginService', () => ({
  PluginService: { getByGroup: vi.fn() },
}));
vi.mock('@/hub/HubProviderFactory', () => ({
  HubProviderFactory: { getProvider: vi.fn() },
}));
vi.mock('@utils/Parser', () => ({
  Parser: { importFromFile: vi.fn() },
}));
vi.mock('@action/ActionRegistry', () => ({
  ActionRegistry: { string: {}, flow: {} },
}));
vi.mock('@/plugin/PluginActionRegistry', () => ({
  PluginActionRegistry: { drupal: {} },
}));

import { HubWorkflowCatalog } from '@/hub/HubWorkflowCatalog';
import { HubService } from '@database/services/HubService';
import { TaskService } from '@database/services/TaskService';
import { PluginService } from '@database/services/PluginService';
import { HubProviderFactory } from '@/hub/HubProviderFactory';
import { Parser } from '@utils/Parser';

const teamHub = { id: 'h1', name: 'Team hub' } as any;
const brokenHub = { id: 'h2', name: 'Broken hub' } as any;

const catalogs: Record<string, any[]> = {
  h1: [
    { type: 'task', identifier: 'greet', name: 'Greet someone', description: 'Says **hello**.', version: '1.0.0', file: 'tasks/greet.yml' },
    { type: 'task', identifier: 'installed-one', name: 'Already here', version: '1.0.0', file: 'x.yml' },
    { type: 'app', identifier: 'dash', name: 'Dashboard', version: '1.0.0', file: 'apps/dash.yml' },
    { type: 'plugin', identifier: 'hub-greeting', name: 'Hub Greeting Plugin', group: 'hubGreeting', version: '1.0.0', file: 'p.zip' },
  ],
};

const greetSource = {
  name: 'Greet someone',
  description: 'Says hello.',
  pipeline: {
    variables: [
      { type: 'string', name: 'person', label: 'Person', required: true, value: '', visibility: 'public' },
      { type: 'string', name: 'apiKey', secret: true, visibility: 'public' },
      { type: 'string', name: 'greeting', label: 'Greeting', visibility: 'public', output: true, value: '' },
    ],
    actions: [
      { group: 'string', name: 'upper' },
      { group: 'hubGreeting', name: 'hello' },
      { group: 'drupal', name: 'get' },
    ],
  },
};

const fetchCatalog = vi.fn(async (hub: any) => {
  if (hub.id === 'h2') throw new Error('offline');
  return catalogs[hub.id];
});
const fetchFile = vi.fn(async () => '/tmp/greet.yml');

beforeEach(() => {
  vi.clearAllMocks();
  HubWorkflowCatalog.clear();
  vi.mocked(HubService.listEnabled).mockResolvedValue([teamHub, brokenHub]);
  vi.mocked(HubService.getById).mockImplementation(async (id: string) => (id === 'h1' ? teamHub : null));
  vi.mocked(TaskService.getAll).mockResolvedValue([
    { identifier: 'local-1', hub_id: 'h1', hub_task_identifier: 'installed-one' },
    { identifier: 'local-2', hub_id: null, hub_task_identifier: null },
  ] as any);
  vi.mocked(HubProviderFactory.getProvider).mockReturnValue({ fetchCatalog, fetchFile } as any);
  vi.mocked(Parser.importFromFile).mockReturnValue(greetSource as any);
  vi.mocked(PluginService.getByGroup).mockResolvedValue(undefined as any);
});

describe('HubWorkflowCatalog.uninstalledWorkflows', () => {
  it('lists hub workflows that are not installed, and names hubs it could not reach', async () => {
    const { workflows, unreachableHubs } = await HubWorkflowCatalog.uninstalledWorkflows();

    expect(workflows).toEqual([
      {
        identifier: 'hub:h1:greet',
        name: 'Greet someone',
        description: 'Says hello.',
        inputs: [],
        hub: { id: 'h1', name: 'Team hub', itemIdentifier: 'greet', version: '1.0.0' },
      },
    ]);
    expect(unreachableHubs).toEqual(['Broken hub']);
  });

  it('returns nothing without enabled hubs', async () => {
    vi.mocked(HubService.listEnabled).mockResolvedValue([]);
    expect(await HubWorkflowCatalog.uninstalledWorkflows()).toEqual({ workflows: [], unreachableHubs: [] });
  });

  it('caches a catalog between searches', async () => {
    await HubWorkflowCatalog.uninstalledWorkflows();
    await HubWorkflowCatalog.uninstalledWorkflows();
    expect(fetchCatalog.mock.calls.filter(([hub]) => hub.id === 'h1')).toHaveLength(1);
  });
});

describe('HubWorkflowCatalog.withInputs', () => {
  it('fills in inputs for hub workflows from their file and leaves installed ones alone', async () => {
    const local = { identifier: 'local-2', name: 'Local', inputs: [] };
    const { workflows } = await HubWorkflowCatalog.uninstalledWorkflows();

    const [first, second] = await HubWorkflowCatalog.withInputs([local, ...workflows]);

    expect(first).toBe(local);
    expect(second.inputs).toEqual([{ name: 'person', type: 'string', label: 'Person', required: true }]);
    expect(second.outputs).toEqual([{ name: 'greeting', type: 'string', label: 'Greeting' }]);
  });

  it('keeps an empty list when the file cannot be read', async () => {
    fetchFile.mockRejectedValueOnce(new Error('gone'));
    const { workflows } = await HubWorkflowCatalog.uninstalledWorkflows();
    const [result] = await HubWorkflowCatalog.withInputs(workflows);
    expect(result.inputs).toEqual([]);
  });
});

describe('HubWorkflowCatalog.preview', () => {
  it('reports inputs and the plugins this Core lacks, with a hub plugin that provides one', async () => {
    const preview = await HubWorkflowCatalog.preview('h1', 'greet');

    expect(preview).toMatchObject({
      hubId: 'h1',
      hubName: 'Team hub',
      itemIdentifier: 'greet',
      name: 'Greet someone',
      version: '1.0.0',
      inputs: [{ name: 'person', type: 'string', label: 'Person', required: true }],
    });
    // string is built in and drupal is loaded; only hubGreeting is missing.
    expect(preview.missingPlugins).toEqual([
      {
        group: 'hubGreeting',
        state: 'notInstalled',
        hubPlugin: { hubId: 'h1', hubName: 'Team hub', identifier: 'hub-greeting', name: 'Hub Greeting Plugin' },
      },
    ]);
  });

  it('says what the workflow can do: its plugin steps run add-on code', async () => {
    const preview = await HubWorkflowCatalog.preview('h1', 'greet');
    expect(preview.capabilities).toEqual({
      capabilities: [
        {
          capability: 'addon',
          review: true,
          steps: [
            { action: 'hubGreeting.hello', label: 'hubGreeting.hello' },
            { action: 'drupal.get', label: 'drupal.get' },
          ],
        },
      ],
      unknownWorkflows: [],
    });
  });

  it('tells a turned-off plugin from one that is on but not loaded', async () => {
    vi.mocked(PluginService.getByGroup).mockResolvedValueOnce({ name: 'Greeting', status: 'ok', enabled: false } as any);
    expect((await HubWorkflowCatalog.preview('h1', 'greet')).missingPlugins[0]).toEqual({
      group: 'hubGreeting',
      state: 'disabled',
      pluginName: 'Greeting',
    });

    vi.mocked(PluginService.getByGroup).mockResolvedValueOnce({ name: 'Greeting', status: 'ok', enabled: true } as any);
    expect((await HubWorkflowCatalog.preview('h1', 'greet')).missingPlugins[0].state).toBe('notLoaded');

    vi.mocked(PluginService.getByGroup).mockResolvedValueOnce({ name: 'Greeting', status: 'missing', enabled: true } as any);
    expect((await HubWorkflowCatalog.preview('h1', 'greet')).missingPlugins[0].state).toBe('missing');
  });

  it('reads the file once per item version', async () => {
    await HubWorkflowCatalog.preview('h1', 'greet');
    await HubWorkflowCatalog.preview('h1', 'greet');
    expect(fetchFile).toHaveBeenCalledTimes(1);
  });

  it('fails clearly for an unknown hub or item', async () => {
    await expect(HubWorkflowCatalog.preview('nope', 'greet')).rejects.toThrow('Hub "nope" not found');
    await expect(HubWorkflowCatalog.preview('h1', 'missing')).rejects.toThrow('not found on hub "Team hub"');
  });
});
