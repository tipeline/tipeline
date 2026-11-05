import { redactSecretValues, seal, unseal } from '@utils/secretBox';
import fs from 'fs';
import nodePath from 'path';
import archiver from 'archiver';
import decompress from 'decompress';
import type { Knex } from 'knex';
import { generateIdentifier, readableFileNames } from '@tipeline/utils';
import { Task as TaskModel } from '@database/models/Task';
import { TagService } from '@database/services/TagService';
import { TaskRevisionService } from '@database/services/TaskRevisionService';
import { appWorkflowIdentifiers, calledWorkflowIdentifiers } from '@database/services/WorkflowUsageService';
import { Parser } from '@utils/Parser';
import { TIPELINE_DIR } from '@/asset/AssetService';

/**
 * Full backup / restore of everything a user builds: workflows, apps, projects,
 * schedules, global variables and the workflow/app images.
 *
 * Archive layout (version 3):
 *   manifest.json            — format version, counts, and every row's metadata
 *                              (projects, workflow/app columns + tags + project + file, schedules)
 *   tasks/<workflow-name>.yml — workflow sources (the same file "Export" writes)
 *   apps/<app-name>.yml      — app sources, workflows still referenced by `{ identifier }`
 *   globals.yml              — global variables (secrets redacted unless asked for)
 *   assets/{tasks,apps}/…    — images, at the same path they have under ~/Tipeline
 *
 * File names come from the names (clashing ones get the start of the identifier
 * added); the manifest says which file is whose. Everything keeps its identifier,
 * so apps, schedules and subworkflow calls still point at the right workflow after
 * a restore. Version 2 archives (files named `<identifier>.yml`) and version 1
 * archives (tasks/ + globals.yml only) restore too.
 *
 * Not included: run history, plugins, hubs, remote connections and settings.
 *
 * A project export is the same archive narrowed to one project (manifest `scope`):
 * the project, its workflows and apps, the workflows its apps or workflows call
 * from elsewhere, and the global variables any of them reference. No schedules.
 */

export const BACKUP_VERSION = 3;

export type RestoreMode = 'skip' | 'replace';

type Counts = { added: number; replaced: number; skipped: number };

export type ExportScope = { project: string };

export type RestoreResult = {
  version: number;
  /** Set when the archive is a project export. */
  project?: { identifier: string; name: string };
  projects: Counts;
  tasks: Counts;
  apps: Counts;
  schedules: Counts;
  variables: Counts;
  /** Secret variables the backup had no value for — created or kept without one. */
  secretsWithoutValue: string[];
  /** Things that couldn't be restored, e.g. a schedule whose workflow isn't in the backup. */
  warnings: string[];
};

type ProjectEntry = {
  identifier: string;
  name: string;
  description?: string | null;
  color?: string | null;
  instructions?: string | null;
};
type TaskEntry = {
  identifier: string;
  name: string;
  description?: string | null;
  author?: string | null;
  version?: string | null;
  platform?: string | null;
  metadata?: Record<string, any> | null;
  tags?: string[];
  project?: string | null;
  /** The source's path in the archive (version 3); before that, `<kind>/<identifier>.yml`. */
  file?: string;
};
type AppEntry = Omit<TaskEntry, 'platform' | 'tags'>;
type ScheduleEntry = {
  identifier: string;
  workflow: string;
  /** A repeating schedule has a cron; a one-time schedule has runAt (ISO) instead. */
  cron?: string | null;
  runAt?: string | null;
  /** An interval schedule repeats every this many seconds instead. */
  everySeconds?: number | null;
  variables?: Record<string, any>;
  enabled: boolean;
};
type VariableEntry = {
  name: string;
  description?: string | null;
  type: string;
  value?: unknown;
  secret?: boolean;
  readonly?: boolean;
};

type Manifest = {
  version: number;
  scope?: { kind: 'project'; project: string };
  exportedAt?: string;
  secretsIncluded?: boolean;
  projects?: ProjectEntry[];
  tasks?: TaskEntry[];
  apps?: AppEntry[];
  schedules?: ScheduleEntry[];
};

// nanoid alphabet, as generateIdentifier() produces. Identifiers become file names
// on restore, so anything else in an archive is rejected.
const IDENTIFIER = /^[A-Za-z0-9_-]{1,21}$/;
const SOURCE_FILE = /^(tasks|apps)\/[a-z0-9-]+\.yml$/;
const IMAGE_PATH = /^assets\/(tasks|apps)\/([A-Za-z0-9_-]{1,21})\.(png|jpe?g|webp|svg|gif)$/;

const parseJson = (value: unknown) => {
  if (value == null || typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const emptyCounts = (): Counts => ({ added: 0, replaced: 0, skipped: 0 });

/** Global variable names a source reads or writes (`_global.name`). */
const referencedGlobals = (source: unknown): string[] =>
  [...JSON.stringify(source ?? '').matchAll(/_global\.(\w+)/g)].map((m) => m[1]);

type Rows = { tasks: any[]; apps: any[]; variables: any[] };

/**
 * Narrows the rows to one project: its apps, its workflows plus every workflow
 * those apps or workflows call (followed through), and the globals they use.
 */
const scopeToProject = (projectId: number, rows: Rows): Rows => {
  const apps = rows.apps.filter((a) => a.project_id === projectId);
  const taskByIdentifier = new Map(rows.tasks.map((t) => [t.identifier, t]));
  const included = new Set<string>();
  const queue = [
    ...rows.tasks.filter((t) => t.project_id === projectId).map((t) => t.identifier),
    ...apps.flatMap((a) => appWorkflowIdentifiers(a.source)),
  ];
  while (queue.length) {
    const identifier = queue.shift()!;
    const task = taskByIdentifier.get(identifier);
    if (!task || included.has(identifier)) continue;
    included.add(identifier);
    queue.push(...calledWorkflowIdentifiers(parseJson(task.source)));
  }
  const tasks = rows.tasks.filter((t) => included.has(t.identifier));
  const globals = new Set([...tasks, ...apps].flatMap((row) => referencedGlobals(parseJson(row.source))));
  return { tasks, apps, variables: rows.variables.filter((v) => globals.has(v.name)) };
};

export class BackupService {
  static async create(targetPath: string, includeSecrets: boolean, scope?: ExportScope) {
    const knex = TaskModel.knex();

    let projectRows = await knex('project')
      .select('id', 'identifier', 'name', 'description', 'color', 'instructions')
      .orderBy('id');
    // Every project, so a workflow borrowed from another project keeps pointing at it.
    const projectIdentifier = new Map<number, string>(projectRows.map((p: any) => [p.id, p.identifier]));
    let rows: Rows = {
      tasks: await knex('task').select('*').orderBy('id'),
      apps: await knex('app').select('*').orderBy('id'),
      variables: await knex('global_variable')
        .select('name', 'description', 'type', 'value', 'secret', 'readonly')
        .orderBy('id'),
    };
    if (scope) {
      const project = projectRows.find((p: any) => p.identifier === scope.project);
      if (!project) throw new Error(`Project not found: ${scope.project}`);
      projectRows = [project];
      rows = scopeToProject(project.id, rows);
    }
    const projects: ProjectEntry[] = projectRows.map(({ id: _id, ...p }: any) => p);

    const tagRows = await knex('task_tag').join('tag', 'tag.id', 'task_tag.tag_id').select('task_tag.task_id', 'tag.label');
    const tagsOf = new Map<number, string[]>();
    for (const { task_id, label } of tagRows as any[]) tagsOf.set(task_id, [...(tagsOf.get(task_id) ?? []), label]);

    const files: { name: string; content: string | Buffer }[] = [];
    const images = new Set<string>();
    const withImage = (metadata: Record<string, any> | null) => {
      const image = metadata?.image;
      if (typeof image !== 'string' || !IMAGE_PATH.test(image)) return metadata;
      const absolute = nodePath.join(TIPELINE_DIR, image);
      if (fs.existsSync(absolute)) {
        images.add(image);
        files.push({ name: image, content: fs.readFileSync(absolute) });
        return metadata;
      }
      // The file is gone — don't restore a broken image reference.
      const { image: _missing, ...rest } = metadata!;
      return rest;
    };

    let secretsRedacted = 0;
    const taskFiles = readableFileNames(rows.tasks, 'workflow');
    const tasks: TaskEntry[] = [];
    for (const row of rows.tasks) {
      const source = parseJson(row.source);
      if (!source) continue;
      const file = `tasks/${taskFiles.get(row.identifier)}.yml`;
      const exported = includeSecrets ? { source, count: 0 } : redactSecretValues(source);
      secretsRedacted += exported.count;
      files.push({ name: file, content: Parser.exportToString(exported.source) });
      tasks.push({
        identifier: row.identifier,
        name: row.name,
        description: row.description,
        author: row.author,
        version: row.version,
        platform: row.platform,
        metadata: withImage(parseJson(row.metadata)),
        tags: tagsOf.get(row.id) ?? [],
        project: row.project_id ? projectIdentifier.get(row.project_id) ?? null : null,
        file,
      });
    }

    const appFiles = readableFileNames(rows.apps, 'app');
    const apps: AppEntry[] = [];
    for (const row of rows.apps) {
      const source = parseJson(row.source);
      if (!source) continue;
      const file = `apps/${appFiles.get(row.identifier)}.yml`;
      files.push({ name: file, content: Parser.exportToString(source) });
      apps.push({
        identifier: row.identifier,
        name: row.name,
        description: row.description,
        author: row.author,
        version: row.version,
        metadata: withImage(parseJson(row.metadata)),
        project: row.project_id ? projectIdentifier.get(row.project_id) ?? null : null,
        file,
      });
    }

    // A project export leaves schedules out: imported elsewhere they'd start running.
    const schedules: ScheduleEntry[] = (
      scope
        ? []
        : await knex('schedule')
            .join('task', 'task.id', 'schedule.task_id')
            .select('schedule.identifier', 'task.identifier as workflow', 'schedule.cron', 'schedule.run_at', 'schedule.every_seconds', 'schedule.variables', 'schedule.enabled')
            .orderBy('schedule.id')
    ).map((s: any) => ({
      identifier: s.identifier,
      workflow: s.workflow,
      ...(s.run_at
        ? { runAt: new Date(s.run_at).toISOString() }
        : s.every_seconds
          ? { everySeconds: s.every_seconds }
          : { cron: s.cron }),
      variables: parseJson(s.variables) ?? {},
      enabled: !!s.enabled,
    }));

    const variables: VariableEntry[] = rows.variables.map((v: any) => {
      const secret = !!v.secret;
      if (secret && !includeSecrets) secretsRedacted++;
      return {
        name: v.name,
        description: v.description,
        type: v.type,
        value: secret && !includeSecrets ? null : parseJson(unseal(v.value)),
        secret,
        readonly: !!v.readonly,
      };
    });

    if (!tasks.length && !apps.length && !variables.length && !projects.length) {
      throw new Error('Nothing to back up: no workflows, apps, projects or global variables found');
    }

    const manifest: Manifest & Record<string, unknown> = {
      version: BACKUP_VERSION,
      ...(scope ? { scope: { kind: 'project', project: scope.project } } : {}),
      exportedAt: new Date().toISOString(),
      secretsIncluded: includeSecrets,
      counts: {
        projects: projects.length,
        tasks: tasks.length,
        apps: apps.length,
        schedules: schedules.length,
        variables: variables.length,
        images: images.size,
      },
      projects,
      tasks,
      apps,
      schedules,
    };
    files.push({ name: 'globals.yml', content: Parser.exportToString({ variables }) });
    files.push({ name: 'manifest.json', content: JSON.stringify(manifest, null, 2) });

    fs.mkdirSync(nodePath.dirname(targetPath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const outStream = fs.createWriteStream(targetPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      outStream.on('close', () => resolve());
      outStream.on('error', reject);
      archive.on('warning', reject);
      archive.on('error', reject);
      archive.pipe(outStream);
      for (const file of files) archive.append(file.content, { name: file.name });
      archive.finalize();
    });

    return {
      projectCount: projects.length,
      taskCount: tasks.length,
      appCount: apps.length,
      scheduleCount: schedules.length,
      variableCount: variables.length,
      secretsRedacted,
    };
  }

  /**
   * Opens an archive and reads its manifest and workflows, checking them the way a
   * restore does. Nothing is written.
   */
  private static async readArchive(archivePath: string, options: { projectOnly?: boolean } = {}) {
    if (!fs.existsSync(archivePath)) throw new Error(`Backup file not found: ${archivePath}`);

    let entries: { path: string; data: Buffer; type: string }[];
    try {
      entries = (await decompress(archivePath)) as any;
    } catch (e: any) {
      throw new Error(`Not a valid backup archive: ${e.message}`);
    }
    const file = new Map(entries.filter((e) => e.type === 'file').map((e) => [e.path.replace(/^\.\//, ''), e.data]));

    const manifestData = file.get('manifest.json');
    if (!manifestData) throw new Error('Not a Tipeline backup: manifest.json is missing');
    let manifest: Manifest;
    try {
      manifest = JSON.parse(manifestData.toString('utf8'));
    } catch {
      throw new Error('Not a Tipeline backup: manifest.json is not valid JSON');
    }
    if (typeof manifest.version !== 'number' || manifest.version < 1) {
      throw new Error('Not a Tipeline backup: manifest.json has no version');
    }
    if (manifest.version > BACKUP_VERSION) {
      throw new Error(`This backup was made by a newer Tipeline (format ${manifest.version}); update Tipeline to restore it`);
    }
    const scopedProject =
      manifest.scope?.kind === 'project'
        ? (manifest.projects ?? []).find((p) => p.identifier === manifest.scope!.project)
        : undefined;
    if (options.projectOnly && !scopedProject) {
      throw new Error('Not a project export: restore full backups from Settings → Backup');
    }

    const readYaml = (name: string) => {
      const data = file.get(name);
      if (!data) return undefined;
      try {
        return Parser.importFromString(data.toString('utf8'));
      } catch (e: any) {
        throw new Error(`${name}: ${e.message}`);
      }
    };
    const checkIdentifier = (identifier: unknown, what: string) => {
      if (typeof identifier !== 'string' || !IDENTIFIER.test(identifier)) {
        throw new Error(`Invalid ${what} identifier in backup: ${JSON.stringify(identifier)}`);
      }
      return identifier;
    };
    // Version 3 names each source file in the manifest; older archives used the identifier.
    const sourceFile = (entry: TaskEntry | AppEntry, kind: 'tasks' | 'apps', identifier: string) => {
      if (manifest.version < 3) return `${kind}/${identifier}.yml`;
      if (typeof entry.file !== 'string' || !SOURCE_FILE.test(entry.file) || !entry.file.startsWith(`${kind}/`)) {
        throw new Error(`Invalid file for ${identifier} in backup: ${JSON.stringify(entry.file)}`);
      }
      return entry.file;
    };

    // Version 1 had no metadata: every tasks/<identifier>.yml file is a workflow.
    const taskEntries: TaskEntry[] =
      manifest.version >= 2
        ? manifest.tasks ?? []
        : [...file.keys()]
            .map((name) => /^tasks\/([^/]+)\.yml$/.exec(name)?.[1])
            .filter((id): id is string => !!id)
            .map((identifier) => ({ identifier, name: '' }));

    const tasks = taskEntries.map((entry) => {
      const identifier = checkIdentifier(entry.identifier, 'workflow');
      const taskFile = sourceFile(entry, 'tasks', identifier);
      const source = readYaml(taskFile) as Record<string, any> | undefined;
      if (!source || typeof source !== 'object') throw new Error(`Workflow ${identifier} is missing its ${taskFile}`);
      const name = entry.name || source.name;
      if (!name) throw new Error(`Workflow ${identifier} has no name`);
      // Backups from before lowercase tags keep their casing in the file too.
      const tags = TagService.normalizeLabels(entry.tags ?? (Array.isArray(source.tags) ? source.tags : []));
      if (Array.isArray(source.tags)) source.tags = TagService.normalizeLabels(source.tags);
      return {
        ...entry,
        identifier,
        name,
        description: manifest.version >= 2 ? entry.description : source.description,
        author: manifest.version >= 2 ? entry.author : source.author,
        version: manifest.version >= 2 ? entry.version : source.version,
        platform: manifest.version >= 2 ? entry.platform : source.platform,
        tags,
        source,
      };
    });

    return { file, manifest, scopedProject, readYaml, checkIdentifier, sourceFile, tasks };
  }

  /** The workflows in an archive, by identifier, name and source — for a look before restoring. */
  static async readWorkflows(archivePath: string, options: { projectOnly?: boolean } = {}) {
    const { tasks } = await BackupService.readArchive(archivePath, options);
    return tasks.map(({ identifier, name, source }) => ({ identifier, name, source }));
  }

  /**
   * Restores a backup into the current database. Items are matched by identifier
   * (global variables by name); `mode` decides what happens to one that already
   * exists: `skip` keeps the current one, `replace` overwrites it with the backup's.
   * The whole archive is read and checked before anything is written, and the
   * database writes run in one transaction.
   *
   * Schedules are written disabled; `startSchedules` gets the ones to turn on
   * afterwards (through the job runner), and `stopSchedules` the replaced ones
   * whose old timers must go first.
   */
  static async restore(
    archivePath: string,
    mode: RestoreMode = 'skip',
    options: { projectOnly?: boolean } = {}
  ): Promise<{ result: RestoreResult; startSchedules: string[]; stopSchedules: string[] }> {
    const { file, manifest, scopedProject, readYaml, checkIdentifier, sourceFile, tasks } = await BackupService.readArchive(
      archivePath,
      options
    );

    const apps = (manifest.apps ?? []).map((entry) => {
      const identifier = checkIdentifier(entry.identifier, 'app');
      const appFile = sourceFile(entry, 'apps', identifier);
      const source = readYaml(appFile);
      if (!source || typeof source !== 'object') throw new Error(`App ${identifier} is missing its ${appFile}`);
      if (!entry.name) throw new Error(`App ${identifier} has no name`);
      return { ...entry, identifier, source };
    });

    const projects = (manifest.projects ?? []).map((p) => {
      checkIdentifier(p.identifier, 'project');
      if (!p.name) throw new Error(`Project ${p.identifier} has no name`);
      return p;
    });
    const schedules = (manifest.schedules ?? []).map((s) => {
      checkIdentifier(s.identifier, 'schedule');
      if (!s.cron && !s.runAt && !s.everySeconds) {
        throw new Error(`Schedule ${s.identifier} has no cron expression, interval or run time`);
      }
      return s;
    });

    const globals = readYaml('globals.yml') as { variables?: VariableEntry[] } | undefined;
    const variables = (globals?.variables ?? []).map((v) => {
      if (!v?.name || !v.type) throw new Error('globals.yml has a variable without a name or type');
      return v;
    });

    // Images are only written for workflows/apps the restore actually writes.
    const imageFor = (metadata: Record<string, any> | null | undefined, kind: 'tasks' | 'apps', identifier: string) => {
      const image = metadata?.image;
      if (typeof image !== 'string') return null;
      const match = IMAGE_PATH.exec(image);
      if (!match || match[1] !== kind || match[2] !== identifier || !file.has(image)) return null;
      return image;
    };
    const imagesToWrite: string[] = [];
    const metadataFor = (metadata: Record<string, any> | null | undefined, kind: 'tasks' | 'apps', identifier: string) => {
      if (!metadata) return null;
      const image = imageFor(metadata, kind, identifier);
      if (image) {
        imagesToWrite.push(image);
        return metadata;
      }
      const { image: _dropped, ...rest } = metadata;
      return rest;
    };

    const result: RestoreResult = {
      version: manifest.version,
      projects: emptyCounts(),
      tasks: emptyCounts(),
      apps: emptyCounts(),
      schedules: emptyCounts(),
      variables: emptyCounts(),
      secretsWithoutValue: [],
      warnings: [],
      ...(scopedProject ? { project: { identifier: scopedProject.identifier, name: scopedProject.name } } : {}),
    };
    const startSchedules: string[] = [];
    const stopSchedules: string[] = [];

    const knex = TaskModel.knex();
    await knex.transaction(async (trx) => {
      const projectId = new Map<string, number>();
      for (const p of projects) {
        const existing = await trx('project').where({ identifier: p.identifier }).first();
        const data = {
          name: p.name,
          description: p.description ?? null,
          color: p.color ?? null,
          instructions: p.instructions ?? null,
        };
        if (!existing) {
          const [id] = await trx('project').insert({ identifier: p.identifier, ...data });
          projectId.set(p.identifier, id);
          result.projects.added++;
        } else {
          projectId.set(p.identifier, existing.id);
          if (mode === 'replace') {
            await trx('project').where({ id: existing.id }).update({ ...data, updated_at: trx.fn.now() });
            result.projects.replaced++;
          } else result.projects.skipped++;
        }
      }
      const projectRef = async (identifier: string | null | undefined) => {
        if (!identifier) return null;
        if (projectId.has(identifier)) return projectId.get(identifier)!;
        const row = await trx('project').where({ identifier }).first();
        return row?.id ?? null;
      };

      for (const t of tasks) {
        const existing = await trx('task').where({ identifier: t.identifier }).first();
        if (existing && mode === 'skip') {
          result.tasks.skipped++;
          continue;
        }
        const metadata = metadataFor(t.metadata, 'tasks', t.identifier);
        const data = {
          name: t.name,
          description: t.description ?? null,
          author: t.author ?? null,
          version: t.version ?? null,
          platform: t.platform ?? null,
          metadata: metadata ? JSON.stringify(metadata) : null,
          source: JSON.stringify(t.source),
          project_id: await projectRef(t.project),
        };
        let id: number;
        if (existing) {
          id = existing.id;
          await trx('task').where({ id }).update({ ...data, updated_at: trx.fn.now() });
          result.tasks.replaced++;
        } else {
          [id] = await trx('task').insert({ identifier: t.identifier, ...data });
          result.tasks.added++;
        }
        await TaskRevisionService.record(existing ?? { id }, data.source, 'backup', { trx });
        await this.setTags(trx, id, t.tags ?? []);
      }

      for (const a of apps) {
        const existing = await trx('app').where({ identifier: a.identifier }).first();
        if (existing && mode === 'skip') {
          result.apps.skipped++;
          continue;
        }
        const metadata = metadataFor(a.metadata, 'apps', a.identifier);
        const data = {
          name: a.name,
          description: a.description ?? null,
          author: a.author ?? null,
          version: a.version ?? null,
          metadata: metadata ? JSON.stringify(metadata) : null,
          source: JSON.stringify(a.source),
          project_id: await projectRef(a.project),
        };
        if (existing) {
          await trx('app').where({ id: existing.id }).update({ ...data, updated_at: trx.fn.now() });
          result.apps.replaced++;
        } else {
          await trx('app').insert({ identifier: a.identifier, ...data });
          result.apps.added++;
        }
      }

      for (const s of schedules) {
        const task = await trx('task').where({ identifier: s.workflow }).first();
        if (!task) {
          result.warnings.push(`Schedule ${s.identifier} skipped: its workflow ${s.workflow} is not installed`);
          continue;
        }
        const existing = await trx('schedule').where({ identifier: s.identifier }).first();
        if (existing && mode === 'skip') {
          result.schedules.skipped++;
          continue;
        }
        // Written disabled; the runner turns it on after the transaction commits.
        const data = {
          task_id: task.id,
          cron: s.runAt || s.everySeconds ? null : s.cron,
          run_at: s.runAt ?? null,
          every_seconds: s.everySeconds ?? null,
          variables: JSON.stringify(s.variables ?? {}),
          enabled: false,
        };
        if (existing) {
          await trx('schedule').where({ id: existing.id }).update({ ...data, updated_at: trx.fn.now() });
          stopSchedules.push(s.identifier);
          result.schedules.replaced++;
        } else {
          await trx('schedule').insert({ identifier: s.identifier, ...data });
          result.schedules.added++;
        }
        if (s.enabled) startSchedules.push(s.identifier);
      }

      for (const v of variables) {
        const existing = await trx('global_variable').where({ name: v.name }).first();
        // A secret the backup left out (null) never wipes a value already here.
        const missingSecret = !!v.secret && v.value == null;
        if (existing && mode === 'skip') {
          result.variables.skipped++;
          continue;
        }
        const data: Record<string, unknown> = {
          description: v.description ?? null,
          type: v.type,
          secret: !!v.secret,
          readonly: !!v.readonly,
        };
        if (!missingSecret || !existing) {
          const json = JSON.stringify(v.value ?? null);
          data.value = v.secret && v.value != null ? seal(json) : json;
        }
        if (missingSecret && (!existing || existing.value == null || existing.value === 'null')) {
          result.secretsWithoutValue.push(v.name);
        }
        if (existing) {
          await trx('global_variable').where({ id: existing.id }).update({ ...data, updated_at: trx.fn.now() });
          result.variables.replaced++;
        } else {
          await trx('global_variable').insert({ identifier: generateIdentifier(), name: v.name, ...data });
          result.variables.added++;
        }
      }
    });

    // Files last: a failed transaction leaves ~/Tipeline untouched.
    for (const image of imagesToWrite) {
      const [, kind, identifier] = IMAGE_PATH.exec(image)!;
      const dir = nodePath.join(TIPELINE_DIR, 'assets', kind);
      fs.mkdirSync(dir, { recursive: true });
      // Drop an older image of another type first, as AssetService does.
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith(`${identifier}.`)) fs.rmSync(nodePath.join(dir, name), { force: true });
      }
      fs.writeFileSync(nodePath.join(TIPELINE_DIR, image), file.get(image)!);
    }

    return { result, startSchedules, stopSchedules };
  }

  /** TagService.findOrCreateIds + setTaskTags, inside the restore transaction. */
  private static async setTags(trx: Knex.Transaction, taskId: number, labels: string[]) {
    const ids: number[] = [];
    for (const label of TagService.normalizeLabels(labels.filter((l) => typeof l === 'string'))) {
      const existing = await trx('tag').where({ label }).first();
      ids.push(existing ? existing.id : (await trx('tag').insert({ label }))[0]);
    }
    await trx('task_tag').where({ task_id: taskId }).delete();
    if (ids.length) await trx('task_tag').insert(ids.map((tag_id) => ({ task_id: taskId, tag_id })));
  }
}
