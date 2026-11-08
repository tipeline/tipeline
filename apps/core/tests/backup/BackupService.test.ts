import { unseal } from '@utils/secretBox';
import fs from 'fs';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import decompress from 'decompress';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Images live under ~/.tipeline/assets — point that at a scratch folder.
const tipelineDir = vi.hoisted(() => {
  const nodeFs = require('fs') as typeof import('fs');
  const nodeOs = require('os') as typeof import('os');
  const nodePath = require('path') as typeof import('path');
  return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'backup-home-'));
});
vi.mock('@/asset/AssetService', () => ({ TIPELINE_DIR: tipelineDir }));

import { BackupService } from '@/backup/BackupService';
import { Parser } from '@utils/Parser';

// Against a real (in-memory) SQLite with the real migrations: a backup taken,
// the database emptied, and the backup restored must give back the same rows,
// with every identifier — and so every app/schedule → workflow link — intact.
let knex: Knex;

const TABLES = ['project_map', 'schedule', 'task_tag', 'tag', 'app', 'task', 'project', 'global_variable'];

const workflowSource = (name: string) =>
  JSON.stringify({ name, version: '1.0.0', tags: ['ops'], pipeline: { actions: [{ type: 'log.info', message: 'hi' }] } });
const appSource = (...workflows: string[]) =>
  JSON.stringify({
    schemaVersion: 4,
    workflows: Object.fromEntries(workflows.map((id, i) => [`wf${i + 1}`, { identifier: id }])),
    pages: [{ id: 'home', title: 'Home', components: [] }],
  });

async function seed() {
  const [sales] = await knex('project').insert({
    identifier: 'p-sales',
    name: 'Sales',
    description: 'Deals',
    color: '#f00',
    instructions: 'Prod is crm-01.',
  });
  // The project map's plan goes with the project.
  await knex('project_map').insert({
    project_id: sales,
    data: JSON.stringify({
      version: 1,
      nodes: [{ id: 'n1', kind: 'workflow', name: 'Warm cache', inputs: ['tag'], outputs: [] }],
      edges: [{ id: 'e1', from: 'plan:n1', to: 'app:app-deals', kind: 'runs' }],
      positions: { 'plan:n1': { x: 40, y: 40 } },
      meta: { 'task:wf-crm': { owner: 'Ana', readyAt: '2026-11-01T10:00:00.000Z', readyBy: 'Ana' } },
      lanes: ['TAM'],
      ignored: [],
      notes: [{ id: 's1', text: 'Ask the AM team', x: 10, y: 20, w: 220, color: 'yellow' }],
    }),
  });
  const [crm] = await knex('task').insert({
    identifier: 'wf-crm',
    name: 'CRM lookup',
    description: 'Finds a customer',
    author: 'Jose',
    version: '1.2.0',
    platform: 'macos',
    metadata: JSON.stringify({ image: 'assets/tasks/wf-crm.png' }),
    source: workflowSource('CRM lookup'),
    project_id: sales,
  });
  await knex('task').insert({ identifier: 'wf-mail', name: 'Send mail', source: workflowSource('Send mail') });
  // Never saved: nothing to back up.
  await knex('task').insert({ identifier: 'wf-empty', name: 'Empty', source: null });
  const [tag] = await knex('tag').insert({ label: 'urgent' });
  await knex('task_tag').insert({ task_id: crm, tag_id: tag });

  await knex('app').insert({
    identifier: 'app-deals',
    name: 'Deals',
    version: '2.0.0',
    metadata: JSON.stringify({ image: 'assets/apps/app-deals.webp' }),
    source: appSource('wf-crm', 'wf-mail'),
    project_id: sales,
  });

  await knex('schedule').insert([
    { identifier: 'sch-daily', task_id: crm, cron: '0 9 * * *', variables: JSON.stringify({ region: 'eu' }), enabled: true },
    { identifier: 'sch-off', task_id: crm, cron: '0 0 * * 0', variables: '{}', enabled: false },
    // One-time: no cron, a time to run once.
    { identifier: 'sch-once', task_id: crm, cron: null, run_at: '2026-11-01T08:00:00.000Z', variables: '{}', enabled: true },
  ]);

  await knex('global_variable').insert([
    { identifier: 'gv-1', name: 'apiUrl', type: 'string', value: JSON.stringify('https://x.test'), secret: false, readonly: false },
    { identifier: 'gv-2', name: 'apiKey', type: 'string', value: JSON.stringify('s3cret'), secret: true, readonly: false },
    { identifier: 'gv-3', name: 'limits', type: 'object', value: JSON.stringify({ max: 5 }), secret: false, readonly: true },
  ]);

  fs.mkdirSync(path.join(tipelineDir, 'assets/tasks'), { recursive: true });
  fs.mkdirSync(path.join(tipelineDir, 'assets/apps'), { recursive: true });
  fs.writeFileSync(path.join(tipelineDir, 'assets/tasks/wf-crm.png'), 'png-bytes');
  fs.writeFileSync(path.join(tipelineDir, 'assets/apps/app-deals.webp'), 'webp-bytes');
}

async function wipe() {
  for (const table of TABLES) await knex(table).delete();
  fs.rmSync(path.join(tipelineDir, 'assets'), { recursive: true, force: true });
}

// Rows as a user sees them: no autoincrement ids or timestamps.
async function snapshot() {
  const projects = await knex('project')
    .select('identifier', 'name', 'description', 'color', 'instructions')
    .orderBy('identifier');
  const tasks = await knex('task')
    .leftJoin('project', 'project.id', 'task.project_id')
    .whereNotNull('task.source')
    .select('task.identifier', 'task.name', 'task.description', 'task.author', 'task.version', 'task.platform', 'task.metadata', 'task.source', 'project.identifier as project')
    .orderBy('task.identifier');
  const tags = await knex('task_tag')
    .join('task', 'task.id', 'task_tag.task_id')
    .join('tag', 'tag.id', 'task_tag.tag_id')
    .select('task.identifier', 'tag.label')
    .orderBy(['task.identifier', 'tag.label']);
  const apps = await knex('app')
    .leftJoin('project', 'project.id', 'app.project_id')
    .select('app.identifier', 'app.name', 'app.version', 'app.metadata', 'app.source', 'project.identifier as project')
    .orderBy('app.identifier');
  const schedules = await knex('schedule')
    .join('task', 'task.id', 'schedule.task_id')
    .select('schedule.identifier', 'task.identifier as workflow', 'schedule.cron', 'schedule.run_at', 'schedule.variables')
    .orderBy('schedule.identifier');
  const maps = (
    await knex('project_map')
      .join('project', 'project.id', 'project_map.project_id')
      .select('project.identifier', 'project_map.data')
      .orderBy('project.identifier')
  ).map((m: any) => ({ project: m.identifier, data: JSON.parse(m.data) }));
  const variables = (await knex('global_variable').select('name', 'type', 'value', 'secret', 'readonly').orderBy('name')).map(
    (v: any) => ({ ...v, value: unseal(v.value) })
  );
  return {
    projects,
    maps,
    tasks: tasks.map((t) => ({ ...t, metadata: JSON.parse(t.metadata ?? 'null'), source: JSON.parse(t.source) })),
    tags,
    apps: apps.map((a) => ({ ...a, metadata: JSON.parse(a.metadata ?? 'null'), source: JSON.parse(a.source) })),
    schedules: schedules.map((s) => ({ ...s, variables: JSON.parse(s.variables) })),
    variables,
  };
}

const tmpZip = (name = 'backup.zip') => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'backup-')), name);

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
  return target;
}

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
afterAll(async () => {
  await knex.destroy();
  fs.rmSync(tipelineDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await wipe();
  await seed();
});

describe('BackupService.create', () => {
  it('writes workflows, apps, projects, schedules, variables and images', async () => {
    const target = tmpZip();
    const result = await BackupService.create(target, false);

    expect(result).toEqual({ projectCount: 1, taskCount: 2, appCount: 1, scheduleCount: 3, variableCount: 3, secretsRedacted: 1 });
    const files = (await decompress(target)).map((f) => f.path).sort();
    expect(files).toEqual([
      'apps/deals.yml',
      'assets/apps/app-deals.webp',
      'assets/tasks/wf-crm.png',
      'globals.yml',
      'manifest.json',
      'tasks/crm-lookup.yml',
      'tasks/send-mail.yml',
    ]);
  });

  it('names clashing files apart and says in the manifest which file is whose', async () => {
    await knex('task').where({ identifier: 'wf-mail' }).update({ name: 'CRM lookup' });
    const target = tmpZip();
    await BackupService.create(target, false);

    const files = await decompress(target);
    const manifest = JSON.parse(files.find((f) => f.path === 'manifest.json')!.data.toString());
    expect(manifest.version).toBe(3);
    expect(manifest.tasks.map((t: any) => [t.identifier, t.file])).toEqual([
      ['wf-crm', 'tasks/crm-lookup-wfcrm.yml'],
      ['wf-mail', 'tasks/crm-lookup-wfmail.yml'],
    ]);
    expect(manifest.apps[0].file).toBe('apps/deals.yml');
    for (const entry of manifest.tasks) expect(files.some((f) => f.path === entry.file)).toBe(true);
  });

  it('redacts secrets unless asked to include them', async () => {
    const valueOf = async (includeSecrets: boolean) => {
      const target = tmpZip();
      await BackupService.create(target, includeSecrets);
      const globals = (await decompress(target)).find((f) => f.path === 'globals.yml')!;
      return (Parser.importFromString(globals.data.toString()) as any).variables.find((v: any) => v.name === 'apiKey').value;
    };
    expect(await valueOf(false)).toBeNull();
    expect(await valueOf(true)).toBe('s3cret');
  });

  it('leaves out an image whose file is gone', async () => {
    fs.rmSync(path.join(tipelineDir, 'assets/apps/app-deals.webp'));
    const target = tmpZip();
    await BackupService.create(target, false);
    const manifest = JSON.parse((await decompress(target)).find((f) => f.path === 'manifest.json')!.data.toString());
    expect(manifest.apps[0].metadata).toEqual({});
  });

  it('fails when there is nothing to back up', async () => {
    await wipe();
    await expect(BackupService.create(tmpZip(), false)).rejects.toThrow('Nothing to back up');
  });
});

describe('BackupService.restore', () => {
  it('restores everything into an empty database, identifiers included', async () => {
    const before = await snapshot();
    const target = tmpZip();
    await BackupService.create(target, true);
    await wipe();

    const { result, startSchedules, stopSchedules } = await BackupService.restore(target);

    expect(await snapshot()).toEqual(before);
    expect(result.tasks).toEqual({ added: 2, replaced: 0, skipped: 0 });
    expect(result.apps).toEqual({ added: 1, replaced: 0, skipped: 0 });
    expect(result.projects).toEqual({ added: 1, replaced: 0, skipped: 0 });
    expect(result.schedules).toEqual({ added: 3, replaced: 0, skipped: 0 });
    expect(result.variables).toEqual({ added: 3, replaced: 0, skipped: 0 });
    expect(result.secretsWithoutValue).toEqual([]);
    // Written disabled; only the one that was on is handed back to start.
    expect(await knex('schedule').pluck('enabled')).toEqual([0, 0, 0]);
    expect(startSchedules).toEqual(['sch-daily', 'sch-once']);
    expect(stopSchedules).toEqual([]);
    expect(fs.readFileSync(path.join(tipelineDir, 'assets/tasks/wf-crm.png'), 'utf8')).toBe('png-bytes');
    expect(fs.readFileSync(path.join(tipelineDir, 'assets/apps/app-deals.webp'), 'utf8')).toBe('webp-bytes');
  });

  it('keeps what already exists by default', async () => {
    const target = tmpZip();
    await BackupService.create(target, true);
    await knex('task').where({ identifier: 'wf-crm' }).update({ name: 'Edited' });
    await knex('task').where({ identifier: 'wf-mail' }).delete();

    const { result } = await BackupService.restore(target, 'skip');

    expect(result.tasks).toEqual({ added: 1, replaced: 0, skipped: 1 });
    expect(result.apps.skipped).toBe(1);
    expect(result.variables.skipped).toBe(3);
    expect(await knex('task').where({ identifier: 'wf-crm' }).first('name')).toEqual({ name: 'Edited' });
    expect(await knex('task').where({ identifier: 'wf-mail' }).first('name')).toEqual({ name: 'Send mail' });
  });

  it('overwrites what already exists in replace mode', async () => {
    const target = tmpZip();
    await BackupService.create(target, true);
    const before = await snapshot();
    await knex('task').where({ identifier: 'wf-crm' }).update({ name: 'Edited', project_id: null });
    await knex('task_tag').delete();
    await knex('schedule').where({ identifier: 'sch-daily' }).update({ cron: '* * * * *' });
    await knex('global_variable').where({ name: 'apiUrl' }).update({ value: JSON.stringify('changed') });

    const { result, startSchedules, stopSchedules } = await BackupService.restore(target, 'replace');

    expect(await snapshot()).toEqual(before);
    expect(result.tasks).toEqual({ added: 0, replaced: 2, skipped: 0 });
    expect(stopSchedules).toEqual(['sch-daily', 'sch-off', 'sch-once']);
    expect(startSchedules).toEqual(['sch-daily', 'sch-once']);
  });

  it('never wipes a secret the backup left out', async () => {
    const target = tmpZip();
    await BackupService.create(target, false);

    const { result } = await BackupService.restore(target, 'replace');
    expect(unseal((await knex('global_variable').where({ name: 'apiKey' }).first('value')).value)).toBe(JSON.stringify('s3cret'));
    expect(result.secretsWithoutValue).toEqual([]);

    await wipe();
    const fresh = await BackupService.restore(target);
    expect(fresh.result.secretsWithoutValue).toEqual(['apiKey']);
    expect(await knex('global_variable').where({ name: 'apiKey' }).first('secret', 'value')).toEqual({ secret: 1, value: 'null' });
  });

  it('restores a version 1 backup (workflows and variables only)', async () => {
    const target = await zip(tmpZip(), {
      'tasks/wf-old.yml': Parser.exportToString({ name: 'Old one', description: 'From v1', version: '0.9.0', tags: ['legacy'], pipeline: { actions: [] } }),
      'globals.yml': Parser.exportToString({ variables: [{ name: 'region', type: 'string', value: 'eu', secret: false, readonly: false }] }),
      'manifest.json': JSON.stringify({ version: 1, taskCount: 1, variableCount: 1 }),
    });
    await wipe();

    const { result } = await BackupService.restore(target);

    expect(result.version).toBe(1);
    expect(await knex('task').where({ identifier: 'wf-old' }).first('name', 'description', 'version')).toEqual({
      name: 'Old one',
      description: 'From v1',
      version: '0.9.0',
    });
    expect(await knex('tag').pluck('label')).toEqual(['legacy']);
    expect(await knex('global_variable').where({ name: 'region' }).first('value')).toEqual({ value: JSON.stringify('eu') });
  });

  it('restores a version 2 backup, whose files are named by identifier', async () => {
    const target = await zip(tmpZip(), {
      'tasks/wf-two.yml': Parser.exportToString({ name: 'Two', pipeline: { actions: [] } }),
      'apps/app-two.yml': Parser.exportToString(JSON.parse(appSource('wf-two'))),
      'manifest.json': JSON.stringify({
        version: 2,
        tasks: [{ identifier: 'wf-two', name: 'Two', version: '1.0.0' }],
        apps: [{ identifier: 'app-two', name: 'Two app', version: '1.0.0' }],
      }),
    });
    await wipe();

    const { result } = await BackupService.restore(target);

    expect(result.tasks.added).toBe(1);
    expect(result.apps.added).toBe(1);
    expect(await knex('app').where({ identifier: 'app-two' }).first('name')).toEqual({ name: 'Two app' });
  });

  it('rejects a manifest file path outside its folder', async () => {
    const target = await zip(tmpZip(), {
      'manifest.json': JSON.stringify({ version: 3, tasks: [{ identifier: 'wf-x', name: 'x', file: 'apps/../../evil.yml' }] }),
    });
    await expect(BackupService.restore(target)).rejects.toThrow('Invalid file for wf-x in backup');
  });

  it('skips a schedule whose workflow is not there, with a warning', async () => {
    const target = await zip(tmpZip(), {
      'manifest.json': JSON.stringify({
        version: 2,
        schedules: [{ identifier: 'sch-x', workflow: 'wf-gone', cron: '* * * * *', enabled: true }],
      }),
    });

    const { result, startSchedules } = await BackupService.restore(target);

    expect(result.warnings).toEqual(['Schedule sch-x skipped: its workflow wf-gone is not installed']);
    expect(startSchedules).toEqual([]);
  });

  it('writes nothing when any part of the archive is bad', async () => {
    await wipe();
    const target = await zip(tmpZip(), {
      'tasks/wf-ok.yml': Parser.exportToString({ name: 'Fine', pipeline: { actions: [] } }),
      'manifest.json': JSON.stringify({
        version: 2,
        tasks: [{ identifier: 'wf-ok', name: 'Fine' }, { identifier: 'wf-missing', name: 'No file' }],
      }),
    });

    await expect(BackupService.restore(target)).rejects.toThrow('Workflow wf-missing is missing its tasks/wf-missing.yml');
    expect(await knex('task').count({ n: '*' })).toEqual([{ n: 0 }]);
  });

  it('rejects identifiers that are not safe file names', async () => {
    const target = await zip(tmpZip(), {
      'manifest.json': JSON.stringify({ version: 2, tasks: [{ identifier: '../../evil', name: 'x' }] }),
    });
    await expect(BackupService.restore(target)).rejects.toThrow('Invalid workflow identifier');
  });

  it('rejects files that are not Tipeline backups', async () => {
    const noManifest = await zip(tmpZip(), { 'readme.txt': 'hi' });
    await expect(BackupService.restore(noManifest)).rejects.toThrow('manifest.json is missing');

    const newer = await zip(tmpZip(), { 'manifest.json': JSON.stringify({ version: 99 }) });
    await expect(BackupService.restore(newer)).rejects.toThrow('made by a newer Tipeline');

    const notZip = tmpZip('plain.zip');
    fs.writeFileSync(notZip, 'not a zip');
    await expect(BackupService.restore(notZip)).rejects.toThrow();
  });
});

describe('BackupService.readWorkflows', () => {
  it('reads the workflows in an archive without writing anything', async () => {
    const target = await zip(tmpZip(), {
      'tasks/wf-old.yml': Parser.exportToString({
        name: 'Old one',
        pipeline: { actions: [{ group: 'file', name: 'remove', params: { src: '/tmp/x' } }] },
      }),
      'manifest.json': JSON.stringify({ version: 1 }),
    });
    const before = await snapshot();

    expect(await BackupService.readWorkflows(target)).toEqual([
      {
        identifier: 'wf-old',
        name: 'Old one',
        source: { name: 'Old one', pipeline: { actions: [{ group: 'file', name: 'remove', params: { src: '/tmp/x' } }] } },
      },
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it('checks the archive the way a restore does', async () => {
    const target = tmpZip();
    await BackupService.create(target, false);
    await expect(BackupService.readWorkflows(target, { projectOnly: true })).rejects.toThrow('Not a project export');
  });
});

describe('project export / import', () => {
  // Sales owns wf-crm and app-deals; app-deals also uses wf-mail (no project), and
  // wf-crm calls wf-sub, which reads a global. Ops is another project entirely.
  beforeEach(async () => {
    await knex('task')
      .where({ identifier: 'wf-crm' })
      .update({
        source: JSON.stringify({
          name: 'CRM lookup',
          pipeline: {
            actions: [{ group: 'flow', name: 'if', actions: [{ group: 'subtask', name: 'exec', params: { identifier: 'wf-sub' } }] }],
          },
        }),
      });
    await knex('task').insert({
      identifier: 'wf-sub',
      name: 'Sub',
      source: JSON.stringify({ name: 'Sub', pipeline: { actions: [{ params: { url: '{{ _global.apiUrl }}', key: '{= _global.apiKey =}' } }] } }),
    });
    const [ops] = await knex('project').insert({ identifier: 'p-ops', name: 'Ops' });
    await knex('task').insert({ identifier: 'wf-ops', name: 'Ops job', source: workflowSource('Ops job'), project_id: ops });
    await knex('app').insert({ identifier: 'app-ops', name: 'Ops', source: appSource('wf-ops'), project_id: ops });
  });

  it('exports the project, its apps, the workflows they reach and the globals those use', async () => {
    const target = tmpZip();
    const result = await BackupService.create(target, false, { project: 'p-sales' });

    expect(result).toEqual({ projectCount: 1, taskCount: 3, appCount: 1, scheduleCount: 0, variableCount: 2, secretsRedacted: 1 });
    const files = await decompress(target);
    expect(files.map((f) => f.path).filter((p) => !p.startsWith('assets/')).sort()).toEqual([
      'apps/deals.yml',
      'globals.yml',
      'manifest.json',
      'tasks/crm-lookup.yml',
      'tasks/send-mail.yml',
      'tasks/sub.yml',
    ]);
    const manifest = JSON.parse(files.find((f) => f.path === 'manifest.json')!.data.toString());
    expect(manifest.scope).toEqual({ kind: 'project', project: 'p-sales' });
    expect(manifest.projects.map((p: any) => p.identifier)).toEqual(['p-sales']);
    expect(manifest.tasks.find((t: any) => t.identifier === 'wf-mail').project).toBeNull();
    const globals = Parser.importFromString(files.find((f) => f.path === 'globals.yml')!.data.toString()) as any;
    expect(globals.variables.map((v: any) => v.name).sort()).toEqual(['apiKey', 'apiUrl']);
  });

  it('fails for an unknown project', async () => {
    await expect(BackupService.create(tmpZip(), false, { project: 'nope' })).rejects.toThrow('Project not found');
  });

  it('imports into another Tipeline with every link intact', async () => {
    const target = tmpZip();
    await BackupService.create(target, true, { project: 'p-sales' });
    await wipe();

    const { result, startSchedules } = await BackupService.restore(target, 'skip', { projectOnly: true });

    expect(result.project).toEqual({ identifier: 'p-sales', name: 'Sales' });
    expect(result.tasks.added).toBe(3);
    expect(result.apps.added).toBe(1);
    expect(result.variables.added).toBe(2);
    expect(startSchedules).toEqual([]);
    const crm = await knex('task').join('project', 'project.id', 'task.project_id').where('task.identifier', 'wf-crm').first('project.identifier');
    expect(crm.identifier).toBe('p-sales');
    expect(await knex('app').pluck('identifier')).toEqual(['app-deals']);
    expect(unseal((await knex('global_variable').where({ name: 'apiKey' }).first('value')).value)).toBe(JSON.stringify('s3cret'));
  });

  it('keeps existing items on a re-import unless asked to replace them', async () => {
    const target = tmpZip();
    await BackupService.create(target, false, { project: 'p-sales' });
    await knex('task').where({ identifier: 'wf-crm' }).update({ name: 'Edited' });

    const { result } = await BackupService.restore(target, 'skip', { projectOnly: true });
    expect(result.tasks).toEqual({ added: 0, replaced: 0, skipped: 3 });
    expect(await knex('task').where({ identifier: 'wf-crm' }).first('name')).toEqual({ name: 'Edited' });

    await BackupService.restore(target, 'replace', { projectOnly: true });
    expect(await knex('task').where({ identifier: 'wf-crm' }).first('name')).toEqual({ name: 'CRM lookup' });
    // A redacted secret still never wipes the value already here.
    expect(unseal((await knex('global_variable').where({ name: 'apiKey' }).first('value')).value)).toBe(JSON.stringify('s3cret'));
  });

  it('refuses a full backup as a project import', async () => {
    const target = tmpZip();
    await BackupService.create(target, false);
    await expect(BackupService.restore(target, 'skip', { projectOnly: true })).rejects.toThrow('Not a project export');
  });
});
