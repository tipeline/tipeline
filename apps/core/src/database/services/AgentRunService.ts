import { AgentRun as AgentRunModel } from '@database/models/AgentRun';
import { TaskService } from '@database/services/TaskService';

const HISTORY_LIMIT = 100;

export class AgentRunService {
  static async create(correlationId: string, prompt: string) {
    return await AgentRunModel.query().insert({
      correlation_id: correlationId,
      prompt,
      status: 'running',
    });
  }

  /**
   * The agent picked a workflow and is waiting for the user to confirm the run.
   * A hub workflow isn't installed yet, so it's recorded by name only: there's
   * no local identifier to link to until the user installs it.
   */
  static async markProposed(
    correlationId: string,
    taskIdentifier: string | null,
    answer: string,
    taskName?: string | null
  ) {
    const task = taskIdentifier ? await TaskService.getByIdentifier(taskIdentifier) : null;
    await AgentRunModel.query()
      .patch({
        status: 'proposed',
        task_identifier: task ? taskIdentifier : null,
        task_name: task?.name ?? taskName ?? null,
        answer,
      })
      .where({ correlation_id: correlationId });
  }

  static async markTaskRunning(correlationId: string, taskIdentifier: string) {
    const task = await TaskService.getByIdentifier(taskIdentifier);
    await AgentRunModel.query()
      .patch({ status: 'running', task_identifier: taskIdentifier, task_name: task?.name ?? null })
      .where({ correlation_id: correlationId });
  }

  /**
   * Core never persists a pipeline's own correlationId anywhere (it only exists as an
   * ephemeral event-emission key), so exec_task can't hand back which pipeline it just
   * started. The desktop renderer is the only place that can match the two up (by
   * watching the live stream for a matching taskIdentifier) — this lets it write the
   * result back once it resolves.
   */
  static async setPipeline(correlationId: string, pipelineIdentifier: string) {
    await AgentRunModel.query()
      .patch({ pipeline_identifier: pipelineIdentifier })
      .where({ correlation_id: correlationId });
  }

  static async complete(correlationId: string, answer: string) {
    const patchData: Record<string, any> = { status: 'done', answer, finished_at: new Date().toISOString() };
    await AgentRunModel.query().patch(patchData).where({ correlation_id: correlationId });
  }

  static async fail(correlationId: string, error: string) {
    const patchData: Record<string, any> = { status: 'error', error, finished_at: new Date().toISOString() };
    await AgentRunModel.query().patch(patchData).where({ correlation_id: correlationId });
  }

  static async list() {
    return await AgentRunModel.query().orderBy('created_at', 'desc').limit(HISTORY_LIMIT);
  }
}
