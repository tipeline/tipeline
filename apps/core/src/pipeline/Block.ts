import { Action } from '@action/Action';

import { Variable } from '@/variable/Variable';
import { coreEvents } from '@engine/CoreEvents';
import { DebugController, type DebugDecision } from '@engine/DebugController';
import { globalsReadByStep, parseStepParams } from '@utils/parseParams';
import { safeClone } from '@utils/safeClone';
import { isNonSerializableVariableType } from '@utils/nonSerializableTypes';
import { PipelineVariableService } from '@database/services/PipelineVariableService';
import { PipelineActionService } from '@/database/services/PipelineActionService';
import { GlobalVariableService } from '@database/services/GlobalVariableService';
import { ApprovalPendingSignal, ApprovalRejectedSignal, RunCanceledSignal } from '@utils/errors';
import { declaredReturnType } from '@action/declaredReturnType';
import { Pipeline } from '@pipeline/Pipeline';
import { Task } from '@task/Task';
import { parseTtl } from '@tipeline/schemas';
import { stepCacheKey, canonicalJson } from '@/cache/CacheKey';
import { CacheService } from '@database/services/CacheService';

// Failures a debugger run already paused at (and let fail): the blocks around the step
// see the same error on its way out and must not pause at it again.
const pausedFailures = new WeakSet<object>();

export class Block {
  private actions: Array<Action>;
  private variables: Array<Variable>;
  private task: Task;
  private pipeline: Pipeline;
  private blockId: number;
  private lastResult: unknown;
  private shouldSave: boolean;
  // Set by runAction: whether the step it just ran was served from the result cache.
  private servedFromCache: { createdAt: string } | null = null;

  constructor(actions: Array<Action>, task: Task, blockId: number) {
    this.actions = actions;
    this.task = task;
    this.pipeline = task.getPipeline();
    this.variables = this.pipeline.getVariables();
    this.shouldSave = task.getShouldSave();
    this.blockId = blockId;
  }

  public async run() {
    // Save the parent's context so it can be restored after this block finishes.
    // Without this, a loop's second iteration would read the child block's context
    // (set during the first iteration's run) instead of the parent's.
    const savedContext = this.pipeline.getCurrentContext();

    // Load completed identifiers once per block (one query). On a fresh run all
    // actions are 'pending' so completedSet stays null — no per-action overhead.
    const completedSet = await this.loadCompletedIdentifiers();

    const correlationId = this.task.getCorrelationId();
    const depth = DebugController.enterBlock(correlationId);

    try {
      for (let i = 0; i < this.actions.length; i++) {
        this.pipeline.setCurrentContext(this.blockId, i);
        const action = this.actions[i];

        if (completedSet?.has(action.identifier)) continue;
        if (action.disabled) continue;

        // Canceled (or the debugger's Stop): end here, before the next step.
        DebugController.throwIfStopped(correlationId);

        // Settings changed in the debugger since the run started apply from here on.
        this.applyOverride(action);

        // The debugger waits before the step (stepping, or a breakpoint), showing the
        // input it's about to run with; it may leave the step out.
        if (DebugController.shouldPauseBefore(correlationId, action.identifier, this, depth, this.scope())) {
          if ((await this.pauseBefore(action, depth)) === 'skip') {
            await this.reportSkipped(action);
            continue;
          }
        }

        await this.executeAction(action, depth);
      }
    } finally {
      DebugController.leaveBlock(correlationId);
    }

    this.pipeline.setCurrentContext(...savedContext);
  }

  /** This block's workflow and how many sub-workflows deep it runs, for the debugger. */
  private scope() {
    return { taskIdentifier: this.task.getIdentifier(), callDepth: this.task.getCallStack().length };
  }

  private applyOverride(action: Action) {
    const override = DebugController.overrideFor(this.task.getCorrelationId(), action.identifier);
    if (!override || typeof (action as any).setRawParams !== 'function') return;
    action.setRawParams(override.params);
    if (override.destination !== undefined) action.destination = override.destination;
  }

  /** The `paused` event: the step the run waits at, with its input filled in. */
  private async emitPaused(action: Action, extra: Record<string, unknown> = {}) {
    const correlationId = this.task.getCorrelationId();
    let params: unknown = null;
    let paramsError: string | undefined;
    try {
      await this.updateActionParams(action);
      params = await this.buildDisplayParams(action);
    } catch (error: any) {
      // Its input can't be filled in yet (a missing variable…): say so, the run decides.
      paramsError = this.redactSecrets(error?.message ?? String(error));
    }
    coreEvents.emit(`paused:${correlationId}`, {
      identifier: action.identifier,
      name: `${action.group}.${action.name}`,
      params,
      ...(paramsError ? { paramsError } : {}),
      pipelineIdentifier: this.pipeline.getIdentifier(),
      taskIdentifier: this.task.getIdentifier(),
      // 0: the run's own workflow; more: inside that many sub-workflows (Step out).
      callDepth: this.scope().callDepth,
      ...extra,
    });
  }

  /** Waits at a step: before it runs, or after it failed (`failed`). */
  private async waitAt(action: Action, depth: number, extra: Record<string, unknown> = {}): Promise<DebugDecision> {
    const correlationId = this.task.getCorrelationId();
    // Wait first, then say so: an answer that comes right back isn't lost.
    const decision = DebugController.waitForDecision(correlationId, {
      block: this,
      depth,
      callDepth: this.scope().callDepth,
      // The step was edited: show it again with its new input.
      onEdit: async () => {
        this.applyOverride(action);
        await this.emitPaused(action, extra);
      },
      setVariable: async (name, value) => {
        const variable = this.getVariableByName(name);
        if (!variable) return;
        try {
          variable.setValue(value);
          if (this.shouldSave) {
            await PipelineVariableService.updateValue(this.pipeline.getId(), name, variable.getValue(), {
              blockId: this.blockId,
              scope: variable.getScope(),
              type: variable.getType(),
            });
          }
          await this.emitPaused(action, {
            ...extra,
            changedVariables: [
              {
                name,
                value: isNonSerializableVariableType(variable.getType())
                  ? null
                  : this.redactSecrets(variable.getValue()),
              },
            ],
          });
        } catch (error: any) {
          await this.emitPaused(action, { ...extra, variableError: { name, message: error?.message ?? String(error) } });
        }
      },
    });
    // Handled by the caller once the event is out; a Stop meanwhile mustn't go unseen.
    decision.catch(() => {});
    await this.emitPaused(action, extra);
    return decision;
  }

  private pauseBefore(action: Action, depth: number): Promise<DebugDecision> {
    return this.waitAt(action, depth);
  }

  /** A step the debugger left out: reported like a finished step, marked skipped. */
  private async reportSkipped(action: Action) {
    coreEvents.emit(`action:${this.task.getCorrelationId()}`, {
      name: `${action.group}.${action.name}`,
      params: await this.buildDisplayParams(action).catch(() => null),
      result: null,
      destination: action.getDestination() || null,
      changedVariables: [],
      skipped: true,
      pipelineIdentifier: this.pipeline.getIdentifier(),
      id: action.id,
      identifier: action.identifier,
      taskIdentifier: this.task.getIdentifier(),
    });
  }

  private async loadCompletedIdentifiers(): Promise<Set<string> | null> {
    if (!this.shouldSave || this.blockId === 0) return null;
    const records = await PipelineActionService.getByBlock(this.blockId);
    const completed = records.filter((r) => r.status === 'completed');
    return completed.length > 0 ? new Set(completed.map((r) => r.identifier)) : null;
  }

  private async executeAction(action: Action, depth = 0): Promise<void> {
    const pipelineId = this.pipeline.getId();

    try {
      if (this.shouldSave) {
        await PipelineActionService.updateStatus(pipelineId, this.blockId, action.identifier, 'running', {
          startedAt: new Date(),
        });
      }

      const result = await this.runAction(action);

      if (this.shouldSave) {
        await PipelineActionService.updateStatus(pipelineId, this.blockId, action.identifier, 'completed', {
          result,
          params: action.getParamsPlain(),
          finishedAt: new Date(),
          ...(this.servedFromCache ? { cached: true } : {}),
        });
      }
    } catch (error: any) {
      // Waiting for an approval (here or in a nested block): the step pauses — not a
      // failure, so no error event — and the run stops until someone decides.
      if (error instanceof ApprovalPendingSignal) {
        if (this.shouldSave) {
          await PipelineActionService.updateStatus(pipelineId, this.blockId, action.identifier, 'paused', {
            params: action.getParamsPlain(),
          });
        }
        throw error;
      }
      // Rejected (onReject: stop) or the run was canceled: the step — and every step
      // around it — is canceled, again without an error event; the run ends as canceled.
      if (error instanceof ApprovalRejectedSignal || error instanceof RunCanceledSignal) {
        if (this.shouldSave) {
          await PipelineActionService.updateStatus(pipelineId, this.blockId, action.identifier, 'canceled', {
            error: error.message,
            params: action.getParamsPlain(),
          });
        }
        throw error;
      }
      if (this.shouldSave) {
        await PipelineActionService.updateStatus(pipelineId, this.blockId, action.identifier, 'failed', {
          error: error.message || String(error),
          params: action.getParamsPlain(),
          finishedAt: new Date(),
        });
      }

      const correlationId = this.task.getCorrelationId();
      // Same run/workflow ids as the `action` event: clients that follow one run (the run
      // page) pick its events out of the shared stream by pipelineIdentifier.
      coreEvents.emit(`actionError:${correlationId}`, {
        identifier: action.identifier,
        name: `${action.group}.${action.name}`,
        error: this.redactSecrets(error.message || String(error)),
        pipelineIdentifier: this.pipeline.getIdentifier(),
        taskIdentifier: this.task.getIdentifier(),
      });

      // In the debugger, a failed step waits: run it again (after an edit, say), leave
      // it out and go on, or let the run fail (Continue, Next or Stop).
      if (DebugController.isDebugging(correlationId) && error && typeof error === 'object' && !pausedFailures.has(error)) {
        const decision = await this.waitAt(action, depth, {
          failed: true,
          error: this.redactSecrets(error.message || String(error)),
        }).catch(() => 'next' as const);
        if (decision === 'retry') {
          this.applyOverride(action);
          return this.executeAction(action, depth);
        }
        if (decision === 'skip') {
          await this.reportSkipped(action);
          return;
        }
        pausedFailures.add(error);
      }

      throw error; // Re-throw to stop execution
    }
  }

  private assertBrowserLaunchDestination(destination: string) {
    if (!destination) {
      throw new Error(
        'browser.launch requires a "destination" (a variable of type "browser") to store the launched browser handle; without one it can never be closed and will leak a Chrome process.'
      );
    }

    if (destination.startsWith('_global.')) {
      throw new Error(
        `browser.launch destination "${destination}" cannot be a global variable — a browser handle is a live process reference and must be a pipeline-scoped variable.`
      );
    }

    const variableDestination = this.getVariableByName(destination);
    if (!variableDestination) {
      throw new Error(
        `browser.launch destination variable "${destination}" does not exist. Declare it with type "browser" before using it as this action's destination.`
      );
    }
  }

  private assertDestinationType(action: Action) {
    const destination = action.getDestination();
    if (!destination || destination.startsWith('_global.')) return;

    // The result has nowhere to go, so the step's value would be lost without a word.
    const variableDestination = this.getVariableByName(destination);
    if (!variableDestination) {
      throw new Error(
        `${action.group}.${action.name} destination "${destination}" does not exist. Declare it under variables, or remove destination if you don't need the result.`
      );
    }

    // Undeclared/'any' means "no constraint" — matches how the Desktop builder
    // filters the destination-variable picker (TaskDialogActionEdit.vue).
    const expected = declaredReturnType(action.group, action.name, action.source);
    if (!expected || expected === 'any') return;

    if (variableDestination.getType() !== expected) {
      throw new Error(
        `${action.group}.${action.name} destination "${destination}" must have type "${expected}" (found "${variableDestination.getType()}").`
      );
    }
  }

  private async runAction(action: Action) {
    // Updates the parameters
    await this.updateActionParams(action);

    // Validate before launching — a Chrome process with nowhere to store its
    // handle can never be closed and leaks until the OS is rebooted.
    if (action.group === 'browser' && action.name === 'launch') {
      this.assertBrowserLaunchDestination(action.getDestination());
    }

    // Validate every action's destination variable type against its declared
    // return type before running — fails fast instead of running the action's
    // side effects only to reject (or silently mis-coerce) the result after.
    this.assertDestinationType(action);

    // Snapshot values before execution so we can report every variable this
    // action actually changed — not just the one named by `destination:`.
    // Actions like `variable.set` and `subtask.exec`'s `outputs` mutate
    // pipeline variables directly, bypassing the destination codepath below.
    const beforeValues = new Map(this.variables.map((v) => [v.getName(), v.getValue()]));

    // A cancel ends the step right away, even one that waits (a sign-in, a request).
    let result = await DebugController.untilStopped(
      this.task.getCorrelationId(),
      this.executeOrServeFromCache(action)
    );

    this.lastResult = result;

    // Gets the destination where the result will be saved, if set by the user
    const destination = action.getDestination();

    if (destination && result != null) {
      if (destination.startsWith('_global.')) {
        // Same target the `variable.set` action writes to — a global variable
        // must already exist (no auto-create) and mustn't be readonly.
        const globalName = destination.slice('_global.'.length);
        try {
          const record = await GlobalVariableService.getByName(globalName);
          if (!record) throw new Error(`Global variable "${globalName}" does not exist.`);
          if (record.readonly) {
            throw new Error(`Global variable "${globalName}" is readonly and cannot be modified.`);
          }
          await GlobalVariableService.update({ identifier: record.identifier, value: result });
        } catch (e: any) {
          if (action.onError === 'throw') throw e;
        }
      } else {
        const variableDestination = this.getVariableByName(destination);

        if (variableDestination) {
          let setValueOk = true;
          try {
            variableDestination.setValue(result);
          } catch (e: any) {
            if (action.onError === 'throw') throw e;
            setValueOk = false;
          }

          if (setValueOk) {
            result = isNonSerializableVariableType(variableDestination.getType()) ? null : result;

            if (this.shouldSave) {
              await PipelineVariableService.updateValue(
                this.pipeline.getId(),
                destination,
                result,
                {
                  blockId: this.blockId,
                  scope: variableDestination.getScope(),
                  type: variableDestination.getType(),
                },
                { sensitive: this.pipeline.containsSecret(result) }
              );
            }
          }
        }
      }
    }

    // ---------------------------------------------
    // Events and Logs
    // ---------------------------------------------

    const correlationId = this.task.getCorrelationId();

    const displayParams = await this.buildDisplayParams(action);

    const changedVariables = this.variables
      .filter((v) => v.getValue() !== beforeValues.get(v.getName()))
      .map((v) => ({
        name: v.getName(),
        value: isNonSerializableVariableType(v.getType()) ? null : v.getValue(),
      }));

    coreEvents.emit(`action:${correlationId}`, {
      name: `${action.group}.${action.name}`,
      // displayParams already redacts by variable identity (only actually
      // secret variables), so no additional value-based pass here — that
      // would re-redact any non-secret variable whose value merely happens
      // to match a secret's value elsewhere in the pipeline.
      params: displayParams,
      result: this.buildDisplayResult(result, action.getParamsPlain(), displayParams),
      destination: action.getDestination() || null,
      changedVariables,
      pipelineIdentifier: this.pipeline.getIdentifier(),
      id: action.id,
      identifier: action.identifier,
      taskIdentifier: this.task.getIdentifier(),
      ...(this.servedFromCache ? { cached: true, cachedAt: this.servedFromCache.createdAt } : {}),
    });

    return result;
  }

  /**
   * Runs the step — or, when it has a `cache` setting and a fresh result is stored for
   * these exact resolved params, returns that instead (packages/schemas/src/cache.ts
   * says which steps can be cached). A successful result that's plain data is stored
   * for the next run. Only the execution is skipped: the result still goes to the
   * destination, the step is still recorded and reported, marked as cached.
   */
  private async executeOrServeFromCache(action: Action): Promise<unknown> {
    this.servedFromCache = null;
    const mode = this.task.getCacheMode();
    const ttl = action.cache ? parseTtl(action.cache.ttl) : null;
    const key =
      ttl && mode !== 'bypass' ? stepCacheKey(action, action.getParams(), action.cache?.key) : null;
    if (!key || !ttl) return await action.execute(this.task, this.lastResult);

    if (mode === 'use') {
      const hit = await CacheService.get(key, ttl).catch((error) => {
        console.warn(`[Block] cache read failed for ${action.group}.${action.name}:`, error);
        return null;
      });
      if (hit) {
        this.servedFromCache = { createdAt: hit.createdAt };
        return hit.value;
      }
    }

    const result = await action.execute(this.task, this.lastResult);

    // onError: continue turns a failure into undefined — never store that, nor
    // anything that isn't plain data (it couldn't come back as what it was).
    if (result !== undefined && canonicalJson(result) !== null) {
      await CacheService.set({
        key,
        kind: 'action',
        owner: this.task.getIdentifier() || null,
        label: `${action.group}.${action.name}`,
        value: result,
        ttlSeconds: ttl,
        sourcePipeline: this.pipeline.getIdentifier() || null,
      }).catch((error) => {
        console.warn(`[Block] cache write failed for ${action.group}.${action.name}:`, error);
      });
    }
    return result;
  }

  private async updateActionParams(action: Action) {
    // Always resolve from the pristine rawParams, never from the previous
    // params snapshot. This makes the action safe to execute multiple
    // times (retries, loop bodies) — each run sees a fresh resolution
    // against the current variable values.
    const fresh = safeClone(action.getRawParams());
    const getGlobalVar = await this.buildGlobalVarLookup(fresh, action);
    parseStepParams(action.group, fresh, this.variables, getGlobalVar, this.lastResult);
    action.setParams(fresh);
  }

  // Re-renders the action's raw (unresolved) params with secret variables
  // swapped for a placeholder before interpolation, so a secret's real value
  // never enters the broadcast text in the first place. This is identity-based
  // (which variable produced this text) rather than value-based, so a
  // non-secret variable that happens to share a secret's literal value is
  // never falsely redacted.
  private async buildDisplayParams(action: Action): Promise<any> {
    if (!this.variables.some((variable) => variable.isSecret())) {
      return action.getParamsPlain();
    }

    const fresh = safeClone(action.getRawParams());
    const displayVariables: Array<{ getName(): string; getValue(): unknown }> = this.variables.map(
      (variable) =>
        variable.isSecret()
          ? { getName: () => variable.getName(), getValue: (): unknown => '[REDACTED]' }
          : variable
    );
    const getGlobalVar = await this.buildGlobalVarLookup(fresh);
    parseStepParams(action.group, fresh, displayVariables, getGlobalVar, this.lastResult);
    return fresh;
  }

  // Some actions (e.g. system.message) return one of their own resolved
  // param values verbatim as the result. If that's the case here, reuse the
  // matching field from the already identity-redacted displayParams instead
  // of a blind value scan — that scan can't tell "this text came from a
  // secret variable" from "this text just happens to equal a secret's value
  // elsewhere", which is exactly how a non-secret variable gets falsely
  // redacted. Anything that isn't a direct echo still falls back to the
  // value scan as a best-effort safety net (it has no template to re-render).
  private buildDisplayResult(result: unknown, realParams: any, displayParams: any): unknown {
    if (result !== null && result !== undefined && realParams && typeof realParams === 'object') {
      for (const key of Object.keys(realParams)) {
        if (realParams[key] === result) return displayParams?.[key];
      }
    }
    return this.redactSecrets(result);
  }

  // A global that doesn't exist would read as empty and fail later, if at all, with an
  // error about the field instead of the global. With onError: continue the step goes
  // ahead as before: its author has said it may fail.
  private assertGlobalsExist(action: Action, params: any, known: Map<string, unknown>) {
    if (action.onError === 'continue') return;
    const missing = globalsReadByStep(action.group, params)
      .filter((name) => !known.has(name))
      .map((name) => `"${name}"`);
    if (missing.length === 1) {
      throw new Error(`Global variable ${missing[0]} doesn't exist. Create it on the Variables page.`);
    }
    if (missing.length) {
      throw new Error(`Global variables ${missing.join(', ')} don't exist. Create them on the Variables page.`);
    }
  }

  // Only hits the DB if the params actually reference {{ _global.* }} or {= _global.* =}.
  // Given the step about to run, it also stops that step if a global it reads is missing.
  private async buildGlobalVarLookup(
    params: any,
    action?: Action
  ): Promise<((name: string) => any) | undefined> {
    if (!params || !JSON.stringify(params).includes('_global.')) return undefined;
    const records = await GlobalVariableService.getAll();
    const map = new Map(records.map((r: any) => [r.name, r.value ?? '']));
    if (action) this.assertGlobalsExist(action, params, map);
    return (name: string) => map.get(name) ?? '';
  }

  private getVariableByName(name: string) {
    return this.variables.find((variable) => variable.getName() === name);
  }

  // Strips resolved secret-variable values out of anything about to be
  // broadcast to the UI (action params/results, error messages) — those
  // values come from env/global lookups and must never reach the renderer
  // in plain text, even inside a larger interpolated string.
  private redactSecrets<T>(data: T): T {
    const secretValues = this.variables
      .filter((variable) => variable.isSecret())
      .map((variable) => variable.getValue())
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (secretValues.length === 0) return data;

    const redactString = (str: string) =>
      secretValues.reduce((acc, secret) => acc.split(secret).join('[REDACTED]'), str);

    const redactDeep = (value: any): any => {
      if (typeof value === 'string') return redactString(value);
      if (Array.isArray(value)) return value.map(redactDeep);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)]));
      }
      return value;
    };

    return redactDeep(data);
  }

  public setLastResult(lastResult: unknown) {
    this.lastResult = lastResult;
  }

  public getLastResult() {
    return this.lastResult;
  }

  public getBlockId() {
    return this.blockId;
  }
}
