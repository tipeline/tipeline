import { Project as ProjectModel } from '@/database/models/Project';
import { appWorkflowIdentifiers, calledWorkflowIdentifiers } from '@/database/services/WorkflowUsageService';
import { isDraft } from '@task/Draft';
import {
  describeCron,
  describeInterval,
  parsePlan,
  projectMapPlanSchema,
  type LiveMap,
  type LiveMapEdge,
  type LiveMapNode,
  type MapProjectRef,
  type ProjectMapPlan,
} from '@tipeline/utils';

const parseJson = (raw: unknown): any => {
  if (typeof raw !== 'string') return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Template segments: {{ … }}, {% … %} and {= … =}.
const TEMPLATE_SEGMENT = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{=[\s\S]*?=\}/g;
const GLOBAL_NAME = /_global\.([A-Za-z_]\w*)/g;
// `_global[...]` or `_global.` followed by another template: a name built while running.
const DYNAMIC_GLOBAL = /_global\s*\[|_global\.(?![A-Za-z_])/;
const GLOBAL_TARGET = /^_global\.([A-Za-z_]\w*)$/;

export type SourceGlobals = { reads: string[]; writes: string[]; dynamic: boolean };

/** The globals a string reads in its templates, and whether it builds one's name. */
function scanTemplates(text: string, reads: Set<string>): boolean {
  let dynamic = false;
  for (const segment of text.match(TEMPLATE_SEGMENT) ?? []) {
    for (const m of segment.matchAll(GLOBAL_NAME)) reads.add(m[1]);
    if (DYNAMIC_GLOBAL.test(segment)) dynamic = true;
  }
  return dynamic;
}

/**
 * The globals a workflow writes (a step's `destination`, or `variable.set`'s name) and
 * reads (in any template, or a variable's `valueFromGlobal`). A target that is itself a
 * template can't be known before the run: that only marks the workflow as dynamic.
 */
export function workflowGlobals(source: unknown): SourceGlobals {
  const data = parseJson(source);
  const reads = new Set<string>();
  const writes = new Set<string>();
  let dynamic = false;
  const target = (value: unknown) => {
    if (typeof value !== 'string') return;
    const m = value.trim().match(GLOBAL_TARGET);
    if (m) writes.add(m[1]);
    else if (value.includes('_global')) dynamic = true;
  };
  const walk = (node: any, skip?: Set<string>) => {
    if (typeof node === 'string') {
      if (scanTemplates(node, reads)) dynamic = true;
      return;
    }
    if (Array.isArray(node)) return node.forEach((n) => walk(n));
    if (!node || typeof node !== 'object') return;
    const isStep = typeof node.group === 'string';
    if (isStep) {
      target(node.destination);
      if (node.group === 'variable' && node.name === 'set') target(node.params?.name);
    }
    if (typeof node.valueFromGlobal === 'string' && node.valueFromGlobal.trim()) {
      reads.add(node.valueFromGlobal.trim().replace(/^_global\./, ''));
    }
    for (const [k, v] of Object.entries(node)) {
      if (skip?.has(k)) continue;
      if (isStep && k === 'destination') continue;
      // A step's notes are text for people, never run as a template.
      if (isStep && k === 'description') continue;
      if (isStep && k === 'params' && node.group === 'variable' && node.name === 'set' && v && typeof v === 'object') {
        walk(v, new Set(['name']));
        continue;
      }
      walk(v);
    }
  };
  // Only what runs: the workflow's own description (help text that may show
  // `{{ _global.name }}` as an example) and its variables' descriptions are not read.
  const pipeline = data?.pipeline;
  if (pipeline && typeof pipeline === 'object') {
    const variables = Array.isArray(pipeline.variables) ? pipeline.variables : [];
    variables.forEach((v: unknown) => walk(v, new Set(['description'])));
    for (const [k, v] of Object.entries(pipeline)) if (k !== 'variables') walk(v);
  }
  return { reads: [...reads], writes: [...writes], dynamic };
}

/** A workflow's inputs (public, typed in) and outputs (`output: true`), by name. */
export function workflowFields(source: unknown): { inputs: string[]; outputs: string[]; helper: boolean } {
  const data = parseJson(source);
  const variables: any[] = Array.isArray(data?.pipeline?.variables) ? data.pipeline.variables : [];
  const inputs: string[] = [];
  const outputs: string[] = [];
  for (const v of variables) {
    if (!v || typeof v.name !== 'string') continue;
    if (v.output === true) outputs.push(v.name);
    else if (v.visibility === 'public' && !v.valueFromGlobal && !v.valueFromEnv && !v.valueFromEnvFile) inputs.push(v.name);
  }
  return { inputs, outputs, helper: data?.helper === true };
}

function scheduleTiming(row: any): string {
  try {
    if (row.cron) return describeCron(row.cron);
    if (row.every_seconds) return describeInterval(Number(row.every_seconds));
    if (row.run_at) return new Date(row.run_at).toLocaleString();
  } catch {
    // Falls through to whatever the row has.
  }
  return row.cron ?? String(row.run_at ?? '');
}

/**
 * A stored time as ISO. SQLite's own timestamps ("2026-11-07 10:00:00") are UTC without
 * saying so; times saved from JavaScript are ISO strings or milliseconds.
 */
export function isoTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const sqlite = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const ms = /^\d+$/.test(text) ? Number(text) : Date.parse(sqlite);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const projectRef = (row: any): MapProjectRef | null =>
  row.project_identifier
    ? { identifier: row.project_identifier, name: row.project_name, color: row.project_color ?? null }
    : null;

export class ProjectMapService {
  /** Everything, connected: each workflow, app, used global and schedule. */
  private static async fullMap(): Promise<LiveMap> {
    const knex = ProjectModel.knex();
    const projectCols = [
      'project.identifier as project_identifier',
      'project.name as project_name',
      'project.color as project_color',
    ];
    const [tasks, apps, schedules, globalRows] = await Promise.all([
      knex('task')
        .leftJoin('project', 'project.id', 'task.project_id')
        .select(
          'task.id',
          'task.identifier',
          'task.name',
          'task.description',
          'task.source',
          'task.metadata',
          'task.created_at',
          ...projectCols
        )
        .orderBy('task.name'),
      knex('app')
        .leftJoin('project', 'project.id', 'app.project_id')
        .select('app.identifier', 'app.name', 'app.description', 'app.source', ...projectCols)
        .orderBy('app.name'),
      knex('schedule')
        .join('task', 'task.id', 'schedule.task_id')
        .select(
          'schedule.identifier',
          'schedule.cron',
          'schedule.run_at',
          'schedule.every_seconds',
          'schedule.enabled',
          'task.identifier as task_identifier'
        )
        .orderBy('schedule.id'),
      knex('global_variable').select('name', 'description'),
    ]);

    // When each workflow last changed (its newest saved version) and last ran successfully.
    // Run ids grow with time, so the newest run is the highest id.
    const [revisions, successes] = await Promise.all([
      knex('task_revision').select('task_id').max('created_at as at').groupBy('task_id'),
      knex('pipeline')
        .whereIn('id', knex('pipeline').where({ status: 'completed' }).max('id').groupBy('task_id'))
        .select('task_id', 'finished_at', 'started_at'),
    ]);
    const changedAt = new Map<number, string | null>(revisions.map((r: any) => [r.task_id, isoTime(r.at)]));
    const succeededAt = new Map<number, string | null>(
      successes.map((r: any) => [r.task_id, isoTime(r.finished_at) ?? isoTime(r.started_at)])
    );

    const nodes: LiveMapNode[] = [];
    const edges: LiveMapEdge[] = [];
    const taskIds = new Set(tasks.map((t: any) => t.identifier));
    const usedGlobals = new Set<string>();

    for (const t of tasks as any[]) {
      const fields = workflowFields(t.source);
      const globals = workflowGlobals(t.source);
      const key = `task:${t.identifier}`;
      nodes.push({
        key,
        kind: fields.helper ? 'helper' : 'workflow',
        name: t.name,
        ref: t.identifier,
        description: t.description ?? null,
        project: projectRef(t),
        inputs: fields.inputs,
        outputs: fields.outputs,
        dynamicGlobals: globals.dynamic,
        draft: isDraft(t),
        changedAt: changedAt.get(t.id) ?? isoTime(t.created_at),
        lastSuccessAt: succeededAt.get(t.id) ?? null,
      });
      for (const called of calledWorkflowIdentifiers(parseJson(t.source))) {
        if (called !== t.identifier && taskIds.has(called)) edges.push({ from: key, to: `task:${called}`, kind: 'calls' });
      }
      for (const g of globals.writes) {
        usedGlobals.add(g);
        edges.push({ from: key, to: `global:${g}`, kind: 'writes' });
      }
      for (const g of globals.reads) {
        if (globals.writes.includes(g)) continue; // A workflow that sets it is its writer, not a reader.
        usedGlobals.add(g);
        edges.push({ from: key, to: `global:${g}`, kind: 'reads' });
      }
    }

    for (const a of apps as any[]) {
      const key = `app:${a.identifier}`;
      nodes.push({ key, kind: 'app', name: a.name, ref: a.identifier, description: a.description ?? null, project: projectRef(a) });
      for (const id of appWorkflowIdentifiers(a.source)) {
        if (taskIds.has(id)) edges.push({ from: key, to: `task:${id}`, kind: 'runs' });
      }
      const reads = new Set<string>();
      if (typeof a.source === 'string') scanTemplates(a.source, reads);
      for (const g of reads) {
        usedGlobals.add(g);
        edges.push({ from: key, to: `global:${g}`, kind: 'reads' });
      }
    }

    const known = new Map((globalRows as any[]).map((g) => [g.name, g]));
    for (const name of usedGlobals) {
      nodes.push({
        key: `global:${name}`,
        kind: 'global',
        name,
        ref: name,
        description: known.get(name)?.description ?? null,
        project: null,
        missing: !known.has(name),
      });
    }

    for (const s of schedules as any[]) {
      const key = `schedule:${s.identifier}`;
      const timing = scheduleTiming(s);
      nodes.push({ key, kind: 'schedule', name: timing, ref: s.identifier, project: null, timing, enabled: !!s.enabled });
      edges.push({ from: key, to: `task:${s.task_identifier}`, kind: 'triggers' });
    }

    return { nodes, edges };
  }

  /**
   * The live map of one project: its workflows and apps, plus what they touch one line
   * away (workflows and apps of other projects, globals, schedules). With no project,
   * everything.
   */
  static async live(projectIdentifier: string | null, linked: string[] = []): Promise<LiveMap> {
    const full = await this.fullMap();
    if (!projectIdentifier) return full;
    const own = new Set(
      full.nodes
        .filter((n) => (n.kind !== 'global' && n.kind !== 'schedule' ? n.project?.identifier === projectIdentifier : false))
        .map((n) => n.key)
    );
    // What the plan's nodes were linked to belongs on this map, wherever it lives.
    for (const key of linked) if (full.nodes.some((n) => n.key === key)) own.add(key);
    // A global nobody uses yet isn't in the full map: a linked one still shows.
    for (const key of linked) {
      if (!key.startsWith('global:') || full.nodes.some((n) => n.key === key)) continue;
      const name = key.slice('global:'.length);
      const row = await ProjectModel.knex()('global_variable').where({ name }).first('name', 'description');
      if (row) {
        full.nodes.push({ key, kind: 'global', name, ref: name, description: row.description ?? null, project: null });
        own.add(key);
      }
    }
    const included = new Set(own);
    for (const e of full.edges) {
      if (own.has(e.from)) included.add(e.to);
      if (own.has(e.to)) included.add(e.from);
    }
    const nodes = full.nodes
      .filter((n) => included.has(n.key))
      .map((n) =>
        (own.has(n.key) && n.project?.identifier === projectIdentifier) || n.kind === 'global' || n.kind === 'schedule'
          ? n
          : { ...n, external: true }
      );
    // Lines between two borrowed things aren't this project's business.
    const edges = full.edges.filter(
      (e) => included.has(e.from) && included.has(e.to) && (own.has(e.from) || own.has(e.to))
    );
    return { nodes, edges };
  }

  /**
   * Everything a planned node could be linked to: every workflow, app, global and
   * schedule in Tipeline, not only what's on this project's map.
   */
  static async linkCandidates(): Promise<{ key: string; kind: LiveMapNode['kind']; name: string; project: string | null }[]> {
    const knex = ProjectModel.knex();
    const [tasks, apps, globals, schedules] = await Promise.all([
      knex('task').leftJoin('project', 'project.id', 'task.project_id').select('task.identifier', 'task.name', 'task.source', 'project.name as project'),
      knex('app').leftJoin('project', 'project.id', 'app.project_id').select('app.identifier', 'app.name', 'project.name as project'),
      knex('global_variable').select('name'),
      knex('schedule')
        .join('task', 'task.id', 'schedule.task_id')
        .select('schedule.identifier', 'schedule.cron', 'schedule.run_at', 'schedule.every_seconds', 'task.name as task_name'),
    ]);
    return [
      ...tasks.map((t: any) => ({
        key: `task:${t.identifier}`,
        kind: (workflowFields(t.source).helper ? 'helper' : 'workflow') as LiveMapNode['kind'],
        name: t.name,
        project: t.project ?? null,
      })),
      ...apps.map((a: any) => ({ key: `app:${a.identifier}`, kind: 'app' as const, name: a.name, project: a.project ?? null })),
      ...globals.map((g: any) => ({ key: `global:${g.name}`, kind: 'global' as const, name: g.name, project: null })),
      ...schedules.map((s: any) => ({
        key: `schedule:${s.identifier}`,
        kind: 'schedule' as const,
        name: `${scheduleTiming(s)} · ${s.task_name}`,
        project: null,
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }

  private static async projectId(identifier: string): Promise<number> {
    const row = await ProjectModel.knex()('project').where({ identifier }).first('id');
    if (!row) throw new Error(`Project not found: ${identifier}`);
    return row.id;
  }

  static async getPlan(projectIdentifier: string): Promise<ProjectMapPlan> {
    const id = await this.projectId(projectIdentifier);
    const row = await ProjectModel.knex()('project_map').where({ project_id: id }).first('data');
    return parsePlan(row?.data);
  }

  /** Every project's plan, by project identifier: for the map of all projects. */
  static async allPlans(): Promise<Record<string, ProjectMapPlan>> {
    const rows: any[] = await ProjectModel.knex()('project_map')
      .join('project', 'project.id', 'project_map.project_id')
      .select('project.identifier', 'project_map.data');
    return Object.fromEntries(rows.map((r) => [r.identifier, parsePlan(r.data)]));
  }

  static async savePlan(projectIdentifier: string, plan: unknown): Promise<ProjectMapPlan> {
    const parsed = projectMapPlanSchema.safeParse(plan);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`Invalid map: ${issue.path.join('.') || 'plan'} ${issue.message}`);
    }
    const data = parsed.data;
    const planIds = new Set(data.nodes.map((n) => n.id));
    if (planIds.size !== data.nodes.length) throw new Error('Invalid map: two planned nodes share an id');
    // Lines to planned nodes that were removed go with them.
    data.edges = data.edges.filter(
      (e) => [e.from, e.to].every((end) => !end.startsWith('plan:') || planIds.has(end.slice(5)))
    );
    const id = await this.projectId(projectIdentifier);
    const knex = ProjectModel.knex();
    const json = JSON.stringify(data);
    const existing = await knex('project_map').where({ project_id: id }).first('id');
    if (existing) await knex('project_map').where({ id: existing.id }).update({ data: json, updated_at: knex.fn.now() });
    else await knex('project_map').insert({ project_id: id, data: json });
    return data;
  }

  /** Links a planned node to the live node it became (a drafted workflow, say). */
  static async link(projectIdentifier: string, nodeId: string, key: string): Promise<ProjectMapPlan> {
    const plan = await this.getPlan(projectIdentifier);
    const node = plan.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Planned node not found: ${nodeId}`);
    node.link = key;
    return await this.savePlan(projectIdentifier, plan);
  }
}
