import { Project as ProjectModel } from '@/database/models/Project';
import { Task as TaskModel } from '@/database/models/Task';
import { App as AppModel } from '@/database/models/App';
import { TrashService } from '@/database/services/TrashService';
import { WorkflowUsageService, type WorkflowUsage } from '@/database/services/WorkflowUsageService';
import { generateIdentifier } from '@tipeline/utils';

type CreateProjectData = {
  name: string;
  description?: string;
  color?: string;
  instructions?: string;
};

/** The workflows and apps to delete along with a project; everything else is kept. */
export type ProjectDeleteContents = { workflows?: string[]; apps?: string[] };

export type ProjectDeletePreview = {
  identifier: string;
  name: string;
  /** Each with everything that uses it, inside the project or not. */
  workflows: ({ identifier: string; name: string } & WorkflowUsage)[];
  apps: { identifier: string; name: string }[];
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
        knex.raw(`(SELECT COUNT(*) FROM task WHERE task.project_id = project.id) as task_count`),
        knex.raw(`(SELECT COUNT(*) FROM app WHERE app.project_id = project.id) as app_count`)
      )
      .orderBy('created_at', 'desc');
  }

  static async getByIdentifier(identifier: string) {
    return await ProjectModel.query()
      .findOne({ identifier })
      .withGraphFetched('[tasks(selectTaskCols), apps(selectAppCols)]')
      .modifiers({
        selectTaskCols: (builder) =>
          builder.select('identifier', 'name', 'description', 'created_at'),
        selectAppCols: (builder) =>
          builder.select('identifier', 'name', 'description', 'created_at'),
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

    const tasks = await TaskModel.query()
      .where({ project_id: project.id })
      .select('identifier', 'name')
      .orderBy('name');
    const apps = await AppModel.query()
      .where({ project_id: project.id })
      .select('identifier', 'name')
      .orderBy('name');
    const usage = await WorkflowUsageService.usageOf(tasks.map((t) => t.identifier));

    return {
      identifier: project.identifier,
      name: (project as any).name,
      workflows: tasks.map((t) => ({ identifier: t.identifier, name: t.name, ...usage.get(t.identifier)! })),
      apps: apps.map((a) => ({ identifier: a.identifier, name: (a as any).name })),
    };
  }

  /**
   * Deletes the project. Its workflows and apps are kept (they end up in no project),
   * except the ones named in `contents`, which go to the Trash first. Those are named
   * one by one rather than "everything", so an item added after the preview isn't
   * deleted unseen; naming one that isn't in the project fails before anything changes.
   */
  static async delete(identifier: string, contents: ProjectDeleteContents = {}) {
    const project = await ProjectModel.query().findOne({ identifier });
    if (!project) return null;

    const workflows = [...new Set(contents.workflows ?? [])];
    const apps = [...new Set(contents.apps ?? [])];
    const knex = ProjectModel.knex();
    const own = async (table: 'task' | 'app', ids: string[]) =>
      new Set<string>(
        ids.length ? await knex(table).where({ project_id: project.id }).whereIn('identifier', ids).pluck('identifier') : []
      );
    const ownWorkflows = await own('task', workflows);
    const ownApps = await own('app', apps);
    const strayWorkflow = workflows.find((id) => !ownWorkflows.has(id));
    if (strayWorkflow) throw new Error(`Workflow "${strayWorkflow}" isn't in this project`);
    const strayApp = apps.find((id) => !ownApps.has(id));
    if (strayApp) throw new Error(`App "${strayApp}" isn't in this project`);

    for (const id of workflows) await TrashService.trash('task', id);
    for (const id of apps) await TrashService.trash('app', id);

    await TaskModel.query().patch({ project_id: null }).where({ project_id: project.id });
    await AppModel.query().patch({ project_id: null }).where({ project_id: project.id });
    await ProjectModel.query().delete().where({ identifier });

    return { identifier, workflows, apps };
  }

  static async assignTask(projectIdentifier: string, taskIdentifier: string) {
    const project = await ProjectModel.query().findOne({ identifier: projectIdentifier });
    if (!project) throw new Error(`Project not found: ${projectIdentifier}`);

    const count = await TaskModel.query()
      .patch({ project_id: project.id })
      .where({ identifier: taskIdentifier });

    if (!count) throw new Error(`Workflow not found: ${taskIdentifier}`);
    return TaskModel.query().findOne({ identifier: taskIdentifier });
  }

  static async unassignTask(taskIdentifier: string) {
    const count = await TaskModel.query()
      .patch({ project_id: null })
      .where({ identifier: taskIdentifier });

    if (!count) throw new Error(`Workflow not found: ${taskIdentifier}`);
    return TaskModel.query().findOne({ identifier: taskIdentifier });
  }

  static async assignApp(projectIdentifier: string, appIdentifier: string) {
    const project = await ProjectModel.query().findOne({ identifier: projectIdentifier });
    if (!project) throw new Error(`Project not found: ${projectIdentifier}`);

    const count = await AppModel.query()
      .patch({ project_id: project.id })
      .where({ identifier: appIdentifier });

    if (!count) throw new Error(`App not found: ${appIdentifier}`);
    return AppModel.query().findOne({ identifier: appIdentifier });
  }

  static async unassignApp(appIdentifier: string) {
    const count = await AppModel.query()
      .patch({ project_id: null })
      .where({ identifier: appIdentifier });

    if (!count) throw new Error(`App not found: ${appIdentifier}`);
    return AppModel.query().findOne({ identifier: appIdentifier });
  }
}
