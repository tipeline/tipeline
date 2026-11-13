import { Project as ProjectModel } from '@/database/models/Project';
import { Task as TaskModel } from '@/database/models/Task';
import { App as AppModel } from '@/database/models/App';
import { TrashService } from '@/database/services/TrashService';
import {
  WorkflowUsageService,
  appWorkflowIdentifiers,
  calledWorkflowIdentifiers,
  type WorkflowUsage,
} from '@/database/services/WorkflowUsageService';
import { generateIdentifier } from '@tipeline/utils';
import { ProjectMembership } from '@/database/services/ProjectMembership';

type CreateProjectData = {
  name: string;
  description?: string;
  color?: string;
  instructions?: string;
};

/** The workflows and apps to delete along with a project; everything else is kept. */
export type ProjectDeleteContents = { workflows?: string[]; apps?: string[] };

/** The other projects an item is also in: deleting this one only takes it out of it. */
type AlsoIn = { alsoIn: { identifier: string; name: string }[] };

export type ProjectDeletePreview = {
  identifier: string;
  name: string;
  /** Each with everything that uses it, inside the project or not. */
  workflows: ({ identifier: string; name: string } & WorkflowUsage & AlsoIn)[];
  apps: ({ identifier: string; name: string } & AlsoIn)[];
};

type UpdateProjectData = {
  name?: string;
  description?: string;
  color?: string;
  instructions?: string | null;
};

export class ProjectService {
  static async create(data: CreateProjectData) {
    return await ProjectModel.query().insert({
      identifier: generateIdentifier(),
      name: data.name,
      description: data.description,
      color: data.color,
      instructions: data.instructions,
    });
  }

  static async getAll() {
    const knex = ProjectModel.knex();
    return await knex('project')
      .select(
        'identifier',
        'name',
        'description',
        'color',
        'created_at',
        knex.raw(`(SELECT COUNT(*) FROM project_task WHERE project_task.project_id = project.id) as task_count`),
        knex.raw(`(SELECT COUNT(*) FROM project_app WHERE project_app.project_id = project.id) as app_count`)
      )
      .orderBy('created_at', 'desc');
  }

  static async getByIdentifier(identifier: string) {
    return await ProjectModel.query()
      .findOne({ identifier })
      .withGraphFetched('[tasks(selectTaskCols), apps(selectAppCols)]')
      .modifiers({
        // Named with their table: the link tables have a created_at of their own.
        selectTaskCols: (builder) =>
          builder.select('task.identifier', 'task.name', 'task.description', 'task.created_at'),
        selectAppCols: (builder) =>
          builder.select('app.identifier', 'app.name', 'app.description', 'app.created_at'),
      });
  }

  static async update(identifier: string, data: UpdateProjectData) {
    const count = await ProjectModel.query().patch(data).where({ identifier });
    if (!count) return null;
    return ProjectModel.query().findOne({ identifier });
  }

  /**
   * What deleting the project could take with it: its workflows, each with everything
   * that uses it, and its apps (nothing else refers to an app). The caller decides what
   * counts as "outside", since that depends on which items end up being deleted.
   */
  static async deletePreview(identifier: string): Promise<ProjectDeletePreview | null> {
    const project = await ProjectModel.query().findOne({ identifier });
    if (!project) return null;

    const tasks = await ProjectService.members('task', project.id);
    const apps = await ProjectService.members('app', project.id);
    const usage = await WorkflowUsageService.usageOf(tasks.map((t) => t.identifier));

    return {
      identifier: project.identifier,
      name: (project as any).name,
      workflows: tasks.map(({ id: _id, ...t }) => ({ ...t, ...usage.get(t.identifier)! })),
      apps: apps.map(({ id: _id, ...a }) => a),
    };
  }

  /** A project's workflows or apps, by name, each with the other projects it's also in. */
  private static async members(kind: 'task' | 'app', projectId: number) {
    const knex = ProjectModel.knex();
    const [table, fk] = kind === 'task' ? ['project_task', 'task_id'] : ['project_app', 'app_id'];
    const rows: { id: number; identifier: string; name: string }[] = await knex(kind)
      .join(`${table} as m`, `m.${fk}`, `${kind}.id`)
      .where('m.project_id', projectId)
      .select(`${kind}.id`, `${kind}.identifier`, `${kind}.name`)
      .orderBy(`${kind}.name`);
    const others: any[] = rows.length
      ? await knex(table)
          .join('project', 'project.id', `${table}.project_id`)
          .whereIn(`${table}.${fk}`, rows.map((r) => r.id))
          .whereNot(`${table}.project_id`, projectId)
          .select(`${table}.${fk} as item_id`, 'project.identifier', 'project.name')
          .orderBy('project.name')
      : [];
    return rows.map((r) => ({
      ...r,
      alsoIn: others.filter((o) => o.item_id === r.id).map((o) => ({ identifier: o.identifier, name: o.name })),
    }));
  }

  /**
   * Deletes the project. Its workflows and apps are kept (out of this project, still in
   * any others), except the ones named in `contents`, which go to the Trash first. Those
   * are named one by one rather than "everything", so an item added after the preview
   * isn't deleted unseen. Naming one that isn't in the project, or that is also in another
   * project (deleting this one only takes it out), fails before anything changes.
   */
  static async delete(identifier: string, contents: ProjectDeleteContents = {}) {
    const project = await ProjectModel.query().findOne({ identifier });
    if (!project) return null;

    const workflows = [...new Set(contents.workflows ?? [])];
    const apps = [...new Set(contents.apps ?? [])];
    const check = async (kind: 'task' | 'app', ids: string[], label: string) => {
      if (!ids.length) return;
      const members = new Map((await ProjectService.members(kind, project.id)).map((m) => [m.identifier, m]));
      for (const id of ids) {
        const member = members.get(id);
        if (!member) throw new Error(`${label} "${id}" isn't in this project`);
        if (member.alsoIn.length) throw new Error(`${label} "${id}" is also in ${member.alsoIn[0].name}, so it's kept`);
      }
    };
    await check('task', workflows, 'Workflow');
    await check('app', apps, 'App');

    for (const id of workflows) await TrashService.trash('task', id);
    for (const id of apps) await TrashService.trash('app', id);

    await ProjectMembership.forgetProject(project.id);
    await ProjectModel.knex()('project_map').where({ project_id: project.id }).delete();
    await ProjectModel.query().delete().where({ identifier });

    return { identifier, workflows, apps };
  }

  private static async projectRow(projectIdentifier: string) {
    const project = await ProjectModel.query().findOne({ identifier: projectIdentifier });
    if (!project) throw new Error(`Project not found: ${projectIdentifier}`);
    return project;
  }

  /** Adds the workflow to the project; it stays in any others it's in. */
  static async assignTask(projectIdentifier: string, taskIdentifier: string) {
    const project = await ProjectService.projectRow(projectIdentifier);
    const task = await TaskModel.query().findOne({ identifier: taskIdentifier });
    if (!task) throw new Error(`Workflow not found: ${taskIdentifier}`);
    await ProjectMembership.add('task', project.id, [task.id]);

    const alsoAdded = await ProjectService.adoptSubWorkflows(project.id, calledWorkflowIdentifiers(task.source));
    const record = await TaskModel.query().findOne({ identifier: taskIdentifier });
    return { ...record, alsoAdded };
  }

  /**
   * The sub-workflows these workflows run, at any depth, that are in no project join
   * `projectId`: installed along with their parent, they belong with it. One that is
   * already in a project is left where it is: adding it here too is the person's call.
   */
  private static async adoptSubWorkflows(
    projectId: number,
    identifiers: string[]
  ): Promise<{ identifier: string; name: string }[]> {
    const adopted: { identifier: string; name: string }[] = [];
    const seen = new Set<string>();
    let queue = identifiers;
    while (queue.length) {
      const fresh = queue.filter((id) => !seen.has(id));
      fresh.forEach((id) => seen.add(id));
      if (!fresh.length) break;
      const rows: any[] = await TaskModel.query().whereIn('identifier', fresh).select('id', 'identifier', 'name', 'source');
      const loose = await ProjectMembership.inNoProject('task', rows.map((r) => r.id));
      const orphans = rows.filter((r) => loose.has(r.id));
      if (orphans.length) {
        await ProjectMembership.add('task', projectId, orphans.map((r) => r.id));
        adopted.push(...orphans.map((r) => ({ identifier: r.identifier, name: r.name })));
      }
      // Only follow the ones that joined: one already placed brings nothing along.
      queue = orphans.flatMap((r) => calledWorkflowIdentifiers(r.source));
    }
    return adopted;
  }

  /** Takes the workflow out of the project; it stays in any others. */
  static async unassignTask(projectIdentifier: string, taskIdentifier: string) {
    const project = await ProjectService.projectRow(projectIdentifier);
    const task = await TaskModel.query().findOne({ identifier: taskIdentifier });
    if (!task) throw new Error(`Workflow not found: ${taskIdentifier}`);
    await ProjectMembership.remove('task', project.id, task.id);
    return task;
  }

  /** Adds the app to the project; it stays in any others it's in. */
  static async assignApp(projectIdentifier: string, appIdentifier: string) {
    const project = await ProjectService.projectRow(projectIdentifier);
    const app = await AppModel.query().findOne({ identifier: appIdentifier });
    if (!app) throw new Error(`App not found: ${appIdentifier}`);
    await ProjectMembership.add('app', project.id, [app.id]);

    // The app's own workflows (and what they run) in no project come with it, like a parent's sub-workflows.
    const alsoAdded = await ProjectService.adoptSubWorkflows(project.id, appWorkflowIdentifiers((app as any).source));
    const record = await AppModel.query().findOne({ identifier: appIdentifier });
    return { ...record, alsoAdded };
  }

  /** Takes the app out of the project; it stays in any others. */
  static async unassignApp(projectIdentifier: string, appIdentifier: string) {
    const project = await ProjectService.projectRow(projectIdentifier);
    const app = await AppModel.query().findOne({ identifier: appIdentifier });
    if (!app) throw new Error(`App not found: ${appIdentifier}`);
    await ProjectMembership.remove('app', project.id, app.id);
    return app;
  }
}
