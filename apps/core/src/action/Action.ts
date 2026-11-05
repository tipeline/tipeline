import { ActionRegistry } from '@action/ActionRegistry';
import { PluginActionRegistry } from '@/plugin/PluginActionRegistry';
import { Task } from '@task/Task';
import { ActionError } from '@utils/ActionError';
import { ApprovalPendingSignal, ApprovalRejectedSignal, RunCanceledSignal } from '@utils/errors';
import { safeClone } from '@utils/safeClone';
import type { StepCacheConfig } from '@tipeline/schemas';
import { expandHomeInParams, expandsHomePaths } from '@utils/expandHome';

type OnError = 'throw' | 'continue';

export type ActionHandler = (
  params: any,
  task: Task,
  lastResult: any,
  action: Action
) => Promise<any>;

export interface ActionConfig {
  group: string;
  name: string;
  params: any;
  destination?: string;
  id?: number;
  identifier?: string;
  onError?: OnError;
  disabled?: boolean;
  source?: 'plugin';
  cache?: StepCacheConfig;
}

export class Action {
  id: number;
  identifier: string;
  group: string;
  name: string;
  // Present only on plugin actions — see ActionConfig.source.
  source?: 'plugin';
  // Working copy overwritten by Block before each execution with freshly resolved params.
  private params: any;
  // Pristine, deep-frozen source of truth. Never mutated — loops re-resolve
  // {= var =} / {{ var }} expressions from this on every iteration.
  private rawParams: any;
  destination: string;
  onError: OnError;
  disabled: boolean;
  // Reuse the result for a while when the step runs again with the same params
  // (looked up in Block.runAction).
  cache?: StepCacheConfig;

  constructor({
    group,
    name,
    params,
    destination = '',
    id = 0,
    identifier = '',
    onError = 'throw',
    disabled = false,
    source,
    cache,
  }: ActionConfig) {
    this.id = id;
    this.identifier = identifier;
    this.group = group;
    this.name = name;
    this.source = source;
    this.rawParams = Action.deepFreeze(safeClone(params));
    this.params = safeClone(params);
    this.destination = destination;
    this.onError = onError;
    this.disabled = disabled;
    this.cache = cache;
  }

  async execute(task: Task, lastResult: any) {
    // "~/Documents/x.txt" means the home folder, as in a terminal; Node won't expand it.
    // Done on the resolved params so it also covers paths that come from variables.
    if (expandsHomePaths(this.group, this.name, this.source)) {
      this.params = expandHomeInParams(this.params);
    }
    console.log(`[Action] execute: ${this.group}.${this.name}`, this.params);
    const group =
      this.source === 'plugin'
        ? PluginActionRegistry[this.group]
        : ActionRegistry[this.group] ?? PluginActionRegistry[this.group];
    if (!group) throw new Error(`Unknown group ${this.group}`);

    const action = group[this.name];
    if (!action) throw new Error(`Unknown action ${this.group}.${this.name}`);

    try {
      // The 4th argument (this) lets loop handlers re-resolve rawParams on
      // every iteration. Non-loop handlers can ignore it.
      return await action(this.params, task, lastResult, this);
    } catch (error: any) {
      // Not failures: the run stops here until someone decides, or ends because they
      // rejected it (see approval.request), or someone canceled it.
      // Passed through unwrapped — also by enclosing flow actions — so Block/Pipeline
      // can pause the run, and never swallowed by onError: continue.
      if (
        error instanceof ApprovalPendingSignal ||
        error instanceof ApprovalRejectedSignal ||
        error instanceof RunCanceledSignal
      ) {
        throw error;
      }
      if (this.onError === 'continue') return undefined;
      throw ActionError.fromCaught(this.group, this.name, error);
    }
  }

  getParams() {
    return this.params;
  }

  // Called by Block with a freshly resolved clone before each execution.
  // Do not pass rawParams directly — it is frozen.
  setParams(params: any) {
    this.params = params;
  }

  getRawParams() {
    return this.rawParams;
  }

  /** New settings for this step, edited in the debugger while the run goes on. */
  setRawParams(params: any) {
    this.rawParams = Action.deepFreeze(safeClone(params));
  }

  // Recursively keeps plain arrays/objects (e.g. `{= arr =}` params) but replaces
  // non-serializable values (functions, class instances like Knex connections or
  // browser handles) with null, safe for IPC/event serialization (worker
  // postMessage uses structured clone).
  private static toPlainValue(value: any): any {
    if (value === null || value === undefined || typeof value !== 'object') {
      return typeof value === 'function' ? null : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => Action.toPlainValue(item));
    }
    if (value instanceof Date) {
      return value;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return null;
    }
    const plain: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      plain[key] = Action.toPlainValue(item);
    }
    return plain;
  }

  getParamsPlain() {
    if (!this.params || typeof this.params !== 'object') {
      return this.params;
    }

    const plain: Record<string, any> = {};
    for (const [key, value] of Object.entries(this.params)) {
      plain[key] = Action.toPlainValue(value);
    }
    return plain;
  }

  getName(): string {
    return this.name;
  }

  getGroup(): string {
    return this.group;
  }

  getDestination(): string {
    return this.destination;
  }

  // Object.freeze is shallow; this recurses into every nested value.
  // isFrozen guard prevents infinite loops on circular references.
  private static deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    Object.freeze(obj);
    for (const key of Reflect.ownKeys(obj as object)) {
      const value = (obj as any)[key];
      if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Action.deepFreeze(value);
      }
    }
    return obj;
  }
}
