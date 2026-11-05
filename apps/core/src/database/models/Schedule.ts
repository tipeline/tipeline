import { Model } from 'objection';
import { Task } from '@database/models/Task.js';

export class Schedule extends Model {
  id!: number;
  identifier!: string;
  task_id!: number;
  /** Null for a one-time schedule, which has `run_at` instead. */
  cron!: string | null;
  /** When a one-time schedule runs; null for a repeating one. */
  run_at?: string | null;
  /** Repeats every this many seconds; null unless it's an interval schedule. */
  every_seconds?: number | null;
  variables!: string;
  enabled!: boolean;
  last_run_at?: Date;
  created_at!: Date;
  updated_at!: Date;

  task?: Task;

  static get tableName() {
    return 'schedule';
  }

  static get relationMappings() {
    return {
      task: {
        relation: Model.BelongsToOneRelation,
        modelClass: Task,
        join: { from: 'schedule.task_id', to: 'task.id' },
      },
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['task_id'],
      properties: {
        id: { type: 'integer' },
        identifier: { type: 'string' },
        task_id: { type: 'integer' },
        cron: { type: ['string', 'null'] },
        run_at: { type: ['string', 'null'] },
        every_seconds: { type: ['integer', 'null'] },
        variables: { type: 'string' },
        enabled: { type: 'boolean' },
        last_run_at: { type: ['string', 'null'], format: 'date-time' },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    };
  }
}
