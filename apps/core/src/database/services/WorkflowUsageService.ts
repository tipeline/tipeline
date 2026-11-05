import { App as AppModel } from '@/database/models/App';
import { coreValidations } from '@tipeline/schemas';

type ProjectRef = {
  project_identifier: string | null;
  project_name: string | null;
  project_color: string | null;
};

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
 * can't go stale. A workflow keeps one project; this is how a project sees the
 * workflows its apps borrow from elsewhere.
 */
export class WorkflowUsageService {
  private static async appRefs(): Promise<AppRef[]> {
    const knex = AppModel.knex();
    const rows: any[] = await knex('app')
      .leftJoin('project', 'project.id', 'app.project_id')
      .select(
        'app.identifier',
        'app.name',
        'app.source',
        'project.identifier as project_identifier',
        'project.name as project_name',
        'project.color as project_color'
      )
      .orderBy('app.name');
    return rows.map(({ source, ...app }) => ({ ...app, workflows: appWorkflowIdentifiers(source) }));
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
      .leftJoin('project', 'project.id', 'task.project_id')
      .whereNot('task.identifier', taskIdentifier)
      // A cheap pre-filter; the walk below decides.
      .where('task.source', 'like', `%${taskIdentifier}%`)
      .select(
        'task.identifier',
        'task.name',
        'task.source',
        'project.identifier as project_identifier',
        'project.name as project_name',
        'project.color as project_color'
      )
      .orderBy('task.name');
    return rows
      .filter((row) => calledWorkflowIdentifiers(row.source).includes(taskIdentifier))
      .map(({ source: _source, ...task }) => task);
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
      .leftJoin('project', 'project.id', 'task.project_id')
      .select(
        'task.identifier',
        'task.name',
        'task.source',
        'project.identifier as project_identifier',
        'project.name as project_name',
        'project.color as project_color'
      )
      .orderBy('task.name');
    for (const { source, ...task } of tasks) {
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
   * Workflows the project's apps use that live outside it — in another project or in
   * none — each with the project it lives in and the apps here that use it.
   */
  static async sharedIntoProject(projectIdentifier: string): Promise<SharedWorkflow[]> {
    const usedHere = new Map<string, { identifier: string; name: string }[]>();
    for (const app of await this.appRefs()) {
      if (app.project_identifier !== projectIdentifier) continue;
      for (const id of app.workflows) {
        const apps = usedHere.get(id) ?? [];
        apps.push({ identifier: app.identifier, name: app.name });
        usedHere.set(id, apps);
      }
    }
    if (!usedHere.size) return [];

    const knex = AppModel.knex();
    const tasks: any[] = await knex('task')
      .leftJoin('project', 'project.id', 'task.project_id')
      .whereIn('task.identifier', [...usedHere.keys()])
      .where((q) => q.whereNull('project.identifier').orWhereNot('project.identifier', projectIdentifier))
      .select(
        'task.identifier',
        'task.name',
        'task.description',
        'project.identifier as project_identifier',
        'project.name as project_name',
        'project.color as project_color'
      )
      .orderBy('task.name');
    return tasks.map((task) => ({ ...task, apps: usedHere.get(task.identifier) ?? [] }));
  }
}
