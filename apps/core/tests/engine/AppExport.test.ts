import fs from 'fs';
import os from 'os';
import path from 'path';
import decompress from 'decompress';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/TaskService', () => ({
  TaskService: { install: vi.fn(), getByBundleFingerprint: vi.fn(), getByIdentifier: vi.fn() },
}));
vi.mock('@database/services/AppService', () => ({
  AppService: { install: vi.fn(), getAll: vi.fn(), getByIdentifier: vi.fn() },
}));

import Core from '@engine/Core';
import { TaskService } from '@database/services/TaskService';
import { AppService } from '@database/services/AppService';
import { Parser } from '@utils/Parser';

// Exports through the real Core.appExport and installs the result again through the
// real Core.appInstall (only the database is mocked), so an export always round-trips.
const EXAMPLES = path.resolve(__dirname, '../../../../examples/apps');

// In-memory stand-ins for the task and app tables.
let workflows: Array<{ identifier: string; name: string; source: string; metadata?: any }> = [];
let apps: Array<{ identifier: string; name: string; description?: string; author?: string; version: string; source: string }> = [];

beforeEach(() => {
  workflows = [];
  apps = [];
  vi.mocked(TaskService.install)
    .mockReset()
    .mockImplementation(async (data: any) => {
      const row = { ...data, identifier: `wf-${workflows.length + 1}` };
      workflows.push(row);
      return row;
    });
  vi.mocked(TaskService.getByBundleFingerprint)
    .mockReset()
    .mockImplementation(async (fp: string) => workflows.find((w) => w.metadata?.bundleFingerprint === fp) as any);
  vi.mocked(TaskService.getByIdentifier)
    .mockReset()
    .mockImplementation(async (id: string) => workflows.find((w) => w.identifier === id) as any);
  vi.mocked(AppService.install)
    .mockReset()
    .mockImplementation(async (data: any) => {
      const row = { ...data, identifier: `app-${apps.length + 1}` };
      apps.push(row);
      return row;
    });
  vi.mocked(AppService.getAll)
    .mockReset()
    .mockImplementation(async () => apps as any);
  vi.mocked(AppService.getByIdentifier)
    .mockReset()
    .mockImplementation(async (id: string) => apps.find((a) => a.identifier === id) as any);
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'app-export-'));
}

describe('Core.appExport', () => {
  it('round-trips an app with its workflows through Install App', async () => {
    const original = await Core.appInstall(path.join(EXAMPLES, 'records-manager.yml'));
    const dir = tmpDir();
    const zip = path.join(dir, 'export.zip');

    const result = await Core.appExport(zip, [original.identifier]);
    expect(result).toEqual({ count: 1, workflowCount: 4 });

    const out = path.join(dir, 'out');
    const files = (await decompress(zip, out)).map((f) => f.path).sort();
    // Named after the app and its workflows, not their identifiers.
    expect(files).toEqual([
      'records-manager.yml',
      'workflows/add-record.yml',
      'workflows/delete-record.yml',
      'workflows/list-records.yml',
      'workflows/update-record-status.yml',
    ]);

    const doc = Parser.importFromFile(path.join(out, 'records-manager.yml')) as any;
    expect(doc.name).toBe('Records Manager');
    expect(doc.workflows.listRecords).toEqual({ file: './workflows/list-records.yml' });
    expect(doc.workflows.deleteRecord).toEqual({ file: './workflows/delete-record.yml' });

    const reinstalled = await Core.appInstall(path.join(out, 'records-manager.yml'));
    expect(reinstalled.identifier).toBe('app-2');
    expect(reinstalled.name).toBe(original.name);
    expect(reinstalled.version).toBe(original.version);
    // Same app, pointing at the reinstalled copies of the same workflows.
    const sourceOf = (app: any) => JSON.parse(app.source);
    const { workflows: before, ...restBefore } = sourceOf(original);
    const { workflows: after, ...restAfter } = sourceOf(reinstalled);
    expect(restAfter).toEqual(restBefore);
    const nameOf = (id: string) => workflows.find((w) => w.identifier === id)!.name;
    for (const alias of Object.keys(before)) {
      expect(nameOf(after[alias].identifier)).toBe(nameOf(before[alias].identifier));
    }
  });

  it('exports every app, writing a shared workflow once', async () => {
    await Core.appInstall(path.join(EXAMPLES, 'simple-dashboard.yml'));
    await Core.appInstall(path.join(EXAMPLES, 'multi-page-app.yml'));
    const dir = tmpDir();
    const zip = path.join(dir, 'all.zip');

    const result = await Core.appExport(zip);

    expect(result).toEqual({ count: 2, workflowCount: 2 });
    const files = (await decompress(zip, path.join(dir, 'out'))).map((f) => f.path).sort();
    expect(files).toEqual([
      'multi-page-app.yml',
      'simple-dashboard.yml',
      'workflows/list-records.yml',
      'workflows/update-record-status.yml',
    ]);
  });

  it('tells apart apps and workflows that share a name, and still installs them', async () => {
    await Core.appInstall(path.join(EXAMPLES, 'simple-dashboard.yml'));
    const second = await Core.appInstall(path.join(EXAMPLES, 'records-manager.yml'));
    second.name = 'Simple Dashboard';
    // A different workflow with the same name as one both apps use.
    workflows.find((w) => w.name === 'Add Record')!.name = 'List Records';
    const dir = tmpDir();
    const zip = path.join(dir, 'all.zip');

    await Core.appExport(zip);

    const out = path.join(dir, 'out');
    const files = (await decompress(zip, out)).map((f) => f.path).sort();
    expect(files.filter((f) => !f.startsWith('workflows/'))).toEqual([
      'simple-dashboard-app1.yml',
      'simple-dashboard-app2.yml',
    ]);
    expect(files.filter((f) => f.startsWith('workflows/list-records-'))).toHaveLength(2);
    expect(new Set(files).size).toBe(files.length);

    const reinstalled = await Core.appInstall(path.join(out, 'simple-dashboard-app2.yml'));
    const after = JSON.parse(reinstalled.source).workflows;
    // Each alias still reaches the same workflow, told apart by description (step identifiers are new on install).
    const contentOf = (id: string) => JSON.parse(workflows.find((w) => w.identifier === id)!.source).description;
    const before = JSON.parse(second.source).workflows;
    for (const alias of Object.keys(before)) {
      expect(contentOf(after[alias].identifier)).toBe(contentOf(before[alias].identifier));
    }
  });

  it('keeps the identifier of a workflow that is no longer installed', async () => {
    const app = await Core.appInstall(path.join(EXAMPLES, 'qr-code-maker.yml'));
    workflows = [];
    const dir = tmpDir();
    const zip = path.join(dir, 'export.zip');

    const result = await Core.appExport(zip, [app.identifier]);

    expect(result.workflowCount).toBe(0);
    await decompress(zip, path.join(dir, 'out'));
    const doc = Parser.importFromFile(path.join(dir, 'out', 'qr-code-maker.yml')) as any;
    expect(Object.values(doc.workflows)).toEqual([{ identifier: 'wf-1' }]);
  });

  it('fails on an unknown app', async () => {
    await expect(Core.appExport(path.join(tmpDir(), 'x.zip'), ['nope'])).rejects.toThrow('App not found: nope');
  });

  it('fails when there are no apps', async () => {
    await expect(Core.appExport(path.join(tmpDir(), 'x.zip'))).rejects.toThrow('No apps with exportable source found');
  });
});
