import { PipelineVariable as PipelineVariableModel } from '@/database/models/PipelineVariable';
import type { VariableScope } from '@tipeline/types';
import { REDACTED_JSON, isSealed, seal, unseal } from '@utils/secretBox';

export class PipelineVariableService {
  static async createMany(
    variables: Array<{
      pipeline_id: number;
      name: string;
      value: any;
      type?: string;
      scope: VariableScope;
    }>
  ) {
    await PipelineVariableModel.transaction(async (trx) => {
      for (const variable of variables) {
        await PipelineVariableModel.query(trx).insert({
          pipeline_id: variable.pipeline_id,
          name: variable.name,
          value: JSON.stringify(variable.value),
          type: variable.type ?? typeof variable.value,
          scope: variable.scope,
        });
      }
    });
  }

  static async getOrCreate(data: {
    pipeline_id: number;
    name: string;
    value: any;
    type?: string;
    scope: 'task' | 'core' | 'env';
  }) {
    const existing = await PipelineVariableModel.query()
      .where({
        pipeline_id: data.pipeline_id,
        name: data.name,
        scope: data.scope,
      })
      .whereNull('block_id')
      .first();

    if (existing) {
      return existing;
    }

    return await PipelineVariableModel.query().insert({
      pipeline_id: data.pipeline_id,
      name: data.name,
      value: JSON.stringify(data.value),
      type: data.type ?? typeof data.value,
      scope: data.scope,
    });
  }

  // Current-value rows only (block_id IS NULL) — needed since resume expects exactly one row per variable.
  static async getByPipelineId(pipeline_id: number) {
    const rows = await PipelineVariableModel.query().where({ pipeline_id }).whereNull('block_id');
    for (const row of rows) row.value = unseal(row.value) as typeof row.value;
    return rows;
  }

  static async getByPipelineIds(pipelineIds: number[], variableName?: string) {
    let query = PipelineVariableModel.query()
      .whereIn('pipeline_id', pipelineIds)
      .orderBy('pipeline_id', 'desc');
    if (variableName) query = query.where('name', variableName);
    const rows = await query;
    for (const row of rows) if (isSealed(row.value)) row.value = REDACTED_JSON as typeof row.value;
    return rows;
  }

  static async getHistoryByPipelineId(pipeline_id: number, name?: string) {
    let query = PipelineVariableModel.query()
      .where({ pipeline_id })
      .whereNotNull('block_id')
      .orderBy('id', 'asc');
    if (name) query = query.where('name', name);
    return await query;
  }

  /** Forgets a run's sealed values, for when nothing can read them again. */
  static async eraseSecrets(pipeline_id: number) {
    await PipelineVariableModel.query()
      .patch({ value: 'null' })
      .where({ pipeline_id })
      .whereNull('block_id')
      .where('value', 'like', 'enc:v1:%');
  }

  // `snapshot` additionally upserts a per-block audit row, giving loop bodies one history row per iteration.
  // A variable that started sealed, or was given a secret's value (`sensitive`), stays sealed,
  // and its history only says it changed.
  static async updateValue(
    pipeline_id: number,
    name: string,
    value: any,
    snapshot?: { blockId: number; scope: VariableScope; type?: string },
    options: { sensitive?: boolean } = {}
  ) {
    const current = await PipelineVariableModel.query()
      .where({ pipeline_id, name })
      .whereNull('block_id')
      .first();
    const sealed = !!options.sensitive || isSealed(current?.value);
    const json = JSON.stringify(value);

    await PipelineVariableModel.query()
      .patch({ value: sealed ? seal(json) : json })
      .where({ pipeline_id, name })
      .whereNull('block_id');

    if (snapshot) {
      await PipelineVariableModel.query()
        .insert({
          pipeline_id,
          block_id: snapshot.blockId,
          name,
          value: sealed ? REDACTED_JSON : json,
          type: snapshot.type ?? typeof value,
          scope: snapshot.scope,
        })
        .onConflict(['block_id', 'name'])
        .merge(['value', 'type']);
    }
  }
}
