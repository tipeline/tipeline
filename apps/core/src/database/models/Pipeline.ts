import { Model } from 'objection';
import { Task } from './Task';
import { PipelineAction } from './PipelineAction';

export class Pipeline extends Model {
  id!: number;
  identifier!: string;
  task_id!: number;
  status!: 'pending' | 'running' | 'failed' | 'completed' | 'canceled' | 'paused';
  metadata?: Record<string, any>;
  source!: string;
  started_at!: string;
  finished_at?: string;

  // Virtual properties for relations
  task?: Task;
  actions?: PipelineAction[];

  static get tableName() {
    return 'pipeline';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['task_id', 'status'],
      properties: {
        id: { type: 'integer' },
        identifier: { type: 'string' },
        task_id: { type: 'integer' },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'failed', 'completed', 'canceled', 'paused'],
        },
        metadata: { type: ['object', 'null'] },
        source: { type: 'string' },
        started_at: { type: 'string', format: 'date-time' },
        finished_at: { type: ['string', 'null'], format: 'date-time' },
      },
    };
  }

  static get relationMappings() {
    return {
      task: {
        relation: Model.BelongsToOneRelation,
        modelClass: Task,
        join: {
          from: 'pipeline.task_id',
          to: 'task.id',
        },
      },
      actions: {
        relation: Model.HasManyRelation,
        modelClass: PipelineAction,
        join: {
          from: 'pipeline.id',
          to: 'pipeline_action.pipeline_id',
        },
      },
    };
  }

  // Helper methods for common queries
  async getExecutedActions() {
    return await PipelineAction.query()
      .where('pipeline_id', this.id)
      .whereNot('status', 'pending')
      .orderBy('started_at', 'asc');
  }

  async getLastExecutedAction() {
    return await PipelineAction.query()
      .where('pipeline_id', this.id)
      .where('status', 'completed')
      .whereNotNull('finished_at')
      .orderBy('finished_at', 'desc')
      .first();
  }

  async getFailedActions() {
    return await PipelineAction.query().where('pipeline_id', this.id).where('status', 'failed');
  }

  async canResume() {
    const hasFailedOrPausedActions = await PipelineAction.query()
      .where('pipeline_id', this.id)
      .whereIn('status', ['failed', 'paused', 'canceled'])
      .first();

    return !!hasFailedOrPausedActions;
  }

  async getActionByIdentifier(identifier: string) {
    return await PipelineAction.query()
      .where('pipeline_id', this.id)
      .where('identifier', identifier)
      .first();
  }

  // Get execution statistics
  async getStatistics() {
    const actions = await PipelineAction.query().where('pipeline_id', this.id);

    const stats = {
      total: actions.length,
      completed: 0,
      failed: 0,
      running: 0,
      pending: 0,
      canceled: 0,
      paused: 0,
    };

    actions.forEach((action) => {
      if (action.status in stats) {
        (stats as any)[action.status]++;
      }
    });

    return stats;
  }
}
