import { TaskFactory } from '@task/TaskFactory.js';
import { TaskService } from '@database/services/TaskService.js';
import { PipelineService } from '@database/services/PipelineService.js';
import { PipelineVariableService } from '@database/services/PipelineVariableService.js';
import { generateIdentifier } from '@tipeline/utils';
import { coerceVariableValue } from '@utils/coerceVariableValue.js';
import type { JobPayload } from '@engine/runner/IJobRunner.js';
import { assertNotDraft } from '@task/Draft.js';

export async function executeJob(job: JobPayload): Promise<void> {
  console.log('== executeJob ==', job);

  const { type } = job;

  if (type === 'exec') {
    const record = await TaskService.getByIdentifier(job.identifier!);
    if (!record) throw new Error(`Workflow "${job.identifier}" not found`);
    // Scheduled runs reach here without going through Core.exec, so drafts are checked here too.
    assertNotDraft(record, job.allowDraft);

    let source = JSON.parse(record.source ?? '{}');
    if (Array.isArray(source?.pipeline?.variables) && source.pipeline.variables.length > 0) {
      source.pipeline.variables = applyVariableOverrides(
        source.pipeline.variables,
        job.variables ?? {}
      );
    }

    const task = await TaskFactory.fromSource(source, job.identifier!, job.correlationId);
    task.setId(record.id);
    // Defaults to true (persist), matching every non-subtask call site's prior hardcoded
    // behavior — only a subtask.exec(async: true) job sets this, to inherit its parent's
    // shouldSave rather than always forcing persistence.
    task.setShouldSave(job.ephemeral ? false : (job.shouldSave ?? true));
    task.setCallStack(job.callStack ?? []);
    task.setRequestedOutputs(job.outputs ?? null);
    task.setTrigger((job.trigger as unknown as Record<string, unknown>) ?? null);
    task.setParentRun(job.parent ?? null);
    task.setCacheMode(job.cacheMode);
    if (job.ephemeral) await task.runClean();
    else await task.run();
  } else if (type === 'run') {
    const task = job.payload.content
      ? await TaskFactory.fromContent(
          job.payload.content,
          generateIdentifier(),
          job.correlationId,
          job.payload.variables ?? {}
        )
      : await TaskFactory.fromFile(
          job.payload.source,
          generateIdentifier(),
          job.correlationId,
          job.payload.variables ?? {}
        );
    task.setShouldSave(false);
    task.setCallStack(job.callStack ?? []);
    task.setCacheMode(job.cacheMode);
    await task.runClean();
  } else if (type === 'resume') {
    const pipelineRecord = await PipelineService.getByIdentifier(job.pipelineIdentifier!);
    if (!pipelineRecord) throw new Error(`Pipeline "${job.pipelineIdentifier}" not found`);
    if (pipelineRecord.status === 'completed') {
      throw new Error(`Pipeline "${job.pipelineIdentifier}" is already completed; nothing to resume`);
    }

    const taskRecord = await TaskService.getById(pipelineRecord.task_id);
    if (!taskRecord) throw new Error(`Workflow for pipeline "${job.pipelineIdentifier}" not found`);

    const source =
      typeof pipelineRecord.source === 'string'
        ? JSON.parse(pipelineRecord.source)
        : pipelineRecord.source;

    const task = await TaskFactory.fromSource(source, taskRecord.identifier, job.correlationId);
    task.setId(taskRecord.id);
    task.setShouldSave(true);
    task.setCacheMode(job.cacheMode);

    for (const [name, value] of Object.entries(job.variables ?? {})) {
      await PipelineVariableService.updateValue(pipelineRecord.id, name, value);
    }

    const variablesRecord = await PipelineVariableService.getByPipelineId(pipelineRecord.id);
    await task.updateVariablesFromRecords(variablesRecord);

    await task.resume(pipelineRecord.id, pipelineRecord.identifier);
  } else {
    throw new Error(`Unknown job type: ${type}`);
  }
}

function applyVariableOverrides(variables: Array<any>, overrides: Record<string, any>): Array<any> {
  variables.forEach((item) => {
    if (Object.prototype.hasOwnProperty.call(overrides, item.name)) {
      // Coerce to the variable's declared type before this raw declaration hits
      // TaskValidator's type-strict schema check — overrides commonly arrive as
      // loosely-typed strings (Desktop's subtask.exec props editor, CLI
      // --variables flags), and no Variable object (with its own equivalent
      // coercion) exists yet at this point to absorb the mismatch.
      item.value = coerceVariableValue(overrides[item.name], item.type, item.name);
    }
  });
  return variables;
}
