import { App as AppModel } from '@/database/models/App';
import { coreValidations } from '@tipeline/schemas';
import { parseProjects, projectsSubquery, type ProjectTag } from '@/database/services/ProjectMembership';
import type { AppComponentRef, AppComponentUse, AppUseWay } from '@tipeline/utils';

/** Every project the app or workflow is in (none, one or several). */
type ProjectRef = { projects: ProjectTag[] };

type AppRef = ProjectRef & {
  identifier: string;
  name: string;
  workflows: string[];
};

export type WorkflowUser = ProjectRef & { identifier: string; name: string };

/** A schedule that runs the workflow. */
export type WorkflowSchedule = {
  identifier: string;
  cron: string | null;
  run_at: string | null;
  every_seconds: number | null;
  enabled: boolean;
};

export type WorkflowUsage = {
  apps: WorkflowUser[];
  /** Workflows that run it as a sub-workflow. */
  workflows: WorkflowUser[];
  schedules: WorkflowSchedule[];
};

/** A workflow the project's apps use that isn't in the project itself. */
export type SharedWorkflow = ProjectRef & {
  identifier: string;
  name: string;
  description: string | null;
  /** This project's apps that use the workflow. */
  apps: { identifier: string; name: string }[];
};

/**
 * The workflow identifiers an app declares in its `workflows:` map. Lenient on purpose:
 * a usage list shouldn't fail because one app's source is broken, so anything that
 * can't be read counts as using nothing. A v1 source (no map yet) is migrated first.
 */
export function appWorkflowIdentifiers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let data: any;
  try {
    data = JSON.parse(raw);
    if (data && typeof data === 'object' && data.schemaVersion === undefined) {
      data = coreValidations.appObject.migrateAppSourceV1(data);
    }
  } catch {
    return [];
  }
  const map = data?.workflows;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
  const ids = Object.values(map)
    .map((ref: any) => ref?.identifier)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

/** An app source as data, migrated to the current schema version as far as that works. */
function readAppSource(raw: unknown): any {
  let data: any = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const app = coreValidations.appObject;
  try {
    if (data.schemaVersion === undefined) data = app.migrateAppSourceV1(data);
    if (data.schemaVersion === 2) data = app.migrateAppSourceV2(data);
    if (data.schemaVersion === 3) data = app.migrateAppSourceV3(data);
  } catch {
    return null;
  }
  return data;
}

const RUNNABLE_REF = /\brunnables\.([A-Za-z][A-Za-z0-9_]*)/g;

/** The label of the row action, bulk action or button an `action:<id>` / `bulk:<id>` event belongs to. */
function eventLabel(component: any, event: string): string | undefined {
  const m = event.match(/^(action|bulk):(.+)$/);
  if (!m) return undefined;
  const props = component?.props ?? {};
  const list: any[] = m[1] === 'bulk' ? props.bulkActions : (props.rowActions ?? props.items);
  const found = Array.isArray(list) ? list.find((a) => a?.id === m[2]) : undefined;
  return typeof found?.label === 'string' ? found.label : undefined;
}

/**
 * Which components of an app use each workflow, and how, by workflow identifier. A
 * component shows a workflow when one of its settings reads a runnable of it
 * (`runnables.<name>…`, or a chat's or console's `runnable`, or a runs list's
 * `workflows`), and runs it when one of its events has a `run` action for it. A runnable
 * no component uses is listed under its page (`pageLoad` when the page runs it on opening).
 * Lenient like the rest: a source that can't be read uses nothing.
 */
export function appWorkflowUses(raw: unknown): {
  uses: Map<string, AppComponentUse[]>;
  pageCount: number;
  components: AppComponentRef[];
} {
  const uses = new Map<string, AppComponentUse[]>();
  const components: AppComponentRef[] = [];
  const data = readAppSource(raw);
  const aliases: Record<string, any> = data?.workflows && typeof data.workflows === 'object' ? data.workflows : {};
  const identifierOf = (alias: unknown) => (typeof alias === 'string' ? aliases[alias]?.identifier : undefined);
  const pages: any[] = Array.isArray(data?.pages) ? data.pages : [];
  const add = (identifier: string | undefined, use: AppComponentUse) => {
    if (typeof identifier !== 'string' || !identifier) return;
    uses.set(identifier, [...(uses.get(identifier) ?? []), use]);
  };

  for (const page of pages) {
    if (!page || typeof page !== 'object') continue;
    const pageId = String(page.id ?? '');
    const pageName = String(page.name ?? pageId);
    const runnables: Record<string, any> = page.runnables && typeof page.runnables === 'object' ? page.runnables : {};
    const workflowOf = (name: string) => identifierOf(runnables[name]?.workflow);
    const usedRunnables = new Set<string>();

    for (const c of Array.isArray(page.components) ? page.components : []) {
      if (!c || typeof c !== 'object' || typeof c.id !== 'string') continue;
      components.push({ pageId, page: pageName, id: c.id, name: String(c.name ?? c.id), type: String(c.type ?? '') });
      // Runnable name → how this component uses it.
      const ways = new Map<string, AppUseWay[]>();
      const addWay = (runnable: string, way: AppUseWay) => {
        if (!runnables[runnable]) return;
        usedRunnables.add(runnable);
        const list = ways.get(runnable) ?? [];
        const same = list.some((w) => w.kind === way.kind && (w.kind !== 'event' || (way.kind === 'event' && w.event === way.event)));
        if (!same) list.push(way);
        ways.set(runnable, list);
      };
      const props = c.props && typeof c.props === 'object' ? c.props : {};
      for (const m of JSON.stringify(props).matchAll(RUNNABLE_REF)) addWay(m[1], { kind: 'shows' });
      if (typeof props.runnable === 'string') {
        addWay(props.runnable, c.type === 'chat' ? { kind: 'event', event: 'send' } : { kind: 'shows' });
      }
      for (const [event, actions] of Object.entries(c.events && typeof c.events === 'object' ? c.events : {})) {
        for (const action of Array.isArray(actions) ? actions : []) {
          if (action?.type === 'run' && typeof action.runnable === 'string') {
            const label = eventLabel(c, event);
            addWay(action.runnable, { kind: 'event', event, ...(label ? { label } : {}) });
          }
        }
      }
      // Grouped by workflow: two runnables of the same workflow are one use.
      const byWorkflow = new Map<string, AppUseWay[]>();
      for (const [runnable, list] of ways) {
        const id = workflowOf(runnable);
        if (!id) continue;
        const merged = byWorkflow.get(id) ?? [];
        for (const w of list) {
          if (!merged.some((x) => JSON.stringify(x) === JSON.stringify(w))) merged.push(w);
        }
        byWorkflow.set(id, merged);
      }
      // A runs list or approvals component names workflow aliases directly.
      for (const a of Array.isArray(props.workflows) ? props.workflows : []) {
        const id = identifierOf(a);
        if (id && !byWorkflow.has(id)) byWorkflow.set(id, [{ kind: 'shows' }]);
      }
      for (const [id, list] of byWorkflow) {
        add(id, { pageId, page: pageName, componentId: c.id, component: String(c.name ?? c.id), type: String(c.type ?? ''), ways: list });
      }
    }

    // Runnables no component uses: the page runs them on opening, or something else does.
    const onLoad = new Set<string>(
      (Array.isArray(page.events?.load) ? page.events.load : [])
        .filter((a: any) => a?.type === 'run' && typeof a.runnable === 'string')
        .map((a: any) => a.runnable)
    );
    const pageWays = new Map<string, AppUseWay>();
    for (const [name, r] of Object.entries(runnables)) {
      if (usedRunnables.has(name)) continue;
      const id = workflowOf(name);
      if (!id) continue;
      // History runnables load by default.
      const loads = onLoad.has(name) || (r?.trigger ?? (r?.mode === 'history' ? 'load' : 'manual')) === 'load';
      if (pageWays.get(id)?.kind !== 'pageLoad') pageWays.set(id, loads ? { kind: 'pageLoad' } : { kind: 'other' });
    }
    for (const [id, way] of pageWays) {
      // Already used by a component on this page: that says enough.
      if ((uses.get(id) ?? []).some((u) => u.pageId === pageId)) continue;
      add(id, { pageId, page: pageName, ways: [way] });
    }
  }
  return { uses, pageCount: pages.length, components };
}

/**
 * The workflows a workflow source runs as sub-workflows (`subtask` steps by identifier,
 * at any depth, once each). Same leniency as apps: a broken source calls nothing, and a
 * templated identifier can't be known up front, so it's left out.
 */
export function calledWorkflowIdentifiers(source: unknown): string[] {
  let data = source;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const ids = new Set<string>();
  const walk = (node: any) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const id = node.group === 'subtask' ? node.params?.identifier : undefined;
    if (typeof id === 'string' && id.trim() && !/\{\{|\{=/.test(id)) ids.add(id.trim());
    Object.values(node).forEach(walk);
  };
  walk(data);
  return [...ids];
}

const toSchedule = (row: any): WorkflowSchedule => ({
  identifier: row.identifier,
  cron: row.cron ?? null,
  run_at: row.run_at ?? null,
  every_seconds: row.every_seconds ?? null,
  enabled: Boolean(row.enabled),
});

/**
 * Which apps use which workflows — read from the apps' sources, never stored, so it
 * can't go stale. Also how a project sees the workflows its apps use that aren't in it.
 */
export class WorkflowUsageService {
  private static async appRefs(): Promise<AppRef[]> {
    const knex = AppModel.knex();
    const rows: any[] = await knex('app')
      .select('app.identifier', 'app.name', 'app.source', knex.raw(projectsSubquery('app')))
      .orderBy('app.name');
    return rows.map(({ source, projects, ...app }) => ({
      ...app,
      projects: parseProjects(projects),
      workflows: appWorkflowIdentifiers(source),
    }));
  }

  /** The apps that use a workflow, with each app's project. */
  static async usedBy(taskIdentifier: string): Promise<WorkflowUser[]> {
    return (await this.appRefs())
      .filter((app) => app.workflows.includes(taskIdentifier))
      .map(({ workflows: _workflows, ...app }) => app);
  }

  /** The workflows that run a workflow as a sub-workflow, with each one's project. */
  static async calledBy(taskIdentifier: string): Promise<WorkflowUser[]> {
    const knex = AppModel.knex();
    const rows: any[] = await knex('task')
      .whereNot('task.identifier', taskIdentifier)
      // A cheap pre-filter; the walk below decides.
      .where('task.source', 'like', `%${taskIdentifier}%`)
      .select('task.identifier', 'task.name', 'task.source', knex.raw(projectsSubquery('task')))
      .orderBy('task.name');
    return rows
      .filter((row) => calledWorkflowIdentifiers(row.source).includes(taskIdentifier))
      .map(({ source: _source, projects, ...task }) => ({ ...task, projects: parseProjects(projects) }));
  }

  /**
   * Usage for several workflows at once — every app and workflow source is read once.
   * Used to preview deleting a project.
   */
  static async usageOf(taskIdentifiers: string[]): Promise<Map<string, WorkflowUsage>> {
    const result = new Map<string, WorkflowUsage>(
      taskIdentifiers.map((id) => [id, { apps: [], workflows: [], schedules: [] }])
    );
    if (!result.size) return result;

    for (const { workflows, ...app } of await this.appRefs()) {
      for (const id of workflows) result.get(id)?.apps.push(app);
    }

    const knex = AppModel.knex();
    const tasks: any[] = await knex('task')
      .select('task.identifier', 'task.name', 'task.source', knex.raw(projectsSubquery('task')))
      .orderBy('task.name');
    for (const { source, projects, ...row } of tasks) {
      const task = { ...row, projects: parseProjects(projects) };
      for (const id of calledWorkflowIdentifiers(source)) {
        if (id !== task.identifier) result.get(id)?.workflows.push(task);
      }
    }

    const schedules: any[] = await knex('schedule')
      .join('task', 'task.id', 'schedule.task_id')
      .whereIn('task.identifier', taskIdentifiers)
      .select(
        'task.identifier as task_identifier',
        'schedule.identifier',
        'schedule.cron',
        'schedule.run_at',
        'schedule.every_seconds',
        'schedule.enabled'
      )
      .orderBy('schedule.id');
    for (const { task_identifier, ...row } of schedules) {
      result.get(task_identifier)?.schedules.push(toSchedule(row));
    }
    return result;
  }

  /** The schedules that run a workflow. */
  static async schedules(taskIdentifier: string): Promise<WorkflowSchedule[]> {
    const knex = AppModel.knex();
    const rows: any[] = await knex('schedule')
      .join('task', 'task.id', 'schedule.task_id')
      .where('task.identifier', taskIdentifier)
      .select('schedule.identifier', 'schedule.cron', 'schedule.run_at', 'schedule.every_seconds', 'schedule.enabled')
      .orderBy('schedule.id');
    return rows.map(toSchedule);
  }

  /** Everything that would be affected if the workflow went away. */
  static async usage(taskIdentifier: string): Promise<WorkflowUsage> {
    const [apps, workflows, schedules] = await Promise.all([
      this.usedBy(taskIdentifier),
      this.calledBy(taskIdentifier),
      this.schedules(taskIdentifier),
    ]);
    return { apps, workflows, schedules };
  }

  /**
   * Workflows the project's apps use that aren't in the project — in other projects or in
   * none — each with the projects it's in and the apps here that use it.
   */
  static async sharedIntoProject(projectIdentifier: string): Promise<SharedWorkflow[]> {
    const usedHere = new Map<string, { identifier: string; name: string }[]>();
    for (const app of await this.appRefs()) {
      if (!app.projects.some((p) => p.identifier === projectIdentifier)) continue;
      for (const id of app.workflows) {
        const apps = usedHere.get(id) ?? [];
        apps.push({ identifier: app.identifier, name: app.name });
        usedHere.set(id, apps);
      }
    }
    if (!usedHere.size) return [];

    const knex = AppModel.knex();
    const tasks: any[] = await knex('task')
      .whereIn('task.identifier', [...usedHere.keys()])
      .select('task.identifier', 'task.name', 'task.description', knex.raw(projectsSubquery('task')))
      .orderBy('task.name');
    return tasks
      .map(({ projects, ...task }) => ({ ...task, projects: parseProjects(projects), apps: usedHere.get(task.identifier) ?? [] }))
      .filter((task) => !task.projects.some((p: ProjectTag) => p.identifier === projectIdentifier));
  }
}
