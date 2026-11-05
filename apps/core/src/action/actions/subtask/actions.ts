import nodePath from 'path';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';
import { Task } from '@task/Task';
import { TaskService } from '@database/services/TaskService';
import { assertNotDraft } from '@task/Draft';
import { WorkflowCache } from '@/cache/WorkflowCache';
import { TaskFactory } from '@task/TaskFactory';
import { generateIdentifier } from '@tipeline/utils';
import { parseParams } from '@utils/parseParams';
import { isNonSerializableVariableType } from '@utils/nonSerializableTypes';
import { assertPropsVisibility } from '@utils/assertPropsVisibility';
import { Parser } from '@utils/Parser';
import { PipelineVariableService } from '@database/services/PipelineVariableService';
import { submitDetachedJob } from '@engine/worker/SubmitDetachedJob';
import type { ParentRun } from '@engine/runner/IJobRunner';

type ExecParams = z.infer<typeof validations.subtask.exec.runtime.schema>;

/**
 * @group Actions
 */
export class GroupSubtask {
  // --------------------------------------------------
  // Execution
  // --------------------------------------------------

  /**
   * Runs a child task inline and waits for it to finish before the parent continues.
   *
   * Provide either `identifier` (a task stored in the database) or `path` (a YAML/JSON file path).
   * Use `props` to inject parent variable values into the child's named variables before it runs.
   * Use `outputs` to pull named child variables back into the parent pipeline after it finishes.
   * Database-backed tasks (`identifier`) always persist a full pipeline record; file-based tasks
   * (`path`) never persist.
   *
   * Set `async: true` to start the child and return immediately instead of waiting — the parent's
   * next action runs right away while the child keeps executing in the background. `outputs` is
   * rejected in this mode (there is no result yet to read back), and the child's progress does not
   * stream live to the parent's run; it only shows up afterwards in pipeline history.
   *
   * @param params - The input parameters.
   * @param task - The parent task instance.
   * @returns `true` when the subtask completes successfully.
   * @example
   * ```yaml
   * # Run a named subtask, inject a prop, map child outputs to parent variables
   * - group: subtask
   *   name: exec
   *   params:
   *     identifier: generate-pdf-report
   *     props:
   *       invoiceId: '{{ currentInvoiceId }}'
   *     outputs:
   *       parentReportPath: reportPath   # parent ← child
   * ```
   * @example
   * ```yaml
   * # Run a file-based subtask relative to the current task file
   * - group: subtask
   *   name: exec
   *   params:
   *     path: ./helpers/normalize-data.yml
   *     props:
   *       rawData: '{= apiResponse =}'
   *     outputs:
   *       result: normalizedData   # parent ← child
   * ```
   * @example
   * ```yaml
   * # Fire a subtask in the background and continue immediately — no outputs allowed
   * - group: subtask
   *   name: exec
   *   params:
   *     identifier: send-slow-notification
   *     async: true
   *     props:
   *       message: '{{ resultSummary }}'
   * ```
   */
  static async exec(
    params: ExecParams,
    task: Task,
    _lastResult?: unknown,
    step?: { identifier?: string }
  ): Promise<
    | boolean
    | { taskIdentifier: string; pipelineIdentifier: string; cached?: true; cachedFrom?: string | null }
    | { taskIdentifier: string; started: true }
  > {
    const parsed = validations.subtask.exec.runtime.validate(params);
    const { identifier, path, props, outputs, async: runAsync } = parsed;

    if (runAsync && outputs && Object.keys(outputs).length > 0) {
      throw new Error(
        'subtask.exec: "outputs" cannot be used with "async" — the parent continues before the ' +
          'child produces a result, so there is nothing to read back yet. Remove "outputs" or run synchronously.'
      );
    }

    const pipeline = task.getPipeline();
    const variables = pipeline.getVariables();
    // Checked before the child runs, so its side effects don't happen for a value that would be lost.
    for (const toName of Object.keys(outputs ?? {})) {
      if (!pipeline.getVariableByName(toName)) {
        throw new Error(
          `subtask.exec outputs variable "${toName}" does not exist. Declare it under variables, or remove it from outputs.`
        );
      }
    }
    const parentCallStack = task.getCallStack();
    // The child run links back to this run and step (none when this run isn't saved).
    const parent: ParentRun | undefined =
      pipeline.getIdentifier() && step?.identifier
        ? {
            pipelineIdentifier: pipeline.getIdentifier(),
            taskIdentifier: task.getIdentifier(),
            taskName: task.getName(),
            stepIdentifier: step.identifier,
          }
        : undefined;

    if (identifier) {
      if (identifier === task.getIdentifier() || parentCallStack.includes(identifier)) {
        throw new Error(
          `Circular sub-workflow detected: "${identifier}" is already in the call stack [${[...parentCallStack, task.getIdentifier()].join(' → ')}]`
        );
      }

      const record = await TaskService.getByIdentifier(identifier);
      if (!record) {
        throw new Error(`Sub-workflow not found: identifier "${identifier}"`);
      }
      assertNotDraft(record);

      const source = JSON.parse(record.source ?? '{}');

      if (props && Object.keys(props).length !== 0) {
        parseParams(props, variables);
      }

      if (runAsync) {
        // Runs as its own separate job (own worker thread/process) rather than in
        // this one — see execution-flow.md's "Async Subtasks" section. Visibility
        // must be checked here, before submission, since no in-process child Task
        // ever gets built to run Task.updateVariablesFromProps's own check.
        if (props && Object.keys(props).length !== 0) {
          assertPropsVisibility(source.pipeline?.variables ?? [], props as Record<string, unknown>);
        }

        await submitDetachedJob({
          type: 'exec',
          correlationId: generateIdentifier(),
          identifier,
          variables: props ?? {},
          callStack: [...parentCallStack, identifier],
          shouldSave: task.getShouldSave(),
          ...(parent ? { parent } : {}),
        });

        return { taskIdentifier: identifier, started: true };
      }

      // A cached sub-workflow called with the same props hands back its stored
      // outputs without running (see WorkflowCache). Only one whose outputs are read
      // back can be: otherwise it's run for what it does.
      const cache =
        outputs && Object.keys(outputs).length > 0
          ? await WorkflowCache.prepare({
              identifier,
              name: record.name,
              source,
              inputs: (props ?? {}) as Record<string, unknown>,
              outputs: Object.values(outputs),
              mode: task.getCacheMode(),
            })
          : null;
      if (cache && outputs) {
        const hit = await WorkflowCache.lookup(cache);
        if (hit) {
          if (props && Object.keys(props).length !== 0) {
            assertPropsVisibility(source.pipeline?.variables ?? [], props as Record<string, unknown>);
          }
          await GroupSubtask.propagateCachedOutputs(outputs, hit.value as Record<string, unknown>, task);
          // Which run produced the outputs, for the run page to link to.
          return { taskIdentifier: identifier, pipelineIdentifier: '', cached: true, cachedFrom: hit.sourcePipeline };
        }
      }

      const newTask = await TaskFactory.fromSource(source, identifier, task.getCorrelationId());
      newTask.setId(record.id);
      newTask.setShouldSave(task.getShouldSave());
      newTask.setCallStack([...parentCallStack, identifier]);
      newTask.setAwaitedByParent(true);
      newTask.setCacheMode(task.getCacheMode());
      newTask.setParentRun(parent ?? null);

      if (props && Object.keys(props).length !== 0) {
        await newTask.updateVariablesFromProps(props as any);
      }

      await newTask.run();

      if (outputs && Object.keys(outputs).length > 0) {
        await GroupSubtask.propagateOutputs(outputs, newTask, task);
        if (cache) {
          const stored = GroupSubtask.cacheableOutputs(Object.values(outputs), newTask);
          if (stored) await WorkflowCache.store(cache, stored, newTask.getPipeline().getIdentifier());
        }
      }

      return {
        taskIdentifier: identifier,
        pipelineIdentifier: newTask.getPipeline().getIdentifier(),
      };
    }

    if (path) {
      const resolvedPath =
        path.startsWith('./') || path.startsWith('../')
          ? nodePath.resolve(nodePath.dirname(task.getFilePath() ?? process.cwd()), path)
          : path;

      if (resolvedPath === task.getFilePath() || parentCallStack.includes(resolvedPath)) {
        throw new Error(
          `Circular sub-workflow detected: "${resolvedPath}" is already in the call stack`
        );
      }

      if (props && Object.keys(props).length !== 0) {
        parseParams(props, variables);
      }

      if (runAsync) {
        // Same rationale as the identifier branch above: separate job, so the
        // visibility check must run here against the file's own declared
        // variables rather than after an in-process child Task is built.
        if (props && Object.keys(props).length !== 0) {
          const parsedFile = Parser.importFromFile(resolvedPath) as any;
          assertPropsVisibility(parsedFile?.pipeline?.variables ?? [], props as Record<string, unknown>);
        }

        await submitDetachedJob({
          type: 'run',
          correlationId: generateIdentifier(),
          payload: { source: resolvedPath, variables: props ?? {} },
          callStack: [...parentCallStack, resolvedPath],
        });

        return true;
      }

      const newTask = await TaskFactory.fromFile(resolvedPath, generateIdentifier(), task.getCorrelationId());
      newTask.setCallStack([...parentCallStack, resolvedPath]);
      newTask.setAwaitedByParent(true);
      newTask.setCacheMode(task.getCacheMode());

      if (props && Object.keys(props).length !== 0) {
        await newTask.updateVariablesFromProps(props as any);
      }

      await newTask.runClean();

      if (outputs && Object.keys(outputs).length > 0) {
        await GroupSubtask.propagateOutputs(outputs, newTask, task);
      }

      return true;
    }

    return false;
  }

  /**
   * The child's final values of the variables the parent reads, to store in the
   * cache — or null when one of them can't be stored: a private variable (the parent
   * may not read it), a secret (never written to the cache), or a live handle.
   */
  private static cacheableOutputs(names: string[], from: Task): Record<string, unknown> | null {
    const values: Record<string, unknown> = {};
    for (const name of names) {
      const variable = from.getPipeline().getVariableByName(name);
      if (!variable) continue;
      if (variable.getVisibility() === 'private' || variable.isSecret()) return null;
      if (isNonSerializableVariableType(variable.getType())) return null;
      values[name] = variable.getValue();
    }
    return values;
  }

  /** Sets the parent's variables from stored outputs, as propagateOutputs does from a run. */
  private static async propagateCachedOutputs(
    outputs: Record<string, string>,
    stored: Record<string, unknown>,
    to: Task
  ): Promise<void> {
    const toPipeline = to.getPipeline();
    for (const [toName, fromName] of Object.entries(outputs)) {
      const toVar = toPipeline.getVariableByName(toName);
      if (!toVar || !Object.prototype.hasOwnProperty.call(stored ?? {}, fromName)) continue;
      toVar.setValue(stored[fromName]);
      if (to.getShouldSave()) {
        await PipelineVariableService.updateValue(toPipeline.getId(), toName, toVar.getValue());
      }
    }
  }

  private static async propagateOutputs(
    outputs: Record<string, string>,
    from: Task,
    to: Task
  ): Promise<void> {
    const fromPipeline = from.getPipeline();
    const toPipeline = to.getPipeline();
    for (const [toName, fromName] of Object.entries(outputs)) {
      const fromVar = fromPipeline.getVariableByName(fromName);
      const toVar = toPipeline.getVariableByName(toName);
      if (!fromVar) {
        throw new Error(`subtask.exec outputs: the sub-workflow has no variable "${fromName}".`);
      }
      if (toVar) {
        if (fromVar.getVisibility() === 'private') {
          throw new Error(`Variable "${fromName}" is private and cannot be read by a parent workflow.`);
        }
        toVar.setValue(fromVar.getValue());

        if (to.getShouldSave()) {
          const persistedValue = isNonSerializableVariableType(toVar.getType())
            ? null
            : toVar.getValue();
          await PipelineVariableService.updateValue(toPipeline.getId(), toName, persistedValue, undefined, {
            sensitive: fromVar.isSecret(),
          });
        }
      }
    }
  }
}
