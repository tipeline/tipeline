import { Model } from 'objection';
import { Pipeline } from './Pipeline';
import { PipelineBlock } from './PipelineBlock';

export class PipelineAction extends Model {
  id!: number;
  pipeline_id!: number;
  block_id!: number;
  position!: number;
  identifier!: string;
  status!: 'pending' | 'running' | 'failed' | 'completed' | 'canceled' | 'paused';
  result?: Record<string, any> | string | null;
  params?: Record<string, any> | string | null;
  error?: string;
  started_at?: string;
  finished_at?: string;
  // Served from the result cache instead of running (see CacheService).
  cached?: boolean | number;

  static get tableName() {
    return 'pipeline_action';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['pipeline_id', 'block_id', 'position', 'identifier', 'status'],
      properties: {
        id: { type: 'integer' },
        pipeline_id: { type: 'integer' },
        block_id: { type: 'integer' },
        position: { type: 'integer' },
        identifier: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'failed', 'completed', 'canceled', 'paused'],
        },
        result: { type: ['string', 'null'] },
        params: { type: ['string', 'null'] },
        error: { type: ['string', 'null'] },
        started_at: { type: ['string', 'null'], format: 'date-time' },
        finished_at: { type: ['string', 'null'], format: 'date-time' },
        cached: { type: ['boolean', 'integer'] },
      },
    };
  }

  static get relationMappings() {
    return {
      pipeline: {
        relation: Model.BelongsToOneRelation,
        modelClass: Pipeline,
        join: {
          from: 'pipeline_action.pipeline_id',
          to: 'pipeline.id',
        },
      },
      block: {
        relation: Model.BelongsToOneRelation,
        modelClass: PipelineBlock,
        join: {
          from: 'pipeline_action.block_id',
          to: 'pipeline_block.id',
        },
      },
    };
  }

  $beforeInsert() {
    if (this.result && typeof this.result !== 'string') {
      this.result = JSON.stringify(this.result);
    }
    if (this.params && typeof this.params !== 'string') {
      this.params = JSON.stringify(this.params);
    }
  }

  $beforeUpdate() {
    if (this.result && typeof this.result !== 'string') {
      this.result = JSON.stringify(this.result);
    }
    if (this.params && typeof this.params !== 'string') {
      this.params = JSON.stringify(this.params);
    }
  }

  $afterFind() {
    if (this.result && typeof this.result === 'string') {
      try {
        this.result = JSON.parse(this.result);
      } catch (_) {
        // ignore if not a valid JSON string
      }
    }
    if (this.params && typeof this.params === 'string') {
      try {
        this.params = JSON.parse(this.params);
      } catch (_) {
        // ignore if not a valid JSON string
      }
    }
  }
}
