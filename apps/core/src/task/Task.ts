import { Pipeline } from '@pipeline/Pipeline';
import { ActionFactory } from '@/action/ActionFactory';
import { Variable } from '@variable/Variable';
import { GlobalVariableService } from '@database/services/GlobalVariableService';
import { assertPropsVisibility } from '@utils/assertPropsVisibility';
import type { CacheMode } from '@tipeline/schemas';
import type { ParentRun } from '@engine/runner/IJobRunner';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class Task {
  private id: number | null;
  private name: string;
  private description: string;
  private pipeline: Pipeline;
  private identifier: string;
  private correlationId: string;
  private shouldSave: boolean;
  private filePath: string | null;
  private callStack: string[];
  // Variable names whose final values are reported on taskEnd (see Pipeline.collectOutputs).
  private requestedOutputs: string[] | null;
  // Stored on the pipeline record (see Pipeline.run) — e.g. the app that started it.
  private trigger: Record<string, unknown> | null;

  constructor() {
    this.id = null;
    this.name = '';
    this.description = '';
    this.pipeline = new Pipeline(this);
    this.identifier = '';
    this.correlationId = '';
    this.shouldSave = false;
    this.filePath = null;
    this.callStack = [];
    this.requestedOutputs = null;
    this.trigger = null;
  }

  setName(name: string) {
    this.name = name;
  }

  getName() {
    return this.name;
  }

  setId(id: number | null) {
    this.id = id;
  }

  setIdentifier(identifier: string) {
    this.identifier = identifier;
  }

  getIdentifier() {
    return this.identifier;
  }

  getPipeline() {
    return this.pipeline;
  }

  getCorrelationId() {
    return this.correlationId;
  }

  getShouldSave() {
    return this.shouldSave;
  }

  setShouldSave(flag: boolean) {
    this.shouldSave = flag;
  }

  setFilePath(filePath: string) {
    this.filePath = filePath;
  }

  getFilePath(): string | null {
    return this.filePath;
  }

  setCorrelationId(correlationId: string) {
    this.correlationId = correlationId;
  }

  getCallStack(): string[] {
    return this.callStack;
  }

  setCallStack(stack: string[]): void {
    this.callStack = stack;
  }

  // True for a sub-workflow its parent runs and waits for (subtask.exec without async):
  // it can't stop for an approval, since its parent would carry on without it.
  private awaitedByParent = false;

  isAwaitedByParent(): boolean {
    return this.awaitedByParent;
  }

  setAwaitedByParent(value: boolean): void {
    this.awaitedByParent = value;
  }

  // How this run uses the result cache: 'bypass' runs everything without reading or
  // writing it, 'refresh' runs everything and replaces what's stored.
  private cacheMode: CacheMode = 'use';

  getCacheMode(): CacheMode {
    return this.cacheMode;
  }

  setCacheMode(mode: CacheMode | undefined): void {
    this.cacheMode = mode ?? 'use';
  }

  getRequestedOutputs() {
    return this.requestedOutputs;
  }

  setRequestedOutputs(names: string[] | null) {
    this.requestedOutputs = names;
  }

  getTrigger() {
    return this.trigger;
  }

  setTrigger(trigger: Record<string, unknown> | null) {
    this.trigger = trigger;
  }

  // A sub-workflow's caller (subtask.exec): stored on the pipeline record and sent on
  // taskStart, so its run links back to the step that started it.
  private parentRun: ParentRun | null = null;

  getParentRun() {
    return this.parentRun;
  }

  setParentRun(parent: ParentRun | null) {
    this.parentRun = parent;
  }

  setDescription(description: string) {
    this.description = description;
  }

  getDescription() {
    return this.description;
  }

  async loadVariables(rawVariables: Array<any>) {
    const variables = await this.createVariables(rawVariables);
    this.pipeline.setVariables(variables);
  }

  async createVariables(rawVariables: Array<any>) {
    const variables = [];
    for (const raw of rawVariables) {
      raw.scope = 'task';
      if (raw.valueFromEnv) {
        raw.scope = 'env';
        // A value already present (e.g. a runtime override) takes precedence
        // over the environment default — only fall back to env when unset.
        // Falls back to null (not '') so a required-but-missing env var fails
        // fast with a clear error, same as the valueFromGlobal path below.
        if (raw.value === undefined) {
          raw.value = this.resolveEnvValue(raw.valueFromEnv, raw.valueFromEnvFile) ?? null;
        }
      } else if (raw.valueFromGlobal) {
        raw.scope = 'global';
        const record = await GlobalVariableService.getByName(raw.valueFromGlobal);
        if (raw.value === undefined) raw.value = record?.value ?? null;
        // Its value is as sensitive here as it is there: hidden in output, sealed in history.
        if (record?.secret) raw.secret = true;
      }
      variables.push(new Variable(raw));
    }

    return variables;
  }

  // Checks valueFromEnvFile (if given) before falling back to process.env —
  // lets a task pin its own env file instead of relying on the single shared
  // ~/.tipeline/.env or whatever happens to be set on the host process.
  private resolveEnvValue(key: string, filePath?: string): string | undefined {
    if (filePath) {
      const resolved = filePath.startsWith('~')
        ? path.join(os.homedir(), filePath.slice(1))
        : path.resolve(filePath);
      try {
        if (fs.existsSync(resolved)) {
          const parsed = dotenv.parse(fs.readFileSync(resolved));
          if (parsed[key] !== undefined) return parsed[key];
        }
      } catch (err) {
        console.warn(`[Task] Failed to read env file "${resolved}" for variable env key "${key}":`, err);
      }
    }
    return process.env[key];
  }

  async updateVariablesFromProps(props: Array<any>) {
    assertPropsVisibility(
      this.pipeline
        .getVariables()
        .map((v) => ({ name: v.getName(), visibility: v.getVisibility(), output: v.isOutput() })),
      props as unknown as Record<string, unknown>
    );

    for (const [key, value] of Object.entries(props)) {
      const variable = this.pipeline.getVariableByName(key);
      if (variable) {
        variable.setValue(value);
      }
    }
  }

  async updateVariablesFromRecords(records: Array<any>) {
    const newVariables = [];
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      let value: any;
      try {
        value = JSON.parse(record.value);
      } catch {
        value = record.value;
      }

      const variable = this.pipeline.getVariableByName(record.name);
      if (variable) {
        variable.setValue(value);
      } else {
        const newVarObject = {
          type: record.type,
          name: record.name,
          value,
          scope: record.scope,
          required: true,
        };
        newVariables.push(new Variable(newVarObject as any));
      }
    }

    this.pipeline.addVariables(newVariables);
  }

  async loadActions(rawActions: Array<any>) {
    const actions = await this.createActions(rawActions);
    this.pipeline.setActions(actions);
  }

  async createActions(rawActions: Array<any>) {
    console.log(`[Task] createActions: ${rawActions.length} actions`);
    rawActions.forEach((a, i) => console.log(`[Task]   [${i}] ${a.group}.${a.name}`));
    const actions = [];
    for (let i = 0; i < rawActions.length; i++) {
      const currentAction = rawActions[i];
      const previousAction = i > 0 ? rawActions[i - 1] : null;

      if (currentAction.name === 'elseIfConditional') {
        if (
          !previousAction ||
          (previousAction.name !== 'ifConditional' && previousAction.name !== 'elseIfConditional')
        ) {
          throw new Error(`elseIfConditional needs to be after ifConditional or elseIfConditional`);
        }
      } else if (currentAction.name === 'elseConditional') {
        if (
          !previousAction ||
          (previousAction.name !== 'ifConditional' && previousAction.name !== 'elseIfConditional')
        ) {
          throw new Error(`elseConditional needs to be after ifConditional or elseIfConditional`);
        }
      } else if (currentAction.name === 'caseConditional') {
        if (
          !previousAction ||
          (previousAction.name !== 'switchConditional' && previousAction.name !== 'caseConditional')
        ) {
          throw new Error(`caseConditional needs to be after switchConditional or caseConditional`);
        }
      } else if (currentAction.name === 'defaultConditional') {
        if (
          !previousAction ||
          (previousAction.name !== 'switchConditional' && previousAction.name !== 'caseConditional')
        ) {
          throw new Error(
            `defaultConditional needs to be after switchConditional or caseConditional`
          );
        }
      }

      actions.push(await ActionFactory.create(currentAction));
    }
    return actions;
  }

  async run() {
    await this.pipeline.run();
  }

  async runClean() {
    await this.pipeline.runClean();
  }

  async resume(pipelineId: number, pipelineIdentifier: string) {
    await this.pipeline.resume(pipelineId, pipelineIdentifier);
  }
}
