import { PipelineBlock as PipelineBlockModel } from '@/database/models/PipelineBlock';
import { PipelineActionService } from '@/database/services/PipelineActionService';

export class PipelineBlockService {
  static async create(data: {
    pipeline_id: number;
    parent_block_id?: number | null;
    parent_action_position?: number | null;
    iteration?: number | null;
    metadata?: any;
  }) {
    return await PipelineBlockModel.query().insert(data);
  }

  static async getOrCreate(data: {
    pipeline_id: number;
    parent_block_id?: number | null;
    parent_action_position?: number | null;
    iteration?: number | null;
    metadata?: any;
  }) {
    // Build null-safe query (SQLite requires IS NULL, not = NULL)
    const query = PipelineBlockModel.query().where('pipeline_id', data.pipeline_id);

    if (data.parent_block_id != null) {
      query.where('parent_block_id', data.parent_block_id);
    } else {
      query.whereNull('parent_block_id');
    }

    if (data.parent_action_position != null) {
      query.where('parent_action_position', data.parent_action_position);
    } else {
      query.whereNull('parent_action_position');
    }

    if (data.iteration != null) {
      query.where('iteration', data.iteration);
    } else {
      query.whereNull('iteration');
    }

    const existing = await query.first();
    if (existing) return existing;

    return await PipelineBlockModel.query().insert(data);
  }

  /**
   * Creates (or retrieves on resume) a pipeline_block record and pre-populates
   * its pipeline_action rows as 'pending'. Safe to call multiple times for the
   * same block — action rows are only inserted if they don't exist yet.
   *
   * - Root block:          parentBlockId = null, parentActionPosition = null, iteration = null
   * - Conditional branch:  parentBlockId = <parent>, parentActionPosition = <pos>, iteration = null
   * - Loop iteration:      parentBlockId = <parent>, parentActionPosition = <pos>, iteration = <i>
   */
  static async startBlock(
    pipelineId: number,
    actionIdentifiers: string[],
    parentBlockId: number | null,
    parentActionPosition: number | null,
    iteration: number | null = null,
    metadata?: any
  ) {
    const block = await PipelineBlockService.getOrCreate({
      pipeline_id: pipelineId,
      parent_block_id: parentBlockId,
      parent_action_position: parentActionPosition,
      iteration,
      metadata,
    });

    const existing = await PipelineActionService.getByBlock(block.id);
    if (existing.length === 0) {
      await PipelineActionService.createMany(
        actionIdentifiers.map((identifier, index) => ({
          pipeline_id: pipelineId,
          block_id: block.id,
          position: index,
          identifier,
          status: 'pending' as const,
        }))
      );
    }

    return block;
  }

  static async getByPipelineId(pipeline_id: number) {
    return await PipelineBlockModel.query().where({ pipeline_id });
  }
}
