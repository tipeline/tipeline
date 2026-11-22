import { buildPluginSchema, getValidation } from '@tipeline/schemas';
import type { PluginParamDef } from '@tipeline/types';
import { TaskService } from '@database/services/TaskService';
import { WorkflowUsageService } from '@database/services/WorkflowUsageService';
import { PluginReturnsRegistry } from '@/plugin/PluginReturnsRegistry';
import { readableValidationError } from '@utils/readableError';

/** What a plugin package exports, as far as checking workflows against it goes. */
export interface PluginDefinition {
  group: string;
  version?: string;
  actions: Record<string, unknown>;
  params?: Record<string, PluginParamDef[]>;
  rules?: Record<string, any[]>;
  returns?: Record<string, string>;
}

/** A step that uses one of the plugin's actions, found in a saved workflow. */
export interface PluginStep {
  /** The action's name inside the plugin group. */
  action: string;
  /** "3", or "3.2" for the second step inside step 3 (a loop or a condition). */
  position: string;
  params: Record<string, unknown>;
  destination?: unknown;
}

export type PluginStepProblemKind = 'action_removed' | 'invalid_settings' | 'setting_removed' | 'result_changed';

export interface PluginStepProblem {
  workflow: { identifier: string; name: string };
  position: string;
  action: string;
  kind: PluginStepProblemKind;
  /** The validation message, the removed setting names, or "old → new" for a result type. */
  detail?: string;
}

export interface PluginUsage {
  workflows: { identifier: string; name: string; steps: number }[];
  /** Apps that run one of those workflows. */
  apps: string[];
  /** Schedules that run one of those workflows. */
  schedules: number;
}

const parse = (source: unknown): any => {
  if (!source) return null;
  if (typeof source === 'object') return source;
  try {
    return JSON.parse(String(source));
  } catch {
    return null;
  }
};

/**
 * A step without `source: 'plugin'` whose group and name are also a core action runs the
 * core action (see ActionFactory.actionTypeIsKnown), so it isn't the plugin's.
 */
function isCoreStep(step: any): boolean {
  if (step.source === 'plugin') return false;
  try {
    getValidation(step.group, step.name, 'creation');
    return true;
  } catch {
    return false;
  }
}

/** Every step in a workflow source that uses the plugin group, including nested ones. */
export function pluginStepsIn(source: unknown, group: string): PluginStep[] {
  const steps: PluginStep[] = [];
  const walk = (actions: unknown, prefix: string) => {
    if (!Array.isArray(actions)) return;
    actions.forEach((step: any, index) => {
      const position = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      if (step?.group === group && typeof step.name === 'string' && !isCoreStep(step)) {
        steps.push({
          action: step.name,
          position,
          params: step.params && typeof step.params === 'object' ? step.params : {},
          destination: step.destination,
        });
      }
      walk(step?.params?.actions, position);
      if (Array.isArray(step?.params?.statements)) {
        for (const statement of step.params.statements) walk(statement?.actions, position);
      }
    });
  };
  walk(parse(source)?.pipeline?.actions, '');
  return steps;
}

async function workflowsUsing(group: string) {
  const tasks = await TaskService.getAllWithSource();
  return tasks
    .map((task) => ({ identifier: task.identifier, name: task.name, steps: pluginStepsIn(task.source, group) }))
    .filter((task) => task.steps.length > 0);
}

/** The workflows with steps from the plugin, and the apps and schedules that run them. */
export async function pluginUsage(group: string): Promise<PluginUsage> {
  const workflows = await workflowsUsing(group);
  const usage = await WorkflowUsageService.usageOf(workflows.map((w) => w.identifier));
  const apps = new Set<string>();
  let schedules = 0;
  for (const entry of usage.values()) {
    entry.apps.forEach((app) => apps.add(app.name));
    schedules += entry.schedules.length;
  }
  return {
    workflows: workflows.map((w) => ({ identifier: w.identifier, name: w.name, steps: w.steps.length })),
    apps: [...apps].sort(),
    schedules,
  };
}

/** What would stop working in one step if the plugin were replaced by `next`. */
export function stepProblems(
  step: PluginStep,
  next: PluginDefinition,
  previousReturns: Record<string, string> | undefined
): { kind: PluginStepProblemKind; detail?: string }[] {
  if (!next.actions || !(step.action in next.actions)) return [{ kind: 'action_removed' }];

  const problems: { kind: PluginStepProblemKind; detail?: string }[] = [];
  const defs = next.params?.[step.action];
  // An action without param definitions accepts anything, now and at run time.
  if (Array.isArray(defs)) {
    const result = buildPluginSchema(defs, next.rules?.[step.action]).safeParse(step.params);
    if (!result.success) {
      problems.push({ kind: 'invalid_settings', detail: readableValidationError(JSON.stringify(result.error.issues)) });
    }
    const known = new Set(defs.map((d) => d.name));
    const removed = Object.keys(step.params).filter((name) => !known.has(name));
    if (removed.length) problems.push({ kind: 'setting_removed', detail: removed.join(', ') });
  }

  // Only a step that keeps its result can be hurt by a different kind of result.
  const before = previousReturns?.[step.action];
  const after = next.returns?.[step.action];
  if (step.destination && before && after && before !== 'any' && after !== 'any' && before !== after) {
    problems.push({ kind: 'result_changed', detail: `${before} → ${after}` });
  }
  return problems;
}

/**
 * Checks every saved workflow step that uses `group` against a new version of the plugin,
 * before it replaces the installed one. `group` is the installed plugin's: a new version
 * that renamed its group leaves every one of those steps without an action.
 */
export async function pluginUpdateProblems(group: string, next: PluginDefinition): Promise<PluginStepProblem[]> {
  const definition = next.group === group ? next : { ...next, actions: {} };
  const previousReturns = PluginReturnsRegistry[group];
  const problems: PluginStepProblem[] = [];
  for (const workflow of await workflowsUsing(group)) {
    for (const step of workflow.steps) {
      for (const problem of stepProblems(step, definition, previousReturns)) {
        problems.push({
          workflow: { identifier: workflow.identifier, name: workflow.name },
          position: step.position,
          action: `${group}.${step.action}`,
          ...problem,
        });
      }
    }
  }
  return problems;
}

/** One line per problem, for an error message and the CLI. */
export function describeProblems(problems: PluginStepProblem[]): string {
  const KIND_TEXT: Record<PluginStepProblemKind, string> = {
    action_removed: 'action no longer exists',
    invalid_settings: 'settings no longer valid',
    setting_removed: 'settings no longer exist',
    result_changed: 'result type changed',
  };
  return problems
    .map(
      (p) =>
        `${p.workflow.name}, step ${p.position} (${p.action}): ${KIND_TEXT[p.kind]}${p.detail ? ` — ${p.detail}` : ''}`
    )
    .join('\n');
}
