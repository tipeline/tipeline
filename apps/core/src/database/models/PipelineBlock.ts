import { Model } from 'objection';
import { Pipeline } from './Pipeline';
import { PipelineAction } from './PipelineAction';

export class PipelineBlock extends Model {
  id!: number;
  pipeline_id!: number;
  parent_block_id?: number | null;
  parent_action_position?: number | null;
  iteration?: number | null;
  metadata?: Record<string, any>;

  static get tableName() {
    return 'pipeline_block';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['pipeline_id'],
      properties: {
        id: { type: 'integer' },
        pipeline_id: { type: 'integer' },
        parent_block_id: { type: ['integer', 'null'] },
        parent_action_position: { type: ['integer', 'null'] },
        iteration: { type: ['integer', 'null'] },
        metadata: { type: ['object', 'null'] },
      },
    };
  }

  static get relationMappings() {
    return {
      pipeline: {
        relation: Model.BelongsToOneRelation,
        modelClass: Pipeline,
        join: {
          from: 'pipeline_block.pipeline_id',
          to: 'pipeline.id',
        },
      },
      parentBlock: {
        relation: Model.BelongsToOneRelation,
        modelClass: PipelineBlock,
        join: {
          from: 'pipeline_block.parent_block_id',
          to: 'pipeline_block.id',
        },
      },
      actions: {
        relation: Model.HasManyRelation,
        modelClass: PipelineAction,
        join: {
          from: 'pipeline_block.id',
          to: 'pipeline_action.block_id',
        },
      },
      childBlocks: {
        relation: Model.HasManyRelation,
        modelClass: PipelineBlock,
        join: {
          from: 'pipeline_block.id',
          to: 'pipeline_block.parent_block_id',
        },
      },
    };
  }
}
