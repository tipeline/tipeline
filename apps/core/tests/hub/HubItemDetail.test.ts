import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/HubService', () => ({
  HubService: { getById: vi.fn(), listEnabled: vi.fn() },
}));
vi.mock('@database/services/TaskService', () => ({
  TaskService: { getAll: vi.fn(), getByIdentifier: vi.fn() },
}));
vi.mock('@database/services/PluginService', () => ({
  PluginService: { getByGroup: vi.fn() },
}));
vi.mock('@action/ActionRegistry', () => ({
  ActionRegistry: { system: {}, ai: {}, string: {}, flow: {} },
}));
vi.mock('@/plugin/PluginActionRegistry', () => ({ PluginActionRegistry: {} }));

import { hubItemDetail } from '@/hub/HubItemDetail';
import { HubWorkflowCatalog } from '@/hub/HubWorkflowCatalog';
import { HubService } from '@database/services/HubService';
import { TaskService } from '@database/services/TaskService';
import { PluginService } from '@database/services/PluginService';

// A local-folder hub with one workflow, one app and one plugin.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-detail-'));
const hub = { id: 'hub-1', name: 'Team Hub', type: 'local_folder', target: dir } as any;
const sideEffect = path.join(dir, 'plugin-ran.txt');

const summarize = `name: Summarize
version: 1.2.0
description: Summarizes text.
pipeline:
  variables:
    - { type: string, name: text, label: Text, required: true, visibility: public, value: '' }
    - { type: string, name: summary, label: Summary, visibility: public, output: true, value: '' }
  actions:
    - group: ai
      name: prompt
      params: { prompt: hi }
    - group: flow
      name: loop
      params:
        actions:
          - { group: string, name: upper }
          - { group: crm, name: save }
`;
const plain = `name: List records
version: 1.0.0
pipeline:
  variables: []
  actions:
    - { group: system, name: message, params: { text: hi } }
`;
const app = `schemaVersion: 2
name: Records
version: 1.0.0
workflows:
  list: { hub: list-records }
  sum: { hub: summarize }
  gone: { hub: not-listed }
  local: { identifier: abc-123 }
pages:
  - { id: main, name: Main }
  - { id: edit }
`;

// Every hub item needs a checksum: the sha256 of its file as it is on disk now.
const checksumOf = (file: string) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

async function zip(target: string, files: Record<string, string>) {
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(target);
    const archive = archiver('zip');
    out.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(out);
    for (const [name, content] of Object.entries(files)) archive.append(content, { name });
    archive.finalize();
  });
}

beforeAll(async () => {
  fs.writeFileSync(path.join(dir, 'summarize.yml'), summarize);
  fs.writeFileSync(path.join(dir, 'list.yml'), plain);
  fs.writeFileSync(path.join(dir, 'app.yml'), app);
  await zip(path.join(dir, 'crm.zip'), {
    'index.mjs': `import fs from 'fs'; fs.writeFileSync(${JSON.stringify(sideEffect)}, 'ran'); export default { group: 'crm', actions: {} };`,
    'package.json': JSON.stringify({
      name: 'crm-plugin',
      license: 'MIT',
      homepage: 'javascript:alert(1)',
      dependencies: { axios: '^1.7.0' },
    }),
    'lib/helpers.js': 'export const x = 1;',
  });
  fs.writeFileSync(
    path.join(dir, 'hub.json'),
    JSON.stringify({
      items: [
        {
          type: 'task',
          identifier: 'summarize',
          name: 'Summarize',
          version: '1.2.0',
          file: 'summarize.yml',
          checksum: checksumOf(path.join(dir, 'summarize.yml')),
        },
        {
          type: 'task',
          identifier: 'list-records',
          name: 'List records',
          version: '1.0.0',
          file: 'list.yml',
          checksum: checksumOf(path.join(dir, 'list.yml')),
        },
        { type: 'app', identifier: 'records', name: 'Records', version: '1.0.0', file: 'app.yml', checksum: checksumOf(path.join(dir, 'app.yml')) },
        {
          type: 'plugin',
          identifier: 'crm',
          name: 'CRM',
          version: '2.0.0',
          file: 'crm.zip',
          checksum: checksumOf(path.join(dir, 'crm.zip')),
          group: 'crm',
        },
      ],
    })
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  HubWorkflowCatalog.clear();
  vi.mocked(HubService.getById).mockImplementation(async (id: string) =>
    id === hub.id ? hub : null
  );
  vi.mocked(HubService.listEnabled).mockResolvedValue([hub]);
  vi.mocked(TaskService.getByIdentifier).mockResolvedValue(undefined as any);
  vi.mocked(PluginService.getByGroup).mockResolvedValue(undefined as any);
});

describe('hubItemDetail', () => {
  it('reads a workflow: inputs, outputs, every step, missing plugins and what it can do', async () => {
    const detail: any = await hubItemDetail(hub.id, 'task', 'summarize');
    expect(detail.type).toBe('task');
    expect(detail.inputs.map((f: any) => f.name)).toEqual(['text']);
    expect(detail.outputs.map((f: any) => f.name)).toEqual(['summary']);
    expect(detail.steps).toBe(4);
    expect(detail.missingPlugins).toEqual([
      expect.objectContaining({
        group: 'crm',
        state: 'notInstalled',
        hubPlugin: expect.objectContaining({ identifier: 'crm' }),
      }),
    ]);
    expect(detail.capabilities.capabilities.map((c: any) => c.capability)).toContain(
      'network.send'
    );
  });

  it('reads an app: pages, the workflows it installs and what they can do together', async () => {
    const detail: any = await hubItemDetail(hub.id, 'app', 'records');
    expect(detail.type).toBe('app');
    expect(detail.pages).toEqual([
      { id: 'main', name: 'Main' },
      { id: 'edit', name: 'edit' },
    ]);
    expect(detail.workflows).toEqual([
      { alias: 'list', name: 'List records', hubIdentifier: 'list-records' },
      { alias: 'sum', name: 'Summarize', hubIdentifier: 'summarize' },
      { alias: 'gone', name: 'not-listed', hubIdentifier: 'not-listed', notOnHub: true },
      { alias: 'local', name: 'abc-123' },
    ]);
    expect(detail.capabilities.capabilities.map((c: any) => c.capability)).toContain(
      'network.send'
    );
    expect(detail.missingPlugins.map((p: any) => p.group)).toEqual(['crm']);
  });

  it("lists a plugin's package without running its code or removing a local hub's file", async () => {
    const detail: any = await hubItemDetail(hub.id, 'plugin', 'crm');
    expect(detail).toEqual({
      type: 'plugin',
      group: 'crm',
      license: 'MIT',
      dependencies: [{ name: 'axios', version: '^1.7.0' }],
      files: [
        { path: 'index.mjs', size: expect.any(Number) },
        { path: 'lib/helpers.js', size: expect.any(Number) },
        { path: 'package.json', size: expect.any(Number) },
      ],
    });
    // A homepage that isn't a web link is dropped.
    expect(detail.homepage).toBeUndefined();
    expect(fs.existsSync(sideEffect)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'crm.zip'))).toBe(true);
  });

  it('says so when the item or hub is not there', async () => {
    await expect(hubItemDetail(hub.id, 'app', 'nope')).rejects.toThrow(
      'app "nope" not found on hub "Team Hub"'
    );
    await expect(hubItemDetail('missing', 'task', 'summarize')).rejects.toThrow(
      'Hub "missing" not found'
    );
  });
});
