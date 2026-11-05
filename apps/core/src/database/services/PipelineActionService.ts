import { PipelineAction as PipelineActionModel } from '@/database/models/PipelineAction';
import { Pipeline as PipelineModel } from '@/database/models/Pipeline';

export class PipelineActionService {
  static async createMany(
    actions: Array<{
      pipeline_id: number;
      block_id: number;
      position: number;
      identifier: string;
      status: PipelineActionModel['status'];
    }>
  ) {
    await PipelineActionModel.transaction(async (trx) => {
      for (const action of actions) {
        await PipelineActionModel.query(trx).insert({
          pipeline_id: action.pipeline_id,
          block_id: action.block_id,
          position: action.position,
          identifier: action.identifier,
          status: action.status,
        });
      }
    });
  }

  static async updateStatus(
    pipelineId: number,
    blockId: number,
    identifier: string,
    status: PipelineActionModel['status'],
    options: {
      result?: any;
      params?: any;
      error?: string;
      startedAt?: Date | null;
      finishedAt?: Date | null;
      cached?: boolean;
    } = {}
  ) {
    const { result, params, error, startedAt, finishedAt, cached } = options;

    const patchData: Record<string, any> = {
      status,
      result: result !== undefined ? JSON.stringify(result) : undefined,
      params: params !== undefined ? JSON.stringify(params) : undefined,
      error: error ?? undefined,
      cached: cached ?? undefined,
    };

    if (startedAt) patchData.started_at = startedAt.toISOString();
    if (finishedAt) patchData.finished_at = finishedAt.toISOString();

    const updated = await PipelineActionModel.query()
      .patch(patchData)
      .where({ block_id: blockId, identifier });

    // Fallback insert in case the action record was not pre-created
    if (updated === 0) {
      await PipelineActionModel.query().insert({
        pipeline_id: pipelineId,
        block_id: blockId,
        position: 0,
        identifier,
        ...patchData,
      });
    }

    return updated;
  }

  static async getByBlock(blockId: number) {
    return await PipelineActionModel.query().where({ block_id: blockId }).orderBy('position');
  }

  static async getByBlockAndIdentifier(blockId: number, identifier: string) {
    return await PipelineActionModel.query().where({ block_id: blockId, identifier }).first();
  }

  static async getPendingByBlock(blockId: number) {
    return await PipelineActionModel.query()
      .where({ block_id: blockId, status: 'pending' })
      .orderBy('position');
  }

  static async getLastExecutedAction(pipelineId: number): Promise<string | null> {
    const lastAction = await PipelineActionModel.query()
      .where('pipeline_id', pipelineId)
      .whereNot('status', 'pending')
      .orderBy('started_at', 'desc')
      .first();

    return lastAction ? lastAction.identifier : null;
  }

  static async getByPipelineIds(pipelineIds: number[], actionIdentifier?: string) {
    let query = PipelineActionModel.query()
      .whereIn('pipeline_id', pipelineIds)
      .whereNot('status', 'pending')
      .orderBy('pipeline_id', 'desc')
      .orderBy('started_at', 'asc');
    if (actionIdentifier) query = query.where('identifier', actionIdentifier);
    return await query;
  }

  static async getActionsByIdentifier(pipelineIdentifier: string) {
    const pipeline = await PipelineModel.query()
      .where('identifier', pipelineIdentifier)
      .select('id')
      .orderBy('started_at', 'desc')
      .first();

    if (!pipeline) return null;

    return await PipelineActionModel.query().where('pipeline_id', pipeline.id);
  }
}
