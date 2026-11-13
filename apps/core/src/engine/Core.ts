import { RUN_KEEP_DAYS_SETTING, RunHistoryPurger } from '@engine/RunHistoryPurger';
import { assertNoLocalFiles } from '@utils/localFileReferences';
import { redactSecretValues } from '@utils/secretBox';
import { assertRunVariables } from '@utils/assertPropsVisibility';
import os from 'node:os';
import nodePath from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import archiver from 'archiver';
import { TaskService } from '@database/services/TaskService';
import { actionGroups, findabilityIssues } from '@engine/WorkflowCatalog';
import { HubWorkflowCatalog } from '@/hub/HubWorkflowCatalog';
import { assertNotDraft, readDraftSchedule, repeatsOnATimer, type DraftSchedule } from '@task/Draft';
import { resolveScheduleTiming, type ScheduleTimingInput } from '@engine/runner/scheduleTiming';
import { checkWorkflowYaml, setWorkflowAuthor } from '@engine/WorkflowAuthoring';
import { GlobalVariableService } from '@database/services/GlobalVariableService';
import { TagService } from '@database/services/TagService';
import { TaskRevisionService } from '@database/services/TaskRevisionService';
import { TrashService } from '@database/services/TrashService';
import { AppService } from '@database/services/AppService';
import { ProjectService, type ProjectDeleteContents } from '@database/services/ProjectService';
import { WorkflowUsageService } from '@database/services/WorkflowUsageService';
import { ProjectMapService } from '@database/services/ProjectMapService';
import { AgentRunService } from '@database/services/AgentRunService';
import { PluginService } from '@database/services/PluginService';
import { ActionRegistry } from '@action/ActionRegistry';
import { PluginActionRegistry } from '@/plugin/PluginActionRegistry';
import { PluginParamsRegistry } from '@/plugin/PluginParamsRegistry';
import { PluginDocsRegistry } from '@/plugin/PluginDocsRegistry';
import { PluginRulesRegistry } from '@/plugin/PluginRulesRegistry';
import { PluginSchemaRegistry } from '@/plugin/PluginSchemaRegistry';
import { PluginReturnsRegistry } from '@/plugin/PluginReturnsRegistry';
import { PluginCacheableRegistry } from '@/plugin/PluginCacheableRegistry';
import { capabilityIndex, capabilityReport, combinedCapabilityReport } from '@engine/WorkflowCapabilities';
import { WorkflowCache } from '@/cache/WorkflowCache';
import { toCacheMode } from '@/cache/cacheMode';
import { CacheService, CACHE_MAX_SIZE_SETTING, type CacheHit } from '@database/services/CacheService';
import type { CacheMode, WorkflowCacheConfig } from '@tipeline/schemas';
import { SettingsService } from '@database/services/SettingsService';
import { DatabaseManager } from '@database/DatabaseManager';
import { Parser } from '@utils/Parser';
import { TaskValidator } from '@validation/TaskValidation';
import { PipelineService } from '@database/services/PipelineService';
import { PipelineActionService } from '@database/services/PipelineActionService';
import { PipelineVariableService } from '@database/services/PipelineVariableService';
import { PipelineRunnerService } from '@database/services/PipelineRunnerService';
import { coreEvents } from '@engine/CoreEvents';
import { fileSlug, generateIdentifier, readableFileNames, sourceReferencesVariable } from '@tipeline/utils';
import { TaskStreamListener } from '@engine/TaskStreamListener';
import IPCMessage from '@engine/IPCMessage';
import { addActionsIdentifiers as sharedAddActionsIdentifiers } from '@utils/ActionIdentifiers';
import { coreValidations } from '@tipeline/schemas';
import { getJobRunner } from '@engine/runner/JobRunnerFactory';
import type { RunTrigger } from '@engine/runner/IJobRunner';
import { PluginLoader } from '@/plugin/PluginLoader';
import { AppSettings } from '@engine/AppSettings';
import { HubService } from '@database/services/HubService';
import type { Hub } from '@database/models/Hub';
import { HubUpdateEventService } from '@database/services/HubUpdateEventService';
import { HubProviderFactory } from '@/hub/HubProviderFactory';
import { HubSyncService } from '@/hub/HubSyncService';
import { AssetService } from '@/asset/AssetService';
import { BackupService, type RestoreMode, type RestoreResult } from '@/backup/BackupService';
import { splitAppDocument } from '@utils/appDocument';
import { runScriptPreview, type ScriptPreviewParams } from '@action/actions/script/preview';
import { CORE_VERSION } from '@utils/coreVersion';

export default class Core {
  /**
   * Sends an event to every connected client (set by Server). Used for runs Core starts
   * on its own — a run resuming after an approval decision — whose progress no request
   * is listening to.
   */
  private static broadcast: ((event: string, data: any) => void) | null = null;

  static setBroadcast(fn: ((event: string, data: any) => void) | null) {
    Core.broadcast = fn;
  }

  static async init() {
    await PipelineRunnerService.recoverStaleRunningPipelines();
  }

  static async status() {
    return {
      status: 'running',
      pid: process.pid,
      uptime: process.uptime(),
      version: CORE_VERSION,
      // Which install this Core runs from, since CLI and Desktop each carry their own.
      entry: process.argv[1],
      // Left out if it can't be counted: this call is also the health check.
      activeRuns: await Core.countActiveRuns().catch(() => undefined),
      // Set by the auto-start service, which restarts Core after a crash.
      supervised: process.env.TIPELINE_SUPERVISED === '1',
    };
  }

  private static async countActiveRuns(): Promise<number> {
    return getJobRunner().activeJobs?.() ?? PipelineService.countActive();
  }

  static async stop() {
    await DatabaseManager.getKnex().destroy();
  }

  static async run(payload: any, correlationId: string = '') {
    const cacheMode = toCacheMode(payload?.cache);
    await getJobRunner().submit({
      type: 'run',
      correlationId,
      payload,
      ...(cacheMode !== 'use' ? { cacheMode } : {}),
    });
  }

  static async exec(
    identifier: string,
    correlationId: string = '',
    variables: Record<string, any> = {},
    stepMode = false,
    debugMode = false,
    options: {
      ephemeral?: boolean;
      outputs?: string[];
      trigger?: RunTrigger;
      cacheMode?: CacheMode;
      /** Only for a run someone started directly; see task/Draft.ts. */
      allowDraft?: boolean;
      /** Debugger runs: the steps to pause before. */
      breakpoints?: string[];
    } = {}
  ) {
    const task = await TaskService.getByIdentifier(identifier);
    if (!task?.source) throw new Error(`Workflow not found: ${identifier}`);
    assertNotDraft(task, options.allowDraft);

    const source = JSON.parse(task.source);
    const groups = Core.extractActionGroups(source.pipeline?.actions ?? []);
    const missing = groups.filter((g: string) => !ActionRegistry[g] && !PluginActionRegistry[g]);
    if (missing.length > 0) {
      throw new Error(
        `Cannot run task: the following plugin groups are disabled or missing: ${missing.join(', ')}. Enable them with: tipeline plugin enable <plugin>, or on the Plugins page.`
      );
    }

    // The workflow cache is checked here, before a worker thread is started, so a hit
    // costs a database read instead of a whole run. Debugging always runs for real.
    const cache =
      stepMode || debugMode
        ? null
        : await WorkflowCache.prepare({
            identifier,
            name: task.name,
            source,
            inputs: variables,
            outputs: options.outputs,
            mode: options.cacheMode,
          });
    if (cache) {
      const hit = await WorkflowCache.lookup(cache);
      if (hit) {
        await Core.replayCachedRun(identifier, task.name, correlationId, hit, options);
        return;
      }
    }

    // On a miss, the top-level run's outputs arrive on its taskEnd (a sub-workflow's
    // taskEnd carries none) and are stored once the run has finished without error.
    let finished: { outputs: Record<string, unknown>; pipelineIdentifier: string } | null = null;
    const onTaskEnd = (data: any) => {
      if (!finished && data?.outputs !== undefined && !data.status) {
        finished = { outputs: data.outputs, pipelineIdentifier: data.pipelineIdentifier ?? '' };
      }
    };
    if (cache) coreEvents.on(`taskEnd:${correlationId}`, onTaskEnd);

    try {
      await getJobRunner().submit({
        type: 'exec',
        correlationId,
        identifier,
        variables,
        stepMode,
        debugMode,
        ...(options.ephemeral ? { ephemeral: true } : {}),
        ...(options.outputs ? { outputs: options.outputs } : {}),
        ...(options.trigger ? { trigger: options.trigger } : {}),
        ...(options.cacheMode && options.cacheMode !== 'use' ? { cacheMode: options.cacheMode } : {}),
        ...(options.allowDraft ? { allowDraft: true } : {}),
        ...(debugMode && options.breakpoints?.length ? { breakpoints: options.breakpoints } : {}),
      });
      const result = finished as { outputs: Record<string, unknown>; pipelineIdentifier: string } | null;
      if (cache && result) await WorkflowCache.store(cache, result.outputs, result.pipelineIdentifier);
    } finally {
      if (cache) coreEvents.off(`taskEnd:${correlationId}`, onTaskEnd);
    }
  }

  /**
   * Answers a run from the workflow cache: the same taskStart/taskEnd a real run sends
   * (so apps, the CLI and the Desktop stream work unchanged), marked `cached`, with the
   * stored outputs. A run that would have been saved is recorded as a completed run
   * pointing at the one that produced the outputs.
   */
  private static async replayCachedRun(
    identifier: string,
    name: string,
    correlationId: string,
    hit: CacheHit,
    options: { ephemeral?: boolean; trigger?: RunTrigger }
  ) {
    const outputs = (hit.value ?? {}) as Record<string, unknown>;
    let pipelineIdentifier = '';
    if (!options.ephemeral) {
      const record = await PipelineRunnerService.recordCachedRun(identifier, outputs, {
        cachedFrom: hit.sourcePipeline,
        cachedAt: hit.createdAt,
        trigger: options.trigger,
      });
      pipelineIdentifier = record.identifier;
    }
    const cached = { cached: true, cachedAt: hit.createdAt, cachedFrom: hit.sourcePipeline };
    coreEvents.emit(`taskStart:${correlationId}`, {
      name,
      description: '',
      pipelineIdentifier,
      taskIdentifier: identifier,
      ...cached,
    });
    coreEvents.emit(`taskEnd:${correlationId}`, {
      name,
      pipelineIdentifier,
      taskIdentifier: identifier,
      outputs,
      ...cached,
    });
  }

  static async taskList() {
    return await TaskService.getAll();
  }

  static async appList() {
    return await AppService.getAll();
  }

  static async projectList() {
    return await ProjectService.getAll();
  }

  static async projectNew(data: { name: string; description?: string; color?: string; instructions?: string }) {
    return await ProjectService.create(data);
  }

  /** The project, plus the workflows its apps use that live outside it (`shared_tasks`). */
  static async projectDetail(identifier: string) {
    const project = await ProjectService.getByIdentifier(identifier);
    if (!project) return project;
    return { ...project, shared_tasks: await WorkflowUsageService.sharedIntoProject(identifier) };
  }

  static async projectUpdate(
    identifier: string,
    data: { name?: string; description?: string; color?: string; instructions?: string | null }
  ) {
    return await ProjectService.update(identifier, data);
  }

  /** What deleting the project could take with it, and what uses each workflow. */
  static async projectDeletePreview(identifier: string) {
    return await ProjectService.deletePreview(identifier);
  }

  /** Deletes the project; the workflows and apps named in `contents` go to the Trash with it. */
  static async projectDelete(identifier: string, contents?: ProjectDeleteContents) {
    return await ProjectService.delete(identifier, contents);
  }

  static async projectAssignTask(projectIdentifier: string, taskIdentifier: string) {
    return await ProjectService.assignTask(projectIdentifier, taskIdentifier);
  }

  /** Takes the workflow out of this project; it stays in any others. */
  static async projectUnassignTask(projectIdentifier: string, taskIdentifier: string) {
    return await ProjectService.unassignTask(projectIdentifier, taskIdentifier);
  }

  static async projectAssignApp(projectIdentifier: string, appIdentifier: string) {
    return await ProjectService.assignApp(projectIdentifier, appIdentifier);
  }

  /** Takes the app out of this project; it stays in any others. */
  static async projectUnassignApp(projectIdentifier: string, appIdentifier: string) {
    return await ProjectService.unassignApp(projectIdentifier, appIdentifier);
  }

  /**
   * A project's map: the live part read from the definitions, and the stored plan. With
   * no identifier, every project's live map and plans (the map of all projects).
   */
  static async projectMap(identifier?: string | null) {
    if (!identifier) {
      return { live: await ProjectMapService.live(null), plans: await ProjectMapService.allPlans() };
    }
    const plan = await ProjectMapService.getPlan(identifier);
    const linked = plan.nodes.map((n) => n.link).filter((k): k is string => !!k);
    const [live, candidates] = await Promise.all([
      ProjectMapService.live(identifier, linked),
      ProjectMapService.linkCandidates(),
    ]);
    return { live, plan, candidates };
  }

  static async projectMapSave(identifier: string, plan: unknown) {
    return await ProjectMapService.savePlan(identifier, plan);
  }

  /** Links a planned node to the workflow, app, global or schedule it became. */
  static async projectMapLink(identifier: string, nodeId: string, key: string) {
    return await ProjectMapService.link(identifier, nodeId, key);
  }

  static async variableList() {
    return await GlobalVariableService.getAll();
  }

  /** Every workflow's capabilities, by identifier — for the Workflows list filter. Local only. */
  static async taskCapabilityIndex() {
    return await capabilityIndex();
  }

  /** With `withCapabilities`, also what it can do (for the CLI's `workflow info`). */
  static async taskDetail(identifier: string, withCapabilities = false) {
    const task: any = await TaskService.getByIdentifier(identifier);
    if (!task || !withCapabilities) return task;
    return { ...task, capabilities: await capabilityReport(task.source) };
  }

  /** What uses a workflow: apps and workflows (with their projects), and its schedules. */
  static async taskUsage(identifier: string) {
    return await WorkflowUsageService.usage(identifier);
  }

  /** What a workflow can do outside the run (files, programs, servers, the network), and which steps do it. */
  static async taskCapabilities(identifier: string) {
    const task: any = await TaskService.getByIdentifier(identifier);
    if (!task) throw new Error(`Workflow "${identifier}" not found`);
    return await capabilityReport(task.source);
  }

  /**
   * Returns the app with its source normalized to the current schema version, so a
   * stored v1 source is migrated on read (and persisted as v2 on its next save).
   * A source that can't be migrated/validated is returned untouched with
   * `source_error` set, so the desktop can show the problem instead of crashing.
   */
  static async appDetail(identifier: string) {
    const app = await AppService.getByIdentifier(identifier);
    if (!app) return app;
    try {
      const source = coreValidations.appObject.parseAppSource(app.source ?? '');
      return { ...app, source: JSON.stringify(source), source_error: null };
    } catch (error: any) {
      return { ...app, source_error: error?.message ?? String(error) };
    }
  }

  static async taskUpdateSource(identifier: any, source: any) {
    const rawTask = typeof source === 'string' ? JSON.parse(source) : source;
    const validatedTask = TaskValidator.validateFormat(rawTask);

    const actionTypeErrors = await TaskValidator.validateActionTypes(validatedTask.pipeline?.actions ?? []);
    if (actionTypeErrors.length > 0) {
      throw new Error(`task.validationFailed\n${actionTypeErrors.join('\n')}`);
    }

    return await TaskService.updateSource(identifier, JSON.stringify(validatedTask));
  }

  /** Saved versions of a workflow, newest first, without their sources. */
  static async taskRevisionList(identifier: string) {
    const task = await TaskService.getByIdentifier(identifier);
    if (!task) throw new Error(`Workflow not found: ${identifier}`);
    return await TaskRevisionService.list(task.id);
  }

  /** One saved version, with its source, for the Versions tab preview. */
  static async taskRevisionDetail(identifier: string, revisionId: number) {
    const task = await TaskService.getByIdentifier(identifier);
    if (!task) throw new Error(`Workflow not found: ${identifier}`);
    const revision = await TaskRevisionService.get(task.id, Number(revisionId));
    if (!revision) throw new Error(`Version not found: ${revisionId}`);
    return { id: revision.id, origin: revision.origin, createdAt: revision.created_at, source: revision.source };
  }

  /**
   * Puts a saved version back. It's saved as a new version ('restore'), so the one it
   * replaces stays in the list. Checked like a builder save: an old version can use a
   * plugin that's no longer installed.
   */
  static async taskRevisionRestore(identifier: string, revisionId: number) {
    const task = await TaskService.getByIdentifier(identifier);
    if (!task) throw new Error(`Workflow not found: ${identifier}`);
    const revision = await TaskRevisionService.get(task.id, Number(revisionId));
    if (!revision) throw new Error(`Version not found: ${revisionId}`);

    const validatedTask = TaskValidator.validateFormat(JSON.parse(revision.source));
    const actionTypeErrors = await TaskValidator.validateActionTypes(validatedTask.pipeline?.actions ?? []);
    if (actionTypeErrors.length > 0) {
      throw new Error(`task.validationFailed\n${actionTypeErrors.join('\n')}`);
    }
    return await TaskService.updateSource(identifier, JSON.stringify(validatedTask), 'restore', {
      restoredFrom: revision.id,
    });
  }

  static async taskUpdateMeta(
    identifier: string,
    data: {
      name?: string;
      description?: string;
      author?: string;
      version?: string;
      platform?: 'windows' | 'linux' | 'macos';
      tags?: string[];
      // The workflow cache setting (lives in its source); null turns it off.
      cache?: WorkflowCacheConfig | null;
      // Whether it's a helper (lives in its source); false removes the key.
      helper?: boolean;
    }
  ) {
    const { cache, helper, ...meta } = data;
    // The settings that live in the source, applied together so a save is one version.
    const withSettings = (source: any) => {
      const next = { ...source };
      if (cache !== undefined) {
        if (cache) next.cache = cache;
        else delete next.cache;
      }
      if (helper !== undefined) {
        if (helper) next.helper = true;
        else delete next.helper;
      }
      return next;
    };
    // Checked before anything is written: a workflow with a step that can't be
    // skipped can't be cached.
    if (cache !== undefined) {
      const record = await TaskService.getByIdentifier(identifier);
      if (!record?.source) throw new Error(`Workflow not found: ${identifier}`);
      TaskValidator.validateFormat(withSettings(JSON.parse(record.source)));
    }
    let updated = await TaskService.updateMeta(identifier, meta);
    if ((cache !== undefined || helper !== undefined) && updated?.source) {
      const before = JSON.parse(updated.source);
      const next = withSettings(before);
      if (JSON.stringify(next) !== JSON.stringify(before)) {
        updated = await TaskService.updateSource(identifier, JSON.stringify(next));
      }
    }
    return updated;
  }

  static async taskUploadImage(identifier: string, dataUrl: string) {
    const relativePath = AssetService.saveImage('tasks', identifier, dataUrl);
    await TaskService.updateImage(identifier, relativePath);
    return { image: relativePath };
  }

  static async appUpdateSource(identifier: string, source: unknown) {
    const parsed = coreValidations.appObject.parseAppSource(source);
    return await AppService.updateSource(identifier, JSON.stringify(parsed));
  }

  static async appUpdateMeta(identifier: string, data: { name?: string; description?: string; author?: string; version?: string; platform?: string }) {
    return await AppService.updateMeta(identifier, data);
  }

  static async appUploadImage(identifier: string, dataUrl: string) {
    const relativePath = AssetService.saveImage('apps', identifier, dataUrl);
    await AppService.updateImage(identifier, relativePath);
    return { image: relativePath };
  }

  static async appNew(data: { name: string; description?: string; author?: string; source?: unknown; metadata?: any }) {
    const source = data.source
      ? coreValidations.appObject.parseAppSource(data.source)
      : coreValidations.appObject.createEmptyAppSource();
    source.version = '1.0.0';

    return await AppService.install({
      name: data.name,
      description: data.description,
      author: data.author,
      version: '1.0.0',
      metadata: data.metadata,
      source: JSON.stringify(source),
    });
  }

  /** Moves the app to the Trash (see TrashService). */
  static async appUninstall(identifier: string) {
    const trashId = await TrashService.trash('app', identifier);
    return { identifier, trashId };
  }

  /**
   * Installs an app from a YAML/JSON file. A `workflows` entry may point at a workflow
   * file instead of an installed workflow — `{ file: ./workflows/x.yml }`, relative to
   * the app file — so an app can ship with the workflows it needs: those workflows are
   * installed first and the entry is stored as `{ identifier }`.
   *
   * Everything is validated before anything is installed (the app with placeholder
   * identifiers, then every referenced workflow file), so a broken app or workflow
   * doesn't leave half an install behind. Workflows already installed from the same
   * file contents are reused rather than installed again.
   */
  static async appInstall(path: string) {
    const doc = Parser.importFromFile(path) as any;
    const baseDir = nodePath.dirname(path);
    const declared: Record<string, any> = doc?.workflows && typeof doc.workflows === 'object' ? doc.workflows : {};
    const fileRefs = Object.entries(declared)
      .filter(([, ref]) => ref && typeof ref === 'object' && typeof ref.file === 'string')
      .map(([alias, ref]) => [alias, nodePath.resolve(baseDir, ref.file)] as const);

    const withIdentifiers = (resolved: Record<string, string>) => ({
      ...doc,
      workflows: Object.fromEntries(
        Object.entries(declared).map(([alias, ref]) =>
          alias in resolved ? [alias, { identifier: resolved[alias] }] : [alias, ref]
        )
      ),
    });

    const hubRef = Object.entries(declared).find(([, ref]) => ref && typeof ref === 'object' && 'hub' in ref);
    if (hubRef) {
      throw new Error(`Workflow "${hubRef[0]}" comes from a hub — install this app from the hub instead.`);
    }
    splitAppDocument(withIdentifiers(Object.fromEntries(fileRefs.map(([alias]) => [alias, 'pending']))));
    const fingerprints: Record<string, string> = {};
    for (const [alias, file] of fileRefs) {
      if (!fs.existsSync(file)) throw new Error(`Workflow file for "${alias}" not found: ${file}`);
      const workflow = TaskValidator.validateFormat(Parser.importFromFile(file));
      fingerprints[alias] = createHash('sha256').update(JSON.stringify(workflow)).digest('hex');
    }

    // A bundled workflow already installed from identical file contents (by this or
    // another app) is reused, so apps sharing workflows don't install duplicates.
    // Changing the file produces a new fingerprint and installs it as a new workflow.
    const installed: Record<string, string> = {};
    for (const [alias, file] of fileRefs) {
      const existing = await TaskService.getByBundleFingerprint(fingerprints[alias]);
      installed[alias] = existing
        ? existing.identifier
        : (await Core.taskInstall(file, { bundleFingerprint: fingerprints[alias] })).identifier;
    }

    const { name, description, author, version, source } = splitAppDocument(withIdentifiers(installed));
    return await AppService.install({ name, description, author, version, source });
  }

  /**
   * Validates a full global-variable payload (name/type/value/etc.) against the same
   * Zod schema the desktop create/edit form uses, so IPC callers that bypass that form
   * can't persist a name outside the `[a-zA-Z0-9_]+` format or a mistyped value.
   * Only call this with a complete payload — it doesn't fit the partial
   * `{ identifier, value }` updates issued by the "Set Variable" action at runtime.
   * On failure it throws the raw Zod issue messages (translation keys), one per line,
   * matching the convention `useErrorT`/`FormMessage` on the desktop already expect.
   */
  private static validateGlobalVariable(data: any) {
    const { createGlobalSchema, globalTypeOptions } = coreValidations.varObject;
    if (!globalTypeOptions.includes(data?.type)) {
      throw new Error(`Invalid variable type: ${data?.type}`);
    }
    const result = createGlobalSchema(data.type).safeParse(data);
    if (!result.success) {
      throw new Error(result.error.issues.map((issue) => issue.message).join('\n'));
    }
  }

  static async variableNew(data: any) {
    this.validateGlobalVariable(data);

    // Saves in the database
    const record = await GlobalVariableService.create(data);

    // Returns the record saved in the database
    return record;
  }

  static async variableEdit(data: any) {
    this.validateGlobalVariable(data);

    // Saves in the database
    const record = await GlobalVariableService.update(data);

    // Returns the record saved in the database
    return record;
  }

  static async variableDuplicate(identifier: string, name: string) {
    const existing = await GlobalVariableService.getByIdentifier(identifier);
    if (!existing) throw new Error(`Variable "${identifier}" not found`);

    const duplicateData = {
      name,
      // `description` is optional (undefined) in the schema but SQLite stores an
      // empty description as NULL, which Zod's `.optional()` rejects — coerce it.
      description: existing.description ?? undefined,
      type: existing.type,
      value: existing.value,
      // SQLite has no native boolean type — better-sqlite3 returns these as 0/1,
      // which Objection's jsonSchema validator rejects as not strictly boolean.
      secret: !!existing.secret,
      readonly: !!existing.readonly,
    };

    this.validateGlobalVariable(duplicateData);

    return await GlobalVariableService.create(duplicateData);
  }

  /**
   * Strips the DB identifier (not portable across installs) and, unless
   * includeSecrets is set, blanks the value of variables flagged `secret`
   * so they aren't written to disk in plaintext.
   */
  private static prepareVariablesForExport(variables: any[], includeSecrets: boolean) {
    let secretsRedacted = 0;
    const exportable = variables.map(({ identifier, ...rest }) => {
      if (rest.secret && !includeSecrets) {
        secretsRedacted++;
        return { ...rest, value: null };
      }
      return rest;
    });
    return { exportable, secretsRedacted };
  }

  static async variableExportAll(
    targetPath: string,
    includeSecrets: boolean = false
  ): Promise<{ count: number; secretsRedacted: number }> {
    const variables = await GlobalVariableService.getAll();
    if (variables.length === 0) throw new Error('No global variables found to export');

    const { exportable, secretsRedacted } = this.prepareVariablesForExport(variables, includeSecrets);

    Parser.exportToFile(targetPath, { variables: exportable });

    return { count: exportable.length, secretsRedacted };
  }

  static async taskNew(data: any) {
    // Adds the version
    data.version = '1.0.0';
    const parsedSource = JSON.parse(data.source);
    parsedSource.version = '1.0.0';
    data.source = JSON.stringify(parsedSource);

    // Saves in the database
    const record = await TaskService.install(data);

    // Returns the record saved in the database
    return record;
  }

  static async taskDuplicate(identifier: string, name: string) {
    const existing = await TaskService.getByIdentifier(identifier);
    if (!existing) throw new Error(`Workflow "${identifier}" not found`);
    if (!existing.source) throw new Error(`Workflow "${identifier}" has no source to duplicate`);

    const parsedSource = JSON.parse(existing.source);
    parsedSource.name = name;
    if (parsedSource.pipeline?.actions) {
      parsedSource.pipeline.actions = this.addActionsIdentifiers(parsedSource.pipeline.actions);
    }

    const record = await TaskService.install({
      name,
      description: existing.description,
      author: existing.author,
      version: existing.version,
      metadata: existing.metadata,
      tags: existing.tags,
      source: JSON.stringify(parsedSource),
    });

    // The copy goes in every project the original is in.
    if (existing.projects?.length) {
      for (const project of existing.projects) await ProjectService.assignTask(project.identifier, record.identifier);
      return await TaskService.getByIdentifier(record.identifier);
    }

    return record;
  }

  /** Writes a workflow's YAML to `targetPath`; a folder gets `<workflow-name>.yml` inside it. */
  /** Secret values stay out of the file unless `includeSecrets`. */
  static async taskExport(
    identifier: string,
    targetPath: string,
    includeSecrets: boolean = false
  ): Promise<{ path: string; secretsRedacted: number }> {
    const record = await TaskService.getByIdentifier(identifier);
    if (!record) throw new Error(`Workflow "${identifier}" not found`);
    if (!record.source) throw new Error(`Workflow "${identifier}" has no source to export`);

    const parsedSource = JSON.parse(record.source);
    const path =
      fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
        ? nodePath.join(targetPath, `${fileSlug(record.name, 'workflow')}.yml`)
        : targetPath;

    // Exports to the yml file
    const exported = includeSecrets ? { source: parsedSource, count: 0 } : redactSecretValues(parsedSource);
    Parser.exportToFile(path, exported.source);
    return { path, secretsRedacted: exported.count };
  }

  /** For a client on another machine: the file itself, since a path here would mean nothing there. */
  static async taskExportContent(identifier: string, includeSecrets: boolean = false) {
    const record = await TaskService.getByIdentifier(identifier);
    if (!record) throw new Error(`Workflow "${identifier}" not found`);
    if (!record.source) throw new Error(`Workflow "${identifier}" has no source to export`);
    const source = JSON.parse(record.source);
    const exported = includeSecrets ? { source, count: 0 } : redactSecretValues(source);
    return {
      content: Parser.exportToString(exported.source),
      fileName: `${fileSlug(record.name, 'workflow')}.yml`,
      secretsRedacted: exported.count,
    };
  }

  /** Same for every workflow: the zip itself, base64 encoded. */
  static async taskExportAllContent(includeSecrets: boolean = false) {
    const folder = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'tipeline-export-'));
    try {
      const zip = nodePath.join(folder, 'workflows.zip');
      const { count, secretsRedacted } = await Core.taskExportAll(zip, includeSecrets);
      return { zipBase64: fs.readFileSync(zip).toString('base64'), count, secretsRedacted };
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }

  static async taskExportAll(
    targetPath: string,
    includeSecrets: boolean = false
  ): Promise<{ count: number; secretsRedacted: number }> {
    const tasks = await TaskService.getAllWithSource();
    const exportable = tasks.filter((t) => t.source);
    if (exportable.length === 0) throw new Error('No workflows with exportable source found');
    const fileNames = readableFileNames(exportable, 'workflow');
    let secretsRedacted = 0;

    fs.mkdirSync(nodePath.dirname(targetPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const outStream = fs.createWriteStream(targetPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      outStream.on('close', () => resolve());
      outStream.on('error', reject);
      archive.on('warning', reject);
      archive.on('error', reject);
      archive.pipe(outStream);

      for (const task of exportable) {
        const source = JSON.parse(task.source!);
        const exported = includeSecrets ? { source, count: 0 } : redactSecretValues(source);
        secretsRedacted += exported.count;
        archive.append(Parser.exportToString(exported.source), { name: `${fileNames.get(task.identifier)}.yml` });
      }

      archive.finalize();
    });

    return { count: exportable.length, secretsRedacted };
  }

  /**
   * Exports apps to a zip that "Install App" can read once unzipped: each app as
   * `<app-name>.yml`, with its workflows under `workflows/` and referenced as
   * `{ file: ./workflows/<workflow-name>.yml }` — the same layout as examples/apps.
   * Names that would clash get the start of their identifier added.
   * A workflow two apps share is written once. A workflow that's no longer
   * installed keeps its `{ identifier }` reference. No identifiers = every app.
   */
  static async appExport(targetPath: string, identifiers?: string[]): Promise<{ count: number; workflowCount: number }> {
    const all = await AppService.getAll();
    const selected = identifiers?.length ? all.filter((a: any) => identifiers.includes(a.identifier)) : all;
    if (identifiers?.length && selected.length !== identifiers.length) {
      const missing = identifiers.filter((id) => !selected.some((a: any) => a.identifier === id));
      throw new Error(`App not found: ${missing.join(', ')}`);
    }

    const apps: {
      identifier: string;
      name: string;
      doc: Record<string, unknown>;
      refs: Record<string, { identifier: string }>;
      source: Record<string, unknown>;
    }[] = [];
    const workflows = new Map<string, { name: string; yaml: string }>();
    for (const { identifier } of selected) {
      const record = await AppService.getByIdentifier(identifier);
      if (!record?.source) continue;
      const { version: _sourceVersion, workflows: refs = {}, ...source } = coreValidations.appObject.parseAppSource(record.source) as any;

      for (const ref of Object.values<{ identifier: string }>(refs)) {
        if (workflows.has(ref.identifier)) continue;
        const task = await TaskService.getByIdentifier(ref.identifier);
        if (task?.source) workflows.set(ref.identifier, { name: task.name, yaml: Parser.exportToString(redactSecretValues(JSON.parse(task.source)).source) });
      }

      const meta = { name: record.name, description: record.description, author: record.author, version: record.version };
      const doc = Object.fromEntries(Object.entries(meta).filter(([, v]) => v != null && v !== ''));
      apps.push({ identifier, name: record.name, doc, refs, source });
    }
    if (apps.length === 0) throw new Error('No apps with exportable source found');

    // File names are picked once every workflow is known, so clashing names get told apart.
    const appFiles = readableFileNames(apps, 'app');
    const workflowFiles = readableFileNames(
      [...workflows].map(([identifier, { name }]) => ({ identifier, name })),
      'workflow'
    );
    const appDoc = (app: (typeof apps)[number]) => {
      const fileRefs = Object.fromEntries(
        Object.entries(app.refs).map(([alias, ref]) => [
          alias,
          workflows.has(ref.identifier) ? { file: `./workflows/${workflowFiles.get(ref.identifier)}.yml` } : ref,
        ])
      );
      return { ...app.doc, workflows: fileRefs, ...app.source };
    };

    fs.mkdirSync(nodePath.dirname(targetPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const outStream = fs.createWriteStream(targetPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      outStream.on('close', () => resolve());
      outStream.on('error', reject);
      archive.on('warning', reject);
      archive.on('error', reject);
      archive.pipe(outStream);

      for (const app of apps) {
        archive.append(Parser.exportToString(appDoc(app)), { name: `${appFiles.get(app.identifier)}.yml` });
      }
      for (const [identifier, { yaml }] of workflows) {
        archive.append(yaml, { name: `workflows/${workflowFiles.get(identifier)}.yml` });
      }

      archive.finalize();
    });

    return { count: apps.length, workflowCount: workflows.size };
  }

  /** Everything a user builds, in one zip — see BackupService for the layout. */
  static async fullBackup(targetPath: string, includeSecrets: boolean = false) {
    return await BackupService.create(targetPath, includeSecrets);
  }

  /** One project's workflows, apps and the globals they use, in the backup format. */
  static async projectExport(identifier: string, targetPath: string, includeSecrets: boolean = false) {
    return await BackupService.create(targetPath, includeSecrets, { project: identifier });
  }

  /** What the workflows in a backup or project export can do, before restoring it. */
  static async backupCapabilities(archivePath: string, projectOnly = false) {
    return await combinedCapabilityReport(await BackupService.readWorkflows(archivePath, { projectOnly }));
  }

  /** Imports a project export (rejects full backups); matched by identifier like a restore. */
  static async projectImport(archivePath: string, mode: RestoreMode = 'skip'): Promise<RestoreResult> {
    const { result } = await BackupService.restore(archivePath, mode, { projectOnly: true });
    return result;
  }

  /**
   * Restores a full backup. Schedules come back through the job runner so their
   * timers start without a restart; one that fails to start is reported, not fatal.
   */
  static async fullRestore(archivePath: string, mode: RestoreMode = 'skip'): Promise<RestoreResult> {
    const { result, startSchedules, stopSchedules } = await BackupService.restore(archivePath, mode);
    const runner = getJobRunner();
    for (const identifier of stopSchedules) {
      await runner.toggleSchedule(identifier, false).catch(() => {});
    }
    for (const identifier of startSchedules) {
      try {
        await runner.toggleSchedule(identifier, true);
      } catch (e: any) {
        result.warnings.push(`Schedule ${identifier} was restored but could not be started: ${e.message}`);
      }
    }
    return result;
  }

  static async taskValidate(path: string): Promise<string> {
    return Core.validateParsed(Parser.importFromFile(path));
  }

  /** For a file on the sender's machine: `tipeline workflow validate` with a remote active. */
  static async taskValidateContent(content: string): Promise<string> {
    const parsedTask = Parser.importFromString(content);
    assertNoLocalFiles(parsedTask);
    return Core.validateParsed(parsedTask);
  }

  private static async validateParsed(parsedTask: unknown): Promise<string> {
    const validatedTask = TaskValidator.validateFormat(parsedTask);

    await Core.assertActionsInstallable(validatedTask.pipeline?.actions ?? []);

    return 'Workflow validated successfully';
  }

  /** What validating, installing and reloading all check: known steps with valid params. */
  private static async assertActionsInstallable(actions: any[]): Promise<void> {
    const errors = await TaskValidator.validateActionTypes(actions, undefined, { params: true });
    if (errors.length > 0) throw new Error(`task.validationFailed\n${errors.join('\n')}`);
  }

  static async taskInstallFromContent(
    content: string,
    baseDir?: string,
    metadata?: Record<string, unknown>,
    fromElsewhere = false
  ) {
    const rawTask = Parser.importFromString(content);
    if (fromElsewhere) assertNoLocalFiles(rawTask);
    const validatedTask = TaskValidator.validateFormat(rawTask);

    // Before sub-workflows are installed, so a refused workflow leaves nothing behind.
    await Core.assertActionsInstallable(validatedTask.pipeline?.actions ?? []);

    const { name, version, description, author, tags } = validatedTask;

    if (validatedTask.pipeline?.actions) {
      validatedTask.pipeline.actions = await this.resolveSubtaskPaths(
        validatedTask.pipeline.actions,
        baseDir ?? process.cwd()
      );
      validatedTask.pipeline.actions = this.addActionsIdentifiers(validatedTask.pipeline.actions);
    }

    return await TaskService.install({
      name,
      version,
      description,
      author,
      tags: Array.isArray(tags) ? tags : [],
      source: JSON.stringify(validatedTask),
      ...(metadata ? { metadata } : {}),
    });
  }

  /**
   * Saves workflow YAML the assistant wrote as a draft: checked first (nothing is
   * saved if it has errors), then installed with metadata.draft so it can't run
   * from the assistant, a schedule or an app until someone marks it ready.
   */
  static async draftCreate(yaml: string, schedule?: string | null) {
    const check = await checkWorkflowYaml(yaml);
    // A proposed schedule is checked like one typed in Desktop, so a mistake comes back to fix.
    let draftSchedule: DraftSchedule | null = null;
    if (schedule && schedule.trim()) {
      try {
        draftSchedule = { when: schedule.trim(), ...resolveScheduleTiming({ when: schedule }) };
      } catch (error: any) {
        check.valid = false;
        check.errors = [...check.errors, `schedule: ${error.message}`];
      }
      let parsed: unknown = null;
      try {
        parsed = Parser.importFromString(yaml);
      } catch {
        // checkWorkflowYaml already reported it
      }
      if (draftSchedule && repeatsOnATimer(parsed)) {
        check.valid = false;
        check.errors = [
          ...check.errors,
          `schedule: the schedule (${schedule.trim()}) already starts this workflow each time. Remove the loop and ` +
            'wait that repeat it: the workflow should do the work once.',
        ];
      }
    }
    if (!check.valid) return { created: false as const, ...check };
    // The person who asked owns the draft: their Settings → Defaults author, else this
    // computer's account name. That the assistant wrote it stays in metadata.draftedBy.
    const author = (await Core.draftAuthor()) ?? '';
    const content = author ? setWorkflowAuthor(yaml, author) : yaml;
    const task = await Core.taskInstallFromContent(content, undefined, {
      draft: true,
      draftedBy: 'assistant',
      ...(draftSchedule ? { draftSchedule } : {}),
    });
    return {
      created: true as const,
      identifier: task.identifier,
      name: task.name,
      warnings: check.warnings,
      ...(draftSchedule ? { schedule: draftSchedule } : {}),
    };
  }

  private static async draftAuthor(): Promise<string | null> {
    const configured = (await SettingsService.get('defaultAuthor'))?.trim();
    if (configured) return configured;
    try {
      return os.userInfo().username || null;
    } catch {
      return null;
    }
  }

  static async taskInstall(path: string, metadata?: Record<string, unknown>) {
    return Core.installFile(path, metadata);
  }

  /** `installed` maps sub-workflow files already installed by this install to their identifiers. */
  private static async installFile(
    path: string,
    metadata?: Record<string, unknown>,
    installed?: Map<string, string>
  ) {
    const rawTask = Parser.importFromFile(path);
    const validatedTask = TaskValidator.validateFormat(rawTask);

    // Before sub-workflows are installed, so a refused workflow leaves nothing behind.
    await Core.assertActionsInstallable(validatedTask.pipeline?.actions ?? []);

    const { name, version, description, author, tags } = validatedTask;

    if (validatedTask.pipeline?.actions) {
      validatedTask.pipeline.actions = await this.resolveSubtaskPaths(
        validatedTask.pipeline.actions,
        nodePath.dirname(path),
        installed
      );
      validatedTask.pipeline.actions = this.addActionsIdentifiers(validatedTask.pipeline.actions);
    }

    return await TaskService.install({
      name,
      version,
      description,
      author,
      tags: Array.isArray(tags) ? tags : [],
      ...(metadata ? { metadata } : {}),
      source: JSON.stringify(validatedTask),
    });
  }

  /**
   * Recursively walks all actions. When a subtask.exec with a `path` param is found,
   * installs the subtask and replaces `path` with the resulting `identifier`.
   */
  private static async resolveSubtaskPaths(
    actions: any[],
    baseDir: string,
    installed: Map<string, string> = new Map()
  ): Promise<any[]> {
    if (!Array.isArray(actions)) return actions;

    // One step at a time, and a file named by several steps is installed once: steps
    // installed side by side made one copy each and raced to create the same new tags.
    const resolved: any[] = [];
    for (let action of actions) {
      if (action.params?.actions && Array.isArray(action.params.actions)) {
        action = {
          ...action,
          params: {
            ...action.params,
            actions: await this.resolveSubtaskPaths(action.params.actions, baseDir, installed),
          },
        };
      }

      if (Array.isArray(action.params?.statements)) {
        const statements = [];
        for (const stmt of action.params.statements) {
          statements.push(
            Array.isArray(stmt.actions)
              ? { ...stmt, actions: await this.resolveSubtaskPaths(stmt.actions, baseDir, installed) }
              : stmt
          );
        }
        action = { ...action, params: { ...action.params, statements } };
      }

      if (action.group === 'subtask' && action.name === 'exec' && action.params?.path) {
        const subtaskPath =
          action.params.path.startsWith('./') || action.params.path.startsWith('../')
            ? nodePath.resolve(baseDir, action.params.path)
            : action.params.path;

        let identifier = installed.get(subtaskPath);
        if (!identifier) {
          identifier = (await Core.installFile(subtaskPath, undefined, installed)).identifier;
          installed.set(subtaskPath, identifier);
        }
        const { path: _path, ...restParams } = action.params;
        action = { ...action, params: { ...restParams, identifier } };
      }

      resolved.push(action);
    }
    return resolved;
  }

  /**
   * Recursively adds unique identifiers to all actions and nested actions
   * @param actions - Array of action objects
   * @returns Array of actions with identifiers added
   */
  private static addActionsIdentifiers(actions: any[]): any[] {
    return sharedAddActionsIdentifiers(actions);
  }

  /**
   * Like addActionsIdentifiers but preserves existing identifiers — only assigns new ones
   * to actions that don't already have one. Used by taskReload to keep stable action references.
   */
  private static addActionsIdentifiersIfMissing(actions: any[]): any[] {
    if (!Array.isArray(actions)) return actions;

    return actions.map((action) => {
      const actionWithId = {
        ...action,
        identifier: action.identifier ?? generateIdentifier(),
      };

      if (actionWithId.params?.actions && Array.isArray(actionWithId.params.actions)) {
        actionWithId.params = {
          ...actionWithId.params,
          actions: this.addActionsIdentifiersIfMissing(actionWithId.params.actions),
        };
      }

      return actionWithId;
    });
  }

  static async taskReload(identifier: string, path: string) {
    return Core.reloadFrom(identifier, Parser.importFromFile(path), nodePath.dirname(path));
  }

  /** For a file on the sender's machine: `tipeline workflow reload` with a remote active. */
  static async taskReloadContent(identifier: string, content: string) {
    const rawTask = Parser.importFromString(content);
    assertNoLocalFiles(rawTask);
    return Core.reloadFrom(identifier, rawTask, process.cwd());
  }

  private static async reloadFrom(identifier: string, rawTask: unknown, baseDir: string) {
    const existing = await TaskService.getByIdentifier(identifier);
    if (!existing) throw new Error(`Workflow "${identifier}" not found`);

    const validatedTask = TaskValidator.validateFormat(rawTask);

    const { name, version, description, author } = validatedTask;

    if (validatedTask.pipeline?.actions) {
      validatedTask.pipeline.actions = await this.resolveSubtaskPaths(
        validatedTask.pipeline.actions,
        baseDir
      );
      validatedTask.pipeline.actions = this.addActionsIdentifiersIfMissing(
        validatedTask.pipeline.actions
      );
    }

    await Core.assertActionsInstallable(validatedTask.pipeline?.actions ?? []);

    return await TaskService.reload(identifier, {
      name,
      version,
      description,
      author,
      source: JSON.stringify(validatedTask),
    });
  }

  /** Moves the workflow to the Trash (see TrashService). */
  static async taskUninstall(identifier: string) {
    const trashId = await TrashService.trash('task', identifier);
    return { identifier, trashId };
  }

  static async trashList() {
    return await TrashService.list();
  }

  static async trashRestore(id: number) {
    return await TrashService.restore(Number(id));
  }

  static async trashDelete(ids: number[]) {
    return { removed: await TrashService.remove((ids ?? []).map(Number)) };
  }

  static async trashEmpty() {
    return { removed: await TrashService.empty() };
  }

  static async variableDelete(identifier: string) {
    return await GlobalVariableService.delete(identifier);
  }

  /**
   * Finds every task whose source references a variable by name, so the
   * Desktop UI can warn before deleting a global variable that's still in
   * use. Scans the whole stored source (stringified) rather than only known
   * template fields, since references can appear in nested action params
   * (props, context, etc) the caller shouldn't need to enumerate.
   */
  static async variableUsage(name: string): Promise<{ taskIdentifier: string; taskName: string }[]> {
    const tasks = await TaskService.getAllWithSource();
    const usages: { taskIdentifier: string; taskName: string }[] = [];
    for (const task of tasks) {
      if (task.source && sourceReferencesVariable(task.source, name)) {
        usages.push({ taskIdentifier: task.identifier, taskName: task.name });
      }
    }
    return usages;
  }

  static async tagList() {
    return await TagService.getAll();
  }

  static async tagNew(data: any) {
    return await TagService.create(data.label);
  }

  static async tagRename(data: any) {
    return await TagService.rename(data.id, data.label);
  }

  static async tagDelete(id: number) {
    return await TagService.delete(id);
  }

  static async pipelineList(taskIdentifier: string | null, limit = 100, offset = 0, status?: string) {
    if (taskIdentifier) {
      return await PipelineService.getByTaskIdentifier(taskIdentifier, limit, offset, status);
    } else {
      return await PipelineService.getAllWithTaskName(limit, offset, status);
    }
  }

  /** Runs started, and failed, per period: the dashboard's Today row. */
  static async pipelineStats(boundaries: unknown) {
    if (!Array.isArray(boundaries) || !boundaries.every((b) => typeof b === 'string' && !Number.isNaN(Date.parse(b)))) {
      throw new Error('boundaries must be a list of ISO dates');
    }
    return await PipelineService.countsByPeriod(boundaries as string[]);
  }

  static async pipelineDetail(pipelineIdentifier: string) {
    const pipeline = await PipelineService.getByIdentifierWithActions(pipelineIdentifier);
    if (!pipeline) return pipeline;
    return Object.assign(pipeline, {
      variables: await Core.pipelineVariableValues(pipeline),
      // The runs its sub-workflow steps started, for the run page to nest and link them.
      children: await PipelineService.getChildRuns(pipeline.identifier),
    });
  }

  /**
   * The values a run's variables ended with (the current-value rows, not the per-iteration
   * snapshots). Secret variables and env-sourced ones keep their name but never their
   * value — viewers can read run details too.
   */
  private static async pipelineVariableValues(pipeline: { id: number; source?: string | null }) {
    const hidden = (await Core.sensitiveVariableNamesByPipeline([pipeline])).get(pipeline.id);
    const rows = await PipelineVariableService.getByPipelineId(pipeline.id);
    return rows.map((row) => {
      const isHidden = row.scope === 'env' || !!hidden?.has(row.name);
      let value: unknown = null;
      if (!isHidden) {
        try {
          value = JSON.parse(row.value);
        } catch {
          value = row.value;
        }
      }
      return { name: row.name, value, type: row.type ?? null, scope: row.scope, hidden: isHidden };
    });
  }

  static async pipelineClear(taskIdentifier: string) {
    const task = await TaskService.getByIdentifier(taskIdentifier);
    if (!task) throw new Error(`Workflow not found: ${taskIdentifier}`);
    const identifiers = await PipelineService.deleteAllForTask(task.id);
    return { deleted: identifiers.length, identifiers };
  }

  static async pipelineDelete(identifiers: string[]) {
    if (!Array.isArray(identifiers)) throw new Error('pipelineDelete needs a list of run identifiers');
    const deleted = await PipelineService.deleteByIdentifiers(identifiers);
    return { deleted: deleted.length, identifiers: deleted };
  }

  static async pipelineClearAll() {
    const identifiers = await PipelineService.deleteAll();
    return { deleted: identifiers.length, identifiers };
  }

  static async tableDataFetch(params: {
    taskIdentifier: string;
    sourceType: 'actionResults' | 'variables';
    filterMode: 'latest' | 'byId' | 'dateRange' | 'range';
    pipelineIdentifier?: string;
    dateFrom?: string;
    dateTo?: string;
    count?: number;
    actionIdentifier?: string;
    variableName?: string;
  }) {
    const { taskIdentifier, sourceType, filterMode, pipelineIdentifier, dateFrom, dateTo, count, actionIdentifier, variableName } = params;

    const task = await TaskService.getByIdentifier(taskIdentifier);
    if (!task) throw new Error(`Workflow not found: ${taskIdentifier}`);

    const pipelines = await PipelineService.getFilteredByTask(task.id, filterMode, {
      pipelineIdentifier,
      dateFrom,
      dateTo,
      count,
    });

    if (pipelines.length === 0) return [];
    const pipelineIds = pipelines.map((p) => p.id);

    if (sourceType === 'actionResults') {
      const actions = await PipelineActionService.getByPipelineIds(pipelineIds, actionIdentifier);
      return actions.map((a) => {
        const pipeline = pipelines.find((p) => p.id === a.pipeline_id);
        const result = typeof a.result === 'string' ? (() => { try { return JSON.parse(a.result as string); } catch { return a.result; } })() : a.result;
        const resultFields = typeof result === 'object' && result !== null ? result : { result };
        return {
          pipeline_identifier: pipeline?.identifier ?? '',
          pipeline_started_at: pipeline?.started_at ?? '',
          action_identifier: a.identifier,
          status: a.status,
          ...resultFields,
        };
      });
    } else {
      const hidden = await Core.sensitiveVariableNamesByPipeline(pipelines);
      const vars = (await PipelineVariableService.getByPipelineIds(pipelineIds, variableName)).filter(
        (v) => v.scope !== 'env' && !hidden.get(v.pipeline_id)?.has(v.name)
      );
      return vars.map((v) => {
        const pipeline = pipelines.find((p) => p.id === v.pipeline_id);
        let value: any;
        try { value = JSON.parse(v.value); } catch { value = v.value; }
        return {
          pipeline_identifier: pipeline?.identifier ?? '',
          pipeline_started_at: pipeline?.started_at ?? '',
          name: v.name,
          value: typeof value === 'object' ? JSON.stringify(value) : value,
          type: v.type,
          scope: v.scope,
        };
      });
    }
  }

  /**
   * Finds a runnable in an app's stored source and resolves its workflow alias. Runs and
   * history reads always use the stored definition — the renderer only names which
   * runnable to call — so an app can't reach a workflow it doesn't declare.
   */
  private static async resolveAppRunnable(appIdentifier: string, pageId: string, runnableName: string) {
    const app = await AppService.getByIdentifier(appIdentifier);
    if (!app) throw new Error(`App not found: ${appIdentifier}`);
    const source = coreValidations.appObject.parseAppSource(app.source ?? '');
    const page = source.pages.find((p) => p.id === pageId);
    if (!page) throw new Error(`Page "${pageId}" not found in app`);
    const runnable = page.runnables[runnableName];
    if (!runnable) throw new Error(`Runnable "${runnableName}" not found on page "${pageId}"`);
    // Existence of the alias is guaranteed by parseAppSource's cross-reference checks.
    return { runnable, taskIdentifier: source.workflows[runnable.workflow].identifier, appName: app.name as string };
  }

  /**
   * Runs an app runnable (`mode: run`). `inputs` holds the values the desktop resolved
   * for the runnable's declared inputs; each must target a non-private variable of the
   * workflow, and each requested output a non-private, non-secret one. Resolves when the
   * run finishes; the outputs reach the caller on the top-level `taskEnd` event.
   */
  static async appRun(
    params: {
      appIdentifier: string;
      pageId: string;
      runnable: string;
      inputs?: Record<string, unknown>;
      // 'refresh' runs the workflow even when its outputs are cached (an app's refresh button).
      cache?: unknown;
    },
    correlationId: string
  ) {
    const { runnable, taskIdentifier, appName } = await Core.resolveAppRunnable(
      params.appIdentifier,
      params.pageId,
      params.runnable
    );
    if (runnable.mode !== 'run') {
      throw new Error(`Runnable "${params.runnable}" reads run history and can't be run`);
    }

    const task = await TaskService.getByIdentifier(taskIdentifier);
    if (!task?.source) throw new Error(`Workflow not found: ${taskIdentifier}`);
    const declared: any[] = JSON.parse(task.source)?.pipeline?.variables ?? [];
    const find = (name: string) => declared.find((v) => v?.name === name);

    const inputs: Record<string, unknown> = { ...(params.inputs ?? {}) };
    for (const key of Object.keys(inputs)) {
      if (!Object.prototype.hasOwnProperty.call(runnable.inputs, key)) {
        throw new Error(`Input "${key}" is not declared on runnable "${params.runnable}"`);
      }
      const variable = find(key);
      if (!variable) throw new Error(`Workflow has no variable "${key}"`);
      if ((variable.visibility ?? 'private') === 'private') {
        throw new Error(`Variable "${key}" is private and cannot be set by an app.`);
      }
      if (variable.output) {
        throw new Error(`Variable "${key}" is an output of the workflow and cannot be set by an app.`);
      }
      // An empty form field means "not provided" for anything but a string: the
      // workflow keeps its own default instead of failing to read "" as a number,
      // date, boolean, array or object.
      if (inputs[key] === '' && (variable.type ?? 'string') !== 'string') delete inputs[key];
    }
    for (const name of runnable.outputs) {
      const variable = find(name);
      if (!variable) throw new Error(`Workflow has no variable "${name}"`);
      if ((variable.visibility ?? 'private') === 'private') {
        throw new Error(`Variable "${name}" is private and cannot be read by an app.`);
      }
      if (variable.secret) throw new Error(`Variable "${name}" is secret and cannot be read by an app.`);
    }

    await Core.exec(taskIdentifier, correlationId, inputs, false, false, {
      ephemeral: !runnable.persist,
      outputs: runnable.outputs,
      // Recorded on the pipeline so run history shows which app, page and runnable ran it.
      trigger: { type: 'app', appIdentifier: params.appIdentifier, appName, pageId: params.pageId, runnable: params.runnable },
      cacheMode: toCacheMode(params.cache),
    });
    return { taskIdentifier };
  }

  /**
   * Decisions already made, newest first: who approved or rejected what, when, and why —
   * including automatic ones (`decidedBy: timeout`). Reads the most recent `limit` runs
   * that had an approval (optionally only these workflows).
   */
  static async approvalHistory(params: { taskIdentifiers?: string[]; limit?: number } = {}) {
    const rows = await PipelineService.getDecidedApprovals(params.taskIdentifiers, Math.min(params.limit ?? 200, 500));
    const decisions = rows.flatMap((r: any) => {
      const metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata ?? {});
      return Object.entries((metadata.approvals ?? {}) as Record<string, any>).map(([key, d]) => ({
        key,
        pipelineIdentifier: r.identifier,
        taskIdentifier: r.task_identifier,
        workflowName: r.task_name,
        title: d.title ?? '',
        requestedAt: d.requestedAt ?? null,
        approved: d.approved === true,
        comment: d.comment ?? '',
        decidedBy: d.decidedBy ?? '',
        decidedAt: d.decidedAt ?? null,
        runStatus: r.status,
        trigger: metadata.trigger ?? null,
      }));
    });
    return decisions.sort((a, b) => String(b.decidedAt ?? '').localeCompare(String(a.decidedAt ?? '')));
  }

  /** Runs waiting at an approval.request, newest first (optionally only these workflows). */
  static async approvalList(taskIdentifiers?: string[]) {
    const rows = await PipelineService.getPendingApprovals(taskIdentifiers);
    return rows.map((r: any) => {
      const metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata ?? {});
      return {
        pipelineIdentifier: r.identifier,
        taskIdentifier: r.task_identifier,
        workflowName: r.task_name,
        title: metadata.approval?.title ?? '',
        details: metadata.approval?.details ?? null,
        requestedAt: metadata.approval?.requestedAt ?? r.started_at,
        expiresAt: metadata.approval?.expiresAt ?? null,
        onTimeout: metadata.approval?.expiresAt ? (metadata.approval?.onTimeout ?? 'reject') : null,
        timeout: metadata.approval?.timeout ?? null,
        approvers: metadata.approval?.approvers ?? null,
        allowSelfApproval: metadata.approval?.allowSelfApproval !== false,
        trigger: metadata.trigger ?? null,
      };
    });
  }

  /**
   * Records a decision for the approval a run is waiting at and resumes the run
   * (in the background — the caller doesn't wait for the rest of the workflow).
   * Only one decision wins: the run is claimed atomically.
   */
  static async approvalDecide(params: { pipelineIdentifier: string; approved: boolean; comment?: string; decidedBy?: string }) {
    const pipeline = await PipelineService.getByIdentifier(params.pipelineIdentifier);
    const pending = (pipeline?.metadata as any)?.approval;
    if (!pipeline || pipeline.status !== 'paused' || !pending) {
      throw new Error('Nothing is waiting for approval on this run');
    }
    if (!(await PipelineService.claimPaused(pipeline.id))) {
      throw new Error('This approval was already decided');
    }
    const approvals = { ...((pipeline.metadata as any)?.approvals ?? {}) };
    approvals[pending.key] = {
      approved: params.approved === true,
      comment: params.comment ?? '',
      decidedAt: new Date().toISOString(),
      decidedBy: params.decidedBy ?? 'desktop',
      // What was asked, kept for the decision history (Core.approvalHistory).
      title: pending.title ?? '',
      requestedAt: pending.requestedAt ?? null,
    };
    await PipelineService.mergeMetadata(pipeline.id, { approval: null, approvals });

    // Resumed in the background, its progress broadcast like any run's, so run lists,
    // Activity and the Approvals badge see it continue and finish.
    const correlationId = generateIdentifier();
    const broadcast = Core.broadcast;
    const listener = broadcast ? new TaskStreamListener(correlationId, broadcast) : null;
    listener?.bind();
    void getJobRunner()
      .submit({ type: 'resume', correlationId, pipelineIdentifier: pipeline.identifier })
      .then(() => broadcast?.('onTaskEndAll', IPCMessage.success({ pipelineIdentifier: pipeline.identifier }, correlationId)))
      .catch((error) => {
        console.error('[approval] resume failed:', error?.message ?? error);
        broadcast?.('onTaskError', IPCMessage.failure(error?.message ?? String(error), correlationId));
      })
      .finally(() => listener?.unbind());
    return { pipelineIdentifier: pipeline.identifier, approved: params.approved === true };
  }

  /** The workflow identifiers an app declares, by alias. */
  private static async appWorkflows(appIdentifier: string) {
    const app = await AppService.getByIdentifier(appIdentifier);
    if (!app) throw new Error(`App not found: ${appIdentifier}`);
    const source = coreValidations.appObject.parseAppSource(app.source ?? '');
    return { app, workflows: source.workflows };
  }

  /** Approvals waiting on the app's workflows (optionally only some of its aliases). */
  static async appApprovalList(params: { appIdentifier: string; workflows?: string[] }) {
    const { workflows } = await Core.appWorkflows(params.appIdentifier);
    const aliases = params.workflows?.length ? params.workflows : Object.keys(workflows);
    const identifiers = aliases.map((a) => workflows[a]?.identifier).filter(Boolean) as string[];
    return identifiers.length ? await Core.approvalList(identifiers) : [];
  }

  /**
   * Past and live runs of the app's workflows (optionally only some aliases and
   * statuses), newest first — for an app's Runs component. Only runs that keep
   * history: runnables with `persist: false` leave none. Each run says which alias
   * started it, how it was started and, when it failed or was canceled, why.
   * `workflows` omitted: all the app's workflows; an empty list: none (the server
   * gateway narrows it to the ones the signed-in user may see).
   */
  static async appRunsList(params: {
    appIdentifier: string;
    workflows?: string[];
    statuses?: string[];
    limit?: number;
  }) {
    const { workflows } = await Core.appWorkflows(params.appIdentifier);
    const aliases = Array.isArray(params.workflows) ? params.workflows : Object.keys(workflows);
    const aliasOf = new Map<string, string>();
    for (const alias of aliases) {
      const identifier = workflows[alias]?.identifier;
      if (identifier && !aliasOf.has(identifier)) aliasOf.set(identifier, alias);
    }
    const limit = Math.min(Math.max(Math.trunc(Number(params.limit)) || 20, 1), 200);
    const statuses = (params.statuses ?? []).filter((s) =>
      ['pending', 'running', 'failed', 'completed', 'canceled', 'paused'].includes(s)
    );
    const rows = await PipelineService.getByTaskIdentifiers([...aliasOf.keys()], { statuses, limit });
    return rows.map((row: any) => {
      let metadata: any = row.metadata ?? {};
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = {};
        }
      }
      const trigger = metadata.trigger ?? {};
      return {
        pipelineIdentifier: row.identifier,
        taskIdentifier: row.task_identifier,
        workflow: aliasOf.get(row.task_identifier) ?? null,
        workflowName: row.task_name,
        status: row.status,
        startedAt: row.started_at ?? null,
        finishedAt: row.finished_at ?? null,
        /** app, schedule, user… and who / what: the app's name, the person. */
        trigger: { type: trigger.type ?? null, name: trigger.appName ?? trigger.name ?? null },
        message: row.status === 'failed' || row.status === 'canceled' ? (metadata.message ?? null) : null,
      };
    });
  }

  /**
   * Decides an approval from an app — only for runs of workflows the app declares.
   * `actor` is the person deciding when known (set by the server gateway from the
   * signed-in user), recorded alongside the app.
   */
  static async appApprovalDecide(params: {
    appIdentifier: string;
    pipelineIdentifier: string;
    approved: boolean;
    comment?: string;
    actor?: string;
  }) {
    const { app, workflows } = await Core.appWorkflows(params.appIdentifier);
    const pending = await Core.approvalList(Object.values(workflows).map((w) => w.identifier));
    if (!pending.some((p) => p.pipelineIdentifier === params.pipelineIdentifier)) {
      throw new Error('Nothing is waiting for approval on this run');
    }
    const { actor, ...decision } = params;
    return await Core.approvalDecide({ ...decision, decidedBy: actor ? `${actor} (app:${app.name})` : `app:${app.name}` });
  }

  /**
   * Reads past-run results for an app runnable (`mode: history`). Its filter values
   * may be bindings (e.g. a date range component's dates): the app resolves them and
   * sends them as `filter`; they replace the saved ones. Only the filter can change —
   * the workflow and what is read stay as the app declares them.
   */
  static async appHistoryFetch(params: {
    appIdentifier: string;
    pageId: string;
    runnable: string;
    filter?: { dateFrom?: unknown; dateTo?: unknown; count?: unknown; pipelineIdentifier?: unknown };
  }) {
    const { runnable, taskIdentifier } = await Core.resolveAppRunnable(
      params.appIdentifier,
      params.pageId,
      params.runnable
    );
    if (runnable.mode !== 'history') {
      throw new Error(`Runnable "${params.runnable}" runs a workflow; it doesn't read history`);
    }
    const filter = Core.historyFilter(runnable.filter, params.filter);
    return await Core.tableDataFetch({
      taskIdentifier,
      sourceType: runnable.source,
      filterMode: runnable.filter.mode,
      pipelineIdentifier: filter.pipelineIdentifier,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      count: filter.count,
      actionIdentifier: runnable.actionIdentifier,
      variableName: runnable.variableName,
    });
  }

  /**
   * A history runnable's filter: the saved values, with the app's resolved ones on
   * top. A value that is still a binding (nothing resolved it — e.g. a direct call)
   * counts as unset, never as text to filter by. An empty value clears the filter.
   */
  static historyFilter(
    saved: { dateFrom?: string; dateTo?: string; count?: number | string; pipelineIdentifier?: string },
    sent: { dateFrom?: unknown; dateTo?: unknown; count?: unknown; pipelineIdentifier?: unknown } = {}
  ) {
    const text = (key: 'dateFrom' | 'dateTo' | 'pipelineIdentifier') => {
      const value = key in sent ? sent[key] : saved[key];
      return typeof value === 'string' && value.trim() && !/\{[{=%]/.test(value) ? value.trim() : undefined;
    };
    const rawCount = 'count' in sent ? sent.count : saved.count;
    const count = Number(rawCount);
    return {
      dateFrom: text('dateFrom'),
      dateTo: text('dateTo'),
      pipelineIdentifier: text('pipelineIdentifier'),
      count: Number.isInteger(count) && count > 0 ? count : undefined,
    };
  }

  /**
   * Names of the variables that must never be returned to an App, per pipeline:
   * those declared `secret` in the workflow source the pipeline ran, and those
   * sourced from a global variable that is itself secret. (Env-sourced variables
   * are excluded separately by their `env` scope.) Uses each pipeline's own source
   * snapshot, so a workflow edited since that run is judged as it was at the time.
   */
  private static async sensitiveVariableNamesByPipeline(
    pipelines: Array<{ id: number; source?: string | null }>
  ): Promise<Map<number, Set<string>>> {
    const secretGlobals = new Set(
      (await GlobalVariableService.getAll()).filter((g: any) => g.secret).map((g: any) => g.name)
    );
    const result = new Map<number, Set<string>>();
    for (const pipeline of pipelines) {
      const names = new Set<string>();
      let declared: any[] = [];
      try {
        declared = JSON.parse(pipeline.source ?? '{}')?.pipeline?.variables ?? [];
      } catch {
        declared = [];
      }
      for (const variable of Array.isArray(declared) ? declared : []) {
        if (!variable?.name) continue;
        if (variable.secret || (variable.valueFromGlobal && secretGlobals.has(variable.valueFromGlobal))) {
          names.add(variable.name);
        }
      }
      result.set(pipeline.id, names);
    }
    return result;
  }

  /**
   * Cancels a run. A running one ends right away, its current step included, and ends
   * as canceled, along with the sync sub-workflows it waits
   * for (they run in the same job; canceling one of those stops its parent too). A run
   * waiting for an approval ends as canceled right away. Runs that don't persist (app
   * runnables with `persist: false`) have no pipelineIdentifier: they're named by the
   * correlationId of the request that started them.
   *
   * `canceling` — the job was asked to stop; `canceled` — done (with the run's workflow,
   * so the caller can announce its end); `not_running` — it had already ended.
   */
  static async pipelineCancel(params: {
    pipelineIdentifier?: string;
    correlationId?: string;
    canceledBy?: string;
  }): Promise<
    | { status: 'canceling' | 'not_running' }
    | { status: 'canceled'; pipelineIdentifier: string; taskIdentifier: string }
  > {
    const runner = getJobRunner();
    if (!runner.cancel) throw new Error('Canceling runs is not supported by this job runner yet');
    const canceledBy = params.canceledBy ?? '';

    const job =
      params.correlationId ||
      (params.pipelineIdentifier ? (runner.findJob?.(params.pipelineIdentifier) ?? null) : null);
    if (job && runner.cancel(job, canceledBy)) return { status: 'canceling' };
    if (!params.pipelineIdentifier) return { status: 'not_running' };

    const pipeline = await PipelineService.getByIdentifier(params.pipelineIdentifier);
    if (!pipeline) throw new Error('Run not found');
    // Waiting for an approval: no job runs it, so it ends here. A decision arriving at
    // the same moment loses (or wins) atomically — see PipelineService.cancelIdle.
    if (pipeline.status === 'paused') {
      const message = canceledBy ? `Canceled by ${canceledBy}` : 'Canceled';
      const canceled = await PipelineService.cancelIdle(pipeline.id, ['paused'], {
        reason: 'user_canceled',
        message,
        canceledBy,
      });
      if (canceled) {
        const task = await TaskService.getById(pipeline.task_id);
        return {
          status: 'canceled',
          pipelineIdentifier: pipeline.identifier,
          taskIdentifier: task?.identifier ?? '',
        };
      }
    }
    return { status: 'not_running' };
  }

  /**
   * For values someone typed (the CLI's --var): a name the workflow doesn't take is a
   * mistake to report, not something to ignore. Resuming may also correct private
   * variables, since it's repairing a run rather than calling a workflow.
   */
  static async checkRunVariables(
    target: { identifier?: string; source?: string; content?: string; pipelineIdentifier?: string },
    variables: Record<string, unknown> = {}
  ) {
    let declared: unknown;
    if (target.identifier) {
      const task = await TaskService.getByIdentifier(target.identifier);
      declared = JSON.parse(task?.source ?? '{}')?.pipeline?.variables;
    } else if (target.content) {
      declared = (Parser.importFromString(target.content) as any)?.pipeline?.variables;
    } else if (target.source) {
      declared = (Parser.importFromFile(target.source) as any)?.pipeline?.variables;
    } else if (target.pipelineIdentifier) {
      const pipeline = await PipelineService.getByIdentifier(target.pipelineIdentifier);
      declared = JSON.parse(pipeline?.source ?? '{}')?.pipeline?.variables;
    }
    assertRunVariables(Array.isArray(declared) ? declared : [], variables, {
      allowPrivate: !!target.pipelineIdentifier,
    });
  }

  static async pipelineResume(
    pipelineIdentifier: string,
    correlationId: string = '',
    variables: Record<string, any> = {}
  ) {
    await getJobRunner().submit({ type: 'resume', correlationId, pipelineIdentifier, variables });
  }

  /** Timing as plain words or a cron (`when`), a `cron`, or a `runAt` time to run once. */
  static async scheduleSet(
    taskIdentifier: string,
    options: ScheduleTimingInput & { variables?: Record<string, any> }
  ) {
    const timing = resolveScheduleTiming(options);
    assertNotDraft(await TaskService.getByIdentifier(taskIdentifier));
    return await getJobRunner().scheduleTask(taskIdentifier, { ...timing, variables: options.variables });
  }

  static async scheduleRemove(scheduleIdentifier: string) {
    await getJobRunner().removeSchedule(scheduleIdentifier);
  }

  static async scheduleToggle(scheduleIdentifier: string, enabled: boolean) {
    await getJobRunner().toggleSchedule(scheduleIdentifier, enabled);
  }

  static async scheduleList() {
    return await getJobRunner().listSchedules();
  }

  static async settingsList() {
    return await SettingsService.getAll();
  }

  static async settingsSet(key: string, value: string) {
    if (key === CACHE_MAX_SIZE_SETTING && !(Number(value) > 0)) {
      throw new Error('The cache size limit must be a number of MB above 0.');
    }
    if (key === RUN_KEEP_DAYS_SETTING && !(Number.isInteger(Number(value)) && Number(value) >= 0)) {
      throw new Error('Keep runs for a whole number of days, or 0 to keep them forever.');
    }
    await SettingsService.set(key, value);
    if (key === 'timezone') AppSettings.timezone = value;
    // A lower limit applies now, not at the next sweep.
    if (key === CACHE_MAX_SIZE_SETTING) await CacheService.sweep();
    if (key === RUN_KEEP_DAYS_SETTING) void RunHistoryPurger.purge();
    return { key, value };
  }

  // ---------------------------------------------------------------------
  // Script preview
  // ---------------------------------------------------------------------

  /**
   * Runs a `script.runScript` step's code for the editor's Output tab, with its
   * `context` resolved against the given variable values and the current globals.
   */
  static async scriptPreview(params: ScriptPreviewParams) {
    if (typeof params?.code !== 'string') throw new Error('Script preview needs code.');
    const needsGlobals = JSON.stringify(params.context ?? {}).includes('_global.');
    const globals = needsGlobals ? await GlobalVariableService.getAll() : [];
    return runScriptPreview(params, globals as any[]);
  }

  // ---------------------------------------------------------------------
  // Result cache
  // ---------------------------------------------------------------------

  /** Stored results, newest first (optionally one workflow's), with the cache's size. */
  static async cacheList(params: { owner?: string } = {}) {
    const [entries, stats] = await Promise.all([CacheService.list(params), CacheService.stats()]);
    return { entries, ...stats };
  }

  /** Removes one entry (`key`), one workflow's entries (`owner`), or all of them. */
  static async cacheClear(params: { key?: string; owner?: string } = {}) {
    return { removed: await CacheService.clear(params) };
  }

  static async getApiToken() {
    return await SettingsService.getOrCreateToken();
  }

  static async agentRunCreate(correlationId: string, prompt: string) {
    return await AgentRunService.create(correlationId, prompt);
  }

  static async agentRunMarkProposed(
    correlationId: string,
    taskIdentifier: string | null,
    answer: string,
    taskName?: string | null
  ) {
    return await AgentRunService.markProposed(correlationId, taskIdentifier, answer, taskName);
  }

  static async agentRunMarkTaskRunning(correlationId: string, taskIdentifier: string) {
    await AgentRunService.markTaskRunning(correlationId, taskIdentifier);
  }

  static async agentRunSetPipeline(correlationId: string, pipelineIdentifier: string) {
    await AgentRunService.setPipeline(correlationId, pipelineIdentifier);
  }

  static async agentRunComplete(correlationId: string, answer: string) {
    await AgentRunService.complete(correlationId, answer);
  }

  static async agentRunFail(correlationId: string, error: string) {
    await AgentRunService.fail(correlationId, error);
  }

  static async agentRunList() {
    return await AgentRunService.list();
  }

  // Merges the DB-persisted plugin record with the in-memory registries
  // populated by PluginLoader (actions/params/docs aren't persisted — they
  // only exist for the lifetime of the loaded module).
  private static enrichPlugin<T extends { group: string; status: string }>(plugin: T) {
    return {
      ...plugin,
      actions: plugin.status === 'ok' ? Object.keys(PluginActionRegistry[plugin.group] ?? {}) : [],
      params: plugin.status === 'ok' ? (PluginParamsRegistry[plugin.group] ?? {}) : {},
      docs: plugin.status === 'ok' ? (PluginDocsRegistry[plugin.group] ?? {}) : {},
      rules: plugin.status === 'ok' ? (PluginRulesRegistry[plugin.group] ?? {}) : {},
      returns: plugin.status === 'ok' ? (PluginReturnsRegistry[plugin.group] ?? {}) : {},
      cacheable: plugin.status === 'ok' ? (PluginCacheableRegistry[plugin.group]?.actions ?? []) : [],
    };
  }

  static async pluginList() {
    const plugins = await PluginService.getAll();
    return plugins.map((plugin) => Core.enrichPlugin(plugin));
  }

  static async pluginScan() {
    await PluginLoader.load();
    return Core.pluginList();
  }

  static async pluginDetail(identifier: string) {
    const plugin = await PluginService.getByIdentifier(identifier);
    return plugin ? Core.enrichPlugin(plugin) : plugin;
  }

  static async pluginSetEnabled(identifier: string, enabled: boolean) {
    const plugin = await PluginService.setEnabled(identifier, enabled);
    if (enabled && plugin?.path) {
      await PluginLoader.reloadSingle(plugin.path);
    } else if (!enabled && plugin?.group) {
      delete PluginActionRegistry[plugin.group];
      delete PluginParamsRegistry[plugin.group];
      delete PluginDocsRegistry[plugin.group];
      delete PluginRulesRegistry[plugin.group];
      delete PluginSchemaRegistry[plugin.group];
      delete PluginReturnsRegistry[plugin.group];
      delete PluginCacheableRegistry[plugin.group];
    }
    return plugin;
  }

  static async pluginRemove(identifier: string) {
    return await PluginService.remove(identifier);
  }

  static async pluginUsage(group: string): Promise<{ count: number; tasks: { name: string; identifier: string }[] }> {
    const allTasks = await TaskService.getAllWithSource();
    const affected = allTasks.filter((task: { source: string | null }) => {
      if (!task.source) return false;
      try {
        const source = JSON.parse(task.source);
        return Core.extractActionGroups(source.pipeline?.actions ?? []).includes(group);
      } catch {
        return false;
      }
    });
    return {
      count: affected.length,
      tasks: affected.map((t: { name: string; identifier: string }) => ({ name: t.name, identifier: t.identifier })),
    };
  }

  private static extractActionGroups(actions: any[]): string[] {
    return actionGroups(actions);
  }

  // ---------------------------------------------------------------------
  // Hub
  // ---------------------------------------------------------------------

  /** A hub as clients see it: the token is swapped for `hasToken`, so it never leaves Core. */
  private static hubView(hub: Hub) {
    const { token, ...rest } = hub;
    return { ...rest, hasToken: !!token };
  }

  static async hubList() {
    return (await HubService.list()).map((hub) => Core.hubView(hub));
  }

  static async hubAdd(data: { name: string; type: 'remote' | 'local_folder'; target: string; token?: string | null }) {
    return Core.hubView(await HubService.add(data));
  }

  static async hubUpdate(
    id: string,
    data: Partial<{ name: string; type: 'remote' | 'local_folder'; target: string; token: string | null }>
  ) {
    HubWorkflowCatalog.clear();
    return Core.hubView(await HubService.update(id, data));
  }

  static async hubRemove(id: string) {
    HubWorkflowCatalog.clear();
    return await HubService.remove(id);
  }

  static async hubSetEnabled(id: string, enabled: boolean) {
    HubWorkflowCatalog.clear();
    return Core.hubView(await HubService.setEnabled(id, enabled));
  }

  /** For each installed workflow, what makes it harder for the assistant to find or fill in. */
  static async assistantFindability() {
    const tasks = await TaskService.getAllWithSource();
    return tasks
      .map((task) => ({ identifier: task.identifier, name: task.name, issues: findabilityIssues(task) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Clears a workflow's draft flag: from now on the assistant, schedules and apps may run it.
   * With `withSchedule`, also turns on the schedule the assistant proposed. Being ready
   * doesn't depend on that: when the schedule can't start (its one-time slot has passed)
   * the reason comes back as `scheduleError`.
   */
  static async taskMarkReady(identifier: string, withSchedule = false) {
    const proposed = readDraftSchedule(await TaskService.getByIdentifier(identifier));
    const task = await TaskService.setDraft(identifier, false);
    if (!withSchedule || !proposed) return task;
    try {
      const scheduleIdentifier = await Core.scheduleSet(identifier, {
        cron: proposed.cron,
        runAt: proposed.runAt,
        everySeconds: proposed.everySeconds,
      });
      return { ...task, scheduleIdentifier };
    } catch (error: any) {
      return { ...task, scheduleError: error.message ?? String(error) };
    }
  }

  /** What installing a hub workflow would bring: its inputs, and plugins this Core is missing. */
  static async hubPreviewTask(hubId: string, itemIdentifier: string) {
    return await HubWorkflowCatalog.preview(hubId, itemIdentifier);
  }

  static async hubCatalog(hubId: string) {
    const hub = await HubService.getById(hubId);
    if (!hub) throw new Error(`Hub "${hubId}" not found`);
    return await HubProviderFactory.getProvider(hub).fetchCatalog(hub);
  }

  static async hubInstallTask(hubId: string, itemIdentifier: string) {
    return await HubSyncService.installTask(hubId, itemIdentifier);
  }

  static async hubInstallApp(hubId: string, itemIdentifier: string) {
    return await HubSyncService.installApp(hubId, itemIdentifier);
  }

  static async hubInstallPlugin(hubId: string, itemIdentifier: string) {
    return await HubSyncService.installPlugin(hubId, itemIdentifier);
  }

  static async hubUpdateTask(taskIdentifier: string) {
    return await HubSyncService.updateTask(taskIdentifier);
  }

  static async hubUpdateApp(appIdentifier: string) {
    return await HubSyncService.updateApp(appIdentifier);
  }

  static async hubUpdatePlugin(pluginIdentifier: string) {
    return await HubSyncService.updatePlugin(pluginIdentifier);
  }

  static async hubPreviewUpdate(type: 'task' | 'app' | 'plugin', identifier: string) {
    return await HubSyncService.previewUpdate(type, identifier);
  }

  static async hubUpdateEvents() {
    return await HubUpdateEventService.list();
  }

  static async hubUpdateEventsRead() {
    await HubUpdateEventService.markAllRead();
  }

  static async hubCheckAll() {
    return await HubSyncService.checkAllHubs();
  }

  static async hubCheckOne(hubId: string) {
    return await HubSyncService.checkHub(hubId);
  }

  static async hubSetTaskAutoUpdate(identifier: string, autoUpdate: boolean) {
    return await TaskService.setAutoUpdate(identifier, autoUpdate);
  }

  static async hubSetAppAutoUpdate(identifier: string, autoUpdate: boolean) {
    return await AppService.setAutoUpdate(identifier, autoUpdate);
  }

  static async hubSetPluginAutoUpdate(identifier: string, autoUpdate: boolean) {
    return await PluginService.setAutoUpdate(identifier, autoUpdate);
  }
}
