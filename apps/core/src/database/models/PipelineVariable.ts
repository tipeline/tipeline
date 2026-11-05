import { Model } from 'objection';
import { Pipeline } from './Pipeline';
import { PipelineBlock } from './PipelineBlock';
import type { VariableScope } from '@tipeline/types';

export class PipelineVariable extends Model {
  id!: number;
  pipeline_id!: number;
  // Null for the row holding the variable's current/live value (unique per
  // pipeline_id+name+scope, as before). Set to the loop iteration's block_id
  // on a row that is a historical snapshot, kept purely for audit purposes.
  block_id?: number | null;
  name!: string;
  value!: string;
  type?: string;
  scope!: VariableScope;

  static get tableName() {
    return 'pipeline_variable';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['pipeline_id', 'name', 'scope'],
      properties: {
        id: { type: 'integer' },
        pipeline_id: { type: 'integer' },
        block_id: { type: ['integer', 'null'] },
        name: { type: 'string' },
        value: { type: ['string', 'null'] },
        type: { type: ['string', 'null'] },
        scope: { type: 'string', enum: ['task', 'core', 'env', 'global'] },
      },
    };
  }

  static get relationMappings() {
    return {
      pipeline: {
        relation: Model.BelongsToOneRelation,
        modelClass: Pipeline,
        join: {
          from: 'pipeline_variable.pipeline_id',
          to: 'pipeline.id',
        },
      },
      block: {
        relation: Model.BelongsToOneRelation,
        modelClass: PipelineBlock,
        join: {
          from: 'pipeline_variable.block_id',
          to: 'pipeline_block.id',
        },
      },
    };
  }
}
