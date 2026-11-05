import { Action } from '@action/Action';
import { Variable } from '@/variable/Variable';
import { Block } from '@pipeline/Block';
import { Task } from '@task/Task';
import { PipelineRunnerService } from '@database/services/PipelineRunnerService';
import { PipelineBlockService } from '@database/services/PipelineBlockService';
import { PipelineService } from '@database/services/PipelineService';
import { coreEvents } from '@engine/CoreEvents';
import { DebugController } from '@engine/DebugController';
import { isNonSerializableVariableType } from '@utils/nonSerializableTypes';
import { ApprovalPendingSignal, ApprovalRejectedSignal, RunCanceledSignal } from '@utils/errors';

export class Pipeline {
  private actions: Array<Action>;
  private variables: Array<Variable>;
  private id: number;
  private identifier: string;
  private task: Task;
  private currentBlockId: number;
  // How a run ended other than completed/failed: waiting for an approval, or canceled
  // (an approval was rejected, or someone canceled the run). Reported on taskEnd as
  // `status`.
  private endStatus: 'paused' | 'canceled' | 'failed' | null = null;
  private currentActionPosition: number;

  constructor(task: Task) {
    this.task = task;
    this.actions = [];
    this.variables = [];
    this.id = 0;
    this.identifier = '';
    this.currentBlockId = 0;
    this.currentActionPosition = 0;
  }

  public addAction(action: Action) {
    this.actions.push(action);
  }

  public setActions(actions: Action[]) {
    this.actions = actions;
  }

  public setVariables(variables: Variable[]) {
    this.variables = variables;
  }

  public addVariables(newVars: Variable[]) {
    this.variables = [...this.variables, ...newVars];
  }

  public getVariables() {
    return this.variables;
  }

  public getIdentifier() {
    return this.identifier;
  }

  public getId() {
    return this.id;
  }

  /** Whether a value holds a secret variable's value, even inside longer text. */
  public containsSecret(value: unknown): boolean {
    const text = JSON.stringify(value);
    if (text === undefined) return false;
    return this.variables.some((variable) => {
      const secret = variable.isSecret() ? variable.getValue() : null;
      return typeof secret === 'string' && secret.length > 0 && text.includes(JSON.stringify(secret).slice(1, -1));
    });
  }

  public getVariableByName(name: string) {
    return this.variables.find((variable) => variable.getName() === name);
  }

  /**
   * Called by Block before each action executes so that flow actions
   * (if/else, loops, etc.) know their parent context when creating child blocks.
   */
  public setCurrentContext(blockId: number, actionPosition: number) {
    this.currentBlockId = blockId;
    this.currentActionPosition = actionPosition;
  }

  public getCurrentContext(): [number, number] {
    return [this.currentBlockId, this.currentActionPosition];
  }

  /**
   * Creates a child pipeline_block for the current action (e.g. a loop iteration
   * or a conditional branch) and returns a ready-to-run Block instance.
   *
   * Pass iteration = null for one-shot branches (if/else/switch).
   * Pass iteration = i for loops so each iteration gets its own DB row.
   *
   * No-ops (returns a plain Block with blockId=0) when shouldSave is false.
   */
  public async createChildBlock(
    actions: Action[],
    iteration: number | null = null,
    metadata?: any
  ): Promise<Block> {
    if (!this.task.getShouldSave()) {
      return new Block(actions, this.task, 0);
    }

    const childBlockRecord = await PipelineBlockService.startBlock(
      this.id,
      actions.filter((a) => !a.disabled).map((a) => a.identifier),
      this.currentBlockId,
      this.currentActionPosition,
      iteration,
      metadata
    );

    return new Block(actions, this.task, childBlockRecord.id);
  }

  /**
   * Final values of the variables the caller asked for (Task.getRequestedOutputs),
   * or undefined when none were requested. Private and secret variables are never
   * reported — the same rule subtask.exec applies to `outputs` read by a parent —
   * and values are JSON-cloned since they cross a worker thread and IPC (live
   * handles such as browser sessions come back as null).
   */
  private collectOutputs(): Record<string, unknown> | undefined {
    const names = this.task.getRequestedOutputs();
    if (!names) return undefined;
    const outputs: Record<string, unknown> = {};
    for (const name of names) {
      const variable = this.getVariableByName(name);
      if (!variable || variable.isSecret() || variable.getVisibility() === 'private') continue;
      try {
        const json = JSON.stringify(variable.getValue());
        outputs[name] = json === undefined ? null : JSON.parse(json);
      } catch {
        outputs[name] = null;
      }
    }
    return outputs;
  }

  /**
   * taskStart's payload; a sub-workflow's also names the run and step that started it.
   * In the debugger a sub-workflow also sends the values it starts with (the props it
   * was given), for the variables column — later changes come with each step's event.
   */
  private startEvent() {
    const parent = this.task.getParentRun();
    const debugged =
      this.task.getCallStack().length > 0 && DebugController.isDebugging(this.task.getCorrelationId());
    return {
      name: this.task.getName(),
      description: this.task.getDescription(),
      pipelineIdentifier: this.getIdentifier(),
      taskIdentifier: this.task.getIdentifier(),
      ...(parent ? { parent } : {}),
      ...(debugged
        ? {
            variables: this.variables.map((v) => ({
              name: v.getName(),
              value: v.isSecret() || isNonSerializableVariableType(v.getType()) ? null : v.getValue(),
            })),
          }
        : {}),
    };
  }

  private async cleanup(): Promise<void> {
    await Promise.all(this.variables.map((variable) => variable.cleanup()));
  }

  private async executeBlock(blockId: number): Promise<void> {
    const block = new Block(this.actions, this.task, blockId);
    await block.run();
  }

  /**
   * Resumes an interrupted pipeline. Reuses the existing pipeline record (by ID),
   * flips its status back to 'running', then re-executes all blocks — Block.run()
   * skips actions that are already 'completed' in the DB.
   */
  /** An approval was rejected (onReject: stop): the run ends as canceled, saying why. */
  private async cancelForRejection(pipelineId: number, rejection: ApprovalRejectedSignal) {
    this.endStatus = 'canceled';
    await PipelineService.updateStatus(pipelineId, 'canceled', {
      finishedAt: new Date(),
      metadata: { reason: 'approval_rejected', message: rejection.message },
    });
  }

  /**
   * Someone canceled the run (or pressed Stop while debugging): it ends as canceled,
   * saying who. A sub-workflow passes the signal up so its parent stops as well; a
   * top-level run ends normally — canceling isn't a failure.
   */
  private async cancelForRequest(pipelineId: number, signal: RunCanceledSignal) {
    this.endStatus = 'canceled';
    if (pipelineId) {
      await PipelineService.updateStatus(pipelineId, 'canceled', {
        finishedAt: new Date(),
        metadata: {
          reason: 'user_canceled',
          message: signal.message,
          canceledBy: signal.canceledBy,
        },
      });
    }
    if (this.task.isAwaitedByParent()) throw signal;
  }

  async resume(pipelineId: number, pipelineIdentifier: string) {
    this.id = pipelineId;
    this.identifier = pipelineIdentifier;

    await PipelineService.updateStatus(pipelineId, 'running');

    const correlationId = this.task.getCorrelationId();

    coreEvents.emit(`taskStart:${correlationId}`, this.startEvent());

    try {
      const rootBlock = await PipelineBlockService.startBlock(
        pipelineId,
        this.actions.filter((a) => !a.disabled).map((a) => a.identifier),
        null,
        null
      );

      await this.executeBlock(rootBlock.id);
      await PipelineService.updateStatus(pipelineId, 'completed', { finishedAt: new Date() });
    } catch (error: any) {
      if (error instanceof ApprovalPendingSignal) {
        this.endStatus = 'paused';
        await PipelineService.updateStatus(pipelineId, 'paused');
        return;
      }
      if (error instanceof ApprovalRejectedSignal) {
        await this.cancelForRejection(pipelineId, error);
        return;
      }
      if (error instanceof RunCanceledSignal) {
        await this.cancelForRequest(pipelineId, error);
        return;
      }
      this.endStatus = 'failed';
      await PipelineService.updateStatus(pipelineId, 'failed', {
        finishedAt: new Date(),
        metadata: { reason: 'action_error', message: error?.message ?? String(error) },
      });
      throw error;
    } finally {
      const outputs = this.collectOutputs();
      await this.cleanup();
      coreEvents.emit(`taskEnd:${correlationId}`, {
        name: this.task.getName(),
        pipelineIdentifier: this.getIdentifier(),
        taskIdentifier: this.task.getIdentifier(),
        ...(outputs ? { outputs } : {}),
        ...(this.endStatus ? { status: this.endStatus } : {}),
      });
    }
  }

  async runClean() {
    this.id = 0;
    this.identifier = '';

    const correlationId = this.task.getCorrelationId();

    coreEvents.emit(`taskStart:${correlationId}`, this.startEvent());

    try {
      // No DB persistence — blockId 0 is a sentinel for shouldSave=false paths
      await this.executeBlock(0);
    } catch (error: any) {
      if (error instanceof RunCanceledSignal) {
        await this.cancelForRequest(0, error);
        return;
      }
      this.endStatus = 'failed';
      throw error;
    } finally {
      const outputs = this.collectOutputs();
      await this.cleanup();
      coreEvents.emit(`taskEnd:${correlationId}`, {
        name: this.task.getName(),
        pipelineIdentifier: this.getIdentifier(),
        taskIdentifier: this.task.getIdentifier(),
        ...(outputs ? { outputs } : {}),
        ...(this.endStatus ? { status: this.endStatus } : {}),
      });
    }
  }

  async run() {
    const trigger = this.task.getTrigger();
    const parent = this.task.getParentRun();
    const pipelineRecord = await PipelineRunnerService.startPipeline(
      this.task.getIdentifier(),
      this.variables,
      trigger || parent
        ? { ...(trigger ? { trigger } : {}), ...(parent ? { parent } : {}) }
        : undefined
    );

    this.id = pipelineRecord.id;
    this.identifier = pipelineRecord.identifier;

    const rootBlock = await PipelineBlockService.startBlock(
      pipelineRecord.id,
      this.actions.filter((a) => !a.disabled).map((a) => a.identifier),
      null,
      null
    );

    const correlationId = this.task.getCorrelationId();

    coreEvents.emit(`taskStart:${correlationId}`, this.startEvent());

    try {
      await this.executeBlock(rootBlock.id);
      await PipelineService.updateStatus(pipelineRecord.id, 'completed', {
        finishedAt: new Date(),
      });
    } catch (error: any) {
      // Waiting for an approval isn't a failure: the run pauses and the job ends
      // normally; deciding resumes it (Core.approvalDecide).
      if (error instanceof ApprovalPendingSignal) {
        this.endStatus = 'paused';
        await PipelineService.updateStatus(pipelineRecord.id, 'paused');
        return;
      }
      if (error instanceof ApprovalRejectedSignal) {
        await this.cancelForRejection(pipelineRecord.id, error);
        return;
      }
      if (error instanceof RunCanceledSignal) {
        await this.cancelForRequest(pipelineRecord.id, error);
        return;
      }
      this.endStatus = 'failed';
      await PipelineService.updateStatus(pipelineRecord.id, 'failed', {
        finishedAt: new Date(),
        metadata: { reason: 'action_error', message: error?.message ?? String(error) },
      });
      throw error;
    } finally {
      const outputs = this.collectOutputs();
      await this.cleanup();
      coreEvents.emit(`taskEnd:${correlationId}`, {
        name: this.task.getName(),
        pipelineIdentifier: this.getIdentifier(),
        taskIdentifier: this.task.getIdentifier(),
        ...(outputs ? { outputs } : {}),
        ...(this.endStatus ? { status: this.endStatus } : {}),
      });
    }
  }
}
