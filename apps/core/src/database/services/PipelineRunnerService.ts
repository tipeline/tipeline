import { Pipeline } from '@/database/models/Pipeline';
import { PipelineVariable } from '@/database/models/PipelineVariable';
import { TaskService } from './TaskService';
import { generateIdentifier } from '@tipeline/utils';
import { Variable } from '@/variable/Variable';
import { redactSecretValues, seal } from '@utils/secretBox';

export class PipelineRunnerService {
  /** What a run keeps of its workflow: everything but written-in secret values, which go in sealed rows. */
  private static snapshotSource(source: string | null | undefined): string | undefined {
    if (!source) return undefined;
    return JSON.stringify(redactSecretValues(JSON.parse(source), '[REDACTED]').source);
  }

  static async startPipeline(taskIdentifier: string, variables: Variable[], metadata?: Record<string, unknown>) {
    const task = await TaskService.getByIdentifier(taskIdentifier);
    if (!task) throw new Error(`Workflow ${taskIdentifier} not found`);

    const pipeline = await Pipeline.transaction(async (trx) => {
      const created = await Pipeline.query(trx).insert({
        task_id: task.id,
        identifier: generateIdentifier(),
        status: 'running',
        source: PipelineRunnerService.snapshotSource(task.source),
        started_at: new Date().toISOString(),
        ...(metadata ? { metadata } : {}),
      });

      for (const variable of variables) {
        const json = JSON.stringify(variable.getValue());
        await PipelineVariable.query(trx).insert({
          pipeline_id: created.id,
          name: variable.getName(),
          value: variable.isSecret() || variable.getScope() === 'env' ? seal(json) : json,
          type: variable.getType() ?? typeof variable.getValue(),
          scope: variable.getScope(),
        });
      }

      return created;
    });

    return pipeline;
  }

  /**
   * Records a run that was answered from the workflow cache: completed at once, with
   * the outputs it handed back saved as its variables, and `cached` + the run that
   * produced them in its metadata — so history shows it ran, and from what.
   */
  static async recordCachedRun(
    taskIdentifier: string,
    outputs: Record<string, unknown>,
    metadata: { cachedFrom: string | null; cachedAt: string; trigger?: unknown }
  ) {
    const task = await TaskService.getByIdentifier(taskIdentifier);
    if (!task) throw new Error(`Workflow ${taskIdentifier} not found`);
    const now = new Date().toISOString();

    return await Pipeline.transaction(async (trx) => {
      const created = await Pipeline.query(trx).insert({
        task_id: task.id,
        identifier: generateIdentifier(),
        status: 'completed',
        source: task.source,
        started_at: now,
        finished_at: now,
        metadata: {
          cached: true,
          cachedFrom: metadata.cachedFrom,
          cachedAt: metadata.cachedAt,
          ...(metadata.trigger ? { trigger: metadata.trigger } : {}),
        },
      } as any);
      for (const [name, value] of Object.entries(outputs)) {
        await PipelineVariable.query(trx).insert({
          pipeline_id: created.id,
          name,
          value: JSON.stringify(value),
          type: Array.isArray(value) ? 'array' : value === null ? 'string' : typeof value,
          scope: 'task',
        });
      }
      return created;
    });
  }

  /**
   * Marks all pipelines that were left in 'running' state (e.g. from a previous crash)
   * as 'failed'. Should be called once on engine startup.
   */
  static async recoverStaleRunningPipelines(): Promise<void> {
    await Pipeline.query()
      .where('status', 'running')
      .patch({
        status: 'failed',
        metadata: {
          reason: 'crashed',
          message: 'Recovered from crash: pipeline was interrupted',
        },
      });
  }

  /*
  static async pipelineUpdate(pipelineId: number, status: PipelineModel['status']) {
    await PipelineService.updateStatus(pipelineId, status);
  }

  static async pipelineVariableUpdate(pipelineId: number, name: string, value: any) {
    await PipelineVariableService.updateValue(pipelineId, name, value);
  }

  static async pipelineResume(pipelineId: number) {
    const pipeline = await PipelineService.getById(pipelineId);
    const variables = await PipelineVariableService.getByPipelineId(pipelineId);
  }
  */
}
