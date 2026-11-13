import fs from 'fs';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Restores write images under ~/.tipeline — point that at a scratch folder.
const tipelineDir = vi.hoisted(() => {
  const nodeFs = require('fs') as typeof import('fs');
  const nodeOs = require('os') as typeof import('os');
  const nodePath = require('path') as typeof import('path');
  return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'project-examples-'));
});
vi.mock('@/asset/AssetService', () => ({ TIPELINE_DIR: tipelineDir }));

import { coreValidations } from '@tipeline/schemas';
import { BackupService } from '@/backup/BackupService';
import { Parser } from '@utils/Parser';
import { TaskValidator } from '@validation/TaskValidation';

// Each folder in examples/projects is a backup archive's contents (manifest.json,
// globals.yml, tasks/, apps/), zipped and restored through Settings → Restore. These
// checks keep them restorable and runnable: a restore copies sources as they are, so
// nothing an install would fix up (step identifiers, app checks) gets fixed here.
const PROJECTS = path.resolve(__dirname, '../../../../examples/projects');
const projectDirs = fs.readdirSync(PROJECTS).filter((f) => fs.statSync(path.join(PROJECTS, f)).isDirectory());

const read = (dir: string, file: string) => Parser.importFromFile(path.join(PROJECTS, dir, file)) as any;
const manifestOf = (dir: string) => JSON.parse(fs.readFileSync(path.join(PROJECTS, dir, 'manifest.json'), 'utf8'));

/** Every step, nested ones (if/else/loop bodies) included. */
const allSteps = (actions: any[] = []): any[] => actions.flatMap((a) => [a, ...allSteps(a?.params?.actions)]);

const zipFolder = async (dir: string) => {
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'project-example-')), `${dir}.zip`);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(target);
    const archive = archiver('zip');
    out.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(out);
    archive.directory(path.join(PROJECTS, dir), false);
    archive.finalize();
  });
  return target;
};

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
afterAll(async () => {
  await knex.destroy();
  fs.rmSync(tipelineDir, { recursive: true, force: true });
});

describe.each(projectDirs)('examples/projects/%s', (dir) => {
  const manifest = manifestOf(dir);
  const workflowIds = new Set<string>(manifest.tasks.map((t: any) => t.identifier));

  it('lists every file in its folder, and nothing else', () => {
    const listed = [...manifest.tasks, ...manifest.apps].map((e: any) => e.file).sort();
    const onDisk = ['tasks', 'apps'].flatMap((kind) =>
      fs.readdirSync(path.join(PROJECTS, dir, kind)).map((f) => `${kind}/${f}`)
    );
    expect(onDisk.sort()).toEqual(listed);
  });

  it.each(manifest.tasks.map((t: any) => [t.file, t]))('%s is a valid workflow', async (_file, entry: any) => {
    const workflow: any = TaskValidator.validateFormat(read(dir, entry.file));
    const steps = allSteps(workflow.pipeline.actions);
    expect(await TaskValidator.validateActionTypes(steps, 'pipeline.actions', { params: true })).toEqual([]);

    // Runs fail on a step without an identifier, or two with the same one.
    const ids = steps.map((s) => s.identifier);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    // The manifest's copy is what lists show; keep it the same as the file.
    expect(entry.name).toBe(workflow.name);
    expect(entry.description).toBe(workflow.description);

    // Sub-workflows called by identifier come with the project.
    for (const step of steps.filter((s) => s.group === 'subtask' && s.params?.identifier)) {
      expect(workflowIds).toContain(step.params.identifier);
    }
  });

  it.each(manifest.apps.map((a: any) => [a.file, a]))('%s is a valid app source', (_file, entry: any) => {
    const source: any = coreValidations.appObject.parseAppSource(read(dir, entry.file));
    for (const ref of Object.values<any>(source.workflows ?? {})) expect(workflowIds).toContain(ref.identifier);
  });

  it('declares every global its workflows and apps use', () => {
    const declared = (read(dir, 'globals.yml').variables ?? []).map((v: any) => v.name);
    const used = new Set<string>();
    for (const entry of [...manifest.tasks, ...manifest.apps]) {
      const text = fs.readFileSync(path.join(PROJECTS, dir, entry.file), 'utf8');
      for (const m of text.matchAll(/_global\.(\w+)/g)) used.add(m[1]);
    }
    expect(declared.sort()).toEqual([...used].sort());
  });

  it('restores everything, with no warnings', async () => {
    const { result } = await BackupService.restore(await zipFolder(dir), 'skip');
    expect(result.warnings).toEqual([]);
    expect(result.projects.added).toBe(manifest.projects.length);
    expect(result.tasks.added).toBe(manifest.tasks.length);
    expect(result.apps.added).toBe(manifest.apps.length);
    expect(result.schedules.added).toBe(manifest.schedules.length);
    expect(result.variables.added).toBe(read(dir, 'globals.yml').variables.length);

    // The project's map plan comes back too.
    const project = await knex('project').where({ identifier: manifest.projects[0].identifier }).first();
    const map = await knex('project_map').where({ project_id: project.id }).first();
    expect(JSON.parse(map.data).nodes.length).toBe(manifest.projects[0].map?.nodes?.length ?? 0);
  });
});
