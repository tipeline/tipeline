import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/TaskService', () => ({
  TaskService: { install: vi.fn(), getByBundleFingerprint: vi.fn() },
}));
vi.mock('@database/services/AppService', () => ({ AppService: { install: vi.fn() } }));

import Core from '@engine/Core';
import { TaskService } from '@database/services/TaskService';
import { AppService } from '@database/services/AppService';
import { Parser } from '@utils/Parser';
import { TaskValidator } from '@validation/TaskValidation';

// Installs the shipped example apps through the real Core.appInstall path (only the
// database writes are mocked), so the examples — and the workflows they bundle with
// `workflows: { alias: { file } }` — can't drift from what an install accepts.
const EXAMPLES = path.resolve(__dirname, '../../../../examples/apps');
const appFiles = fs.readdirSync(EXAMPLES).filter((f) => f.endsWith('.yml'));

// In-memory stand-in for the task table: what was installed, with its metadata.
let installedWorkflows: Array<{ identifier: string; name: string; metadata?: any }> = [];

beforeEach(() => {
  installedWorkflows = [];
  vi.mocked(TaskService.install)
    .mockReset()
    .mockImplementation(async (data: any) => {
      const row = {
        identifier: `wf-${installedWorkflows.length + 1}`,
        name: data.name,
        metadata: data.metadata,
      };
      installedWorkflows.push(row);
      return row as any;
    });
  vi.mocked(TaskService.getByBundleFingerprint)
    .mockReset()
    .mockImplementation(
      async (fp: string) =>
        installedWorkflows.find((w) => w.metadata?.bundleFingerprint === fp) as any
    );
  vi.mocked(AppService.install)
    .mockReset()
    .mockImplementation(async (data: any) => data);
});

describe('examples/apps', () => {
  // Which workflows each example bundles (by name, in `workflows` order).
  const BUNDLED: Record<string, string[]> = {
    'simple-dashboard.yml': ['List Records', 'Update Record Status'],
    'multi-page-app.yml': ['List Records', 'Update Record Status'],
    'records-manager.yml': ['List Records', 'Add Record', 'Update Record Status', 'Delete Record'],
    'expense-approvals.yml': ['List Expenses', 'Submit Expense'],
    'layout-showcase.yml': ['List Records'],
    'records-grid.yml': ['List Records', 'Save Record Changes', 'Set Records Status'],
    'record-details.yml': ['List Records'],
    'activity-log.yml': ['Log Note'],
    'record-cards.yml': ['List Records', 'Set Records Status'],
    'qr-code-maker.yml': ['Make QR Code'],
    'choice-fields.yml': [],
    'table-features.yml': [],
    'signup-wizard.yml': [],
    'search-select.yml': ['Search Records'],
    'json-viewer.yml': ['List Records'],
    'live-dashboard.yml': ['List Records'],
    'file-intake.yml': ['Collect Files'],
    'record-drawer.yml': ['List Records', 'Update Record Status'],
    'runs-monitor.yml': ['Slow Job', 'Failing Job', 'List Records'],
    'progress-showcase.yml': ['List Records'],
    'open-links-files.yml': ['Write Report'],
    'pdf-viewer.yml': ['Make Invoice PDF'],
    'input-types.yml': [],
    'button-groups.yml': ['List Records', 'Update Record Status'],
    'chat.yml': ['Chat Echo', 'Chat with AI'],
    'code-input.yml': ['Inspect JSON'],
    'rich-text.yml': ['Make Email Draft'],
    'map.yml': ['List Places'],
    'calendar.yml': ['List Bookings'],
    'more-charts.yml': ['Sales Stats'],
    'accordion.yml': ['List Records', 'Update Record Status'],
    'slider-filters.yml': ['Search Listings'],
    'embed.yml': ['Make HTML Report'],
    'task-board.yml': ['List Tasks', 'Move Task'],
    'order-tracking.yml': ['Order History'],
    'media.yml': ['Make Tone'],
    'custom-component.yml': ['List Seats', 'Book Seats'],
    'page-sections.yml': [],
    'gallery.yml': ['Make Postcards'],
    'orders-browser.yml': ['List Orders'],
    'document-library.yml': ['List Documents'],
    'color-palette.yml': ['Make Palette'],
    'team-directory.yml': ['List People'],
    'cache-demo.yml': ['Slow Report'],
    'cms.yml': [
      'CMS: Install',
      'CMS: Dashboard',
      'CMS: List Content',
      'CMS: Set Status',
      'CMS: Delete Content',
      'CMS: Get Content',
      'CMS: Save Content',
      'CMS: List Revisions',
      'CMS: Revert Revision',
      'CMS: List Content Types',
      'CMS: Save Content Type',
      'CMS: Delete Content Type',
      'CMS: Save Field',
      'CMS: Delete Field',
      'CMS: List Terms',
      'CMS: Save Term',
      'CMS: Delete Term',
      'CMS: Save Vocabulary',
      'CMS: List Media',
      'CMS: Import Media',
      'CMS: Delete Media',
      'CMS: List Templates',
      'CMS: Save Template',
      'CMS: Render Preview',
      'CMS: Export Site',
      'CMS: Publish Status',
      'CMS: Deploy to Cloudflare',
    ],
  };

  it('every example app is covered here', () => {
    expect(appFiles.sort()).toEqual(Object.keys(BUNDLED).sort());
  });

  it.each(appFiles)('%s installs with its bundled workflows', async (file) => {
    const app: any = await Core.appInstall(path.join(EXAMPLES, file));
    const source = JSON.parse(app.source);

    expect(source.schemaVersion).toBe(4);
    expect(installedWorkflows.map((w) => w.name)).toEqual(BUNDLED[file]);
    expect(Object.values(source.workflows)).toEqual(
      installedWorkflows.map((w) => ({ identifier: w.identifier }))
    );
  });

  it('installing every example installs each distinct workflow once', async () => {
    for (const file of appFiles) await Core.appInstall(path.join(EXAMPLES, file));
    expect(installedWorkflows.map((w) => w.name).sort()).toEqual([
      'Add Record',
      'Book Seats',
      'CMS: Dashboard',
      'CMS: Delete Content',
      'CMS: Delete Content Type',
      'CMS: Delete Field',
      'CMS: Delete Media',
      'CMS: Delete Term',
      'CMS: Deploy to Cloudflare',
      'CMS: Export Site',
      'CMS: Get Content',
      'CMS: Import Media',
      'CMS: Install',
      'CMS: List Content',
      'CMS: List Content Types',
      'CMS: List Media',
      'CMS: List Revisions',
      'CMS: List Templates',
      'CMS: List Terms',
      'CMS: Publish Status',
      'CMS: Render Preview',
      'CMS: Revert Revision',
      'CMS: Save Content',
      'CMS: Save Content Type',
      'CMS: Save Field',
      'CMS: Save Template',
      'CMS: Save Term',
      'CMS: Save Vocabulary',
      'CMS: Set Status',
      'Chat Echo',
      'Chat with AI',
      'Collect Files',
      'Delete Record',
      'Failing Job',
      'Inspect JSON',
      'List Bookings',
      'List Documents',
      'List Expenses',
      'List Orders',
      'List People',
      'List Places',
      'List Records',
      'List Seats',
      'List Tasks',
      'Log Note',
      'Make Email Draft',
      'Make HTML Report',
      'Make Invoice PDF',
      'Make Palette',
      'Make Postcards',
      'Make QR Code',
      'Make Tone',
      'Move Task',
      'Order History',
      'Sales Stats',
      'Save Record Changes',
      'Search Listings',
      'Search Records',
      'Set Records Status',
      'Slow Job',
      'Slow Report',
      'Submit Expense',
      'Update Record Status',
      'Write Report',
    ]);
  });

  it('apps that bundle the same workflow files share one install', async () => {
    const first: any = await Core.appInstall(path.join(EXAMPLES, 'simple-dashboard.yml'));
    const second: any = await Core.appInstall(path.join(EXAMPLES, 'multi-page-app.yml'));
    const third: any = await Core.appInstall(path.join(EXAMPLES, 'simple-dashboard.yml'));

    expect(installedWorkflows).toHaveLength(2);
    expect(JSON.parse(second.source).workflows).toEqual(JSON.parse(first.source).workflows);
    expect(JSON.parse(third.source).workflows).toEqual(JSON.parse(first.source).workflows);
    expect(
      installedWorkflows.every((w) => /^[0-9a-f]{64}$/.test(w.metadata.bundleFingerprint))
    ).toBe(true);
  });

  it('a changed workflow file is installed as a new workflow', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-app-'));
    fs.mkdirSync(path.join(dir, 'workflows'));
    for (const f of ['list-records.yml', 'update-record-status.yml']) {
      fs.copyFileSync(path.join(EXAMPLES, 'workflows', f), path.join(dir, 'workflows', f));
    }
    const app = path.join(dir, 'simple-dashboard.yml');
    fs.copyFileSync(path.join(EXAMPLES, 'simple-dashboard.yml'), app);

    await Core.appInstall(app);
    const listFile = path.join(dir, 'workflows/list-records.yml');
    fs.writeFileSync(
      listFile,
      fs.readFileSync(listFile, 'utf8').replace('version: 1.0.0', 'version: 1.1.0')
    );
    await Core.appInstall(app);

    expect(installedWorkflows.map((w) => w.name)).toEqual([
      'List Records',
      'Update Record Status',
      'List Records',
    ]);
  });

  it('the bundled workflows expose exactly what the apps wire up', () => {
    const vars = (file: string) => {
      const wf = TaskValidator.validateFormat(
        Parser.importFromFile(path.join(EXAMPLES, 'workflows', file))
      );
      return Object.fromEntries(
        (wf.pipeline.variables ?? []).map((v: any) => [v.name, v.visibility ?? 'private'])
      );
    };

    expect(vars('list-records.yml')).toMatchObject({
      status: 'public',
      records: 'public',
      summary: 'public',
      raw: 'private',
    });
    expect(vars('update-record-status.yml')).toMatchObject({
      id: 'public',
      status: 'public',
      record: 'public',
      raw: 'private',
    });
    expect(vars('add-record.yml')).toMatchObject({
      name: 'public',
      status: 'public',
      amount: 'public',
      record: 'public',
      raw: 'private',
    });
    expect(vars('delete-record.yml')).toMatchObject({
      id: 'public',
      record: 'public',
      raw: 'private',
    });
  });
});

describe('Core.appInstall with workflow files', () => {
  function writeApp(dir: string, yaml: string) {
    const file = path.join(dir, 'app.yml');
    fs.writeFileSync(file, yaml);
    return file;
  }

  it('installs nothing when the app itself is invalid', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-app-'));
    fs.copyFileSync(path.join(EXAMPLES, 'workflows/list-records.yml'), path.join(dir, 'wf.yml'));
    const file = writeApp(
      dir,
      `schemaVersion: 2\nname: Broken\nworkflows:\n  list: { file: ./wf.yml }\npages:\n  - id: p\n    name: P\n    runnables:\n      r: { mode: run, workflow: missing }\n`
    );

    await expect(Core.appInstall(file)).rejects.toThrow('unknown workflow alias "missing"');
    expect(TaskService.install).not.toHaveBeenCalled();
    expect(AppService.install).not.toHaveBeenCalled();
  });

  it('reports a missing workflow file before installing anything', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-app-'));
    const file = writeApp(
      dir,
      `schemaVersion: 2\nname: Missing\nworkflows:\n  list: { file: ./nope.yml }\npages:\n  - { id: p, name: P }\n`
    );

    await expect(Core.appInstall(file)).rejects.toThrow('Workflow file for "list" not found');
    expect(TaskService.install).not.toHaveBeenCalled();
  });
});
