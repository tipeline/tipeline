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
      tasks: {
        relation: Model.HasManyRelation,
        modelClass: Task,
        join: { from: 'project.id', to: 'task.project_id' },
      },
      apps: {
        relation: Model.HasManyRelation,
        modelClass: App,
        join: { from: 'project.id', to: 'app.project_id' },
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
