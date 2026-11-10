import { Model } from 'objection';
import { Task } from './Task';
import { App } from './App';

export class Project extends Model {
  id!: number;
  identifier!: string;
  name!: string;
  description?: string;
  color?: string;
  /** Told to the assistant on requests made from inside the project. */
  instructions?: string | null;
  created_at!: Date;
  updated_at!: Date;

  tasks?: Task[];
  apps?: App[];

  static get tableName() {
    return 'project';
  }

  static get relationMappings() {
    return {
      // A workflow or app can be in any number of projects.
      tasks: {
        relation: Model.ManyToManyRelation,
        modelClass: Task,
        join: {
          from: 'project.id',
          through: { from: 'project_task.project_id', to: 'project_task.task_id' },
          to: 'task.id',
        },
      },
      apps: {
        relation: Model.ManyToManyRelation,
        modelClass: App,
        join: {
          from: 'project.id',
          through: { from: 'project_app.project_id', to: 'project_app.app_id' },
          to: 'app.id',
        },
      },
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name'],
      properties: {
        id: { type: 'integer' },
        identifier: { type: 'string' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        color: { type: ['string', 'null'] },
        instructions: { type: ['string', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    };
  }
}
