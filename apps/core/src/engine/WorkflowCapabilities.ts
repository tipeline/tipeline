import {
  CAPABILITIES,
  flatValidations,
  workflowCapabilities,
  type Capability,
} from '@tipeline/schemas';
import { TaskService } from '@database/services/TaskService';

export interface LabeledCapabilityStep {
  action: string;
  /** The step's name in the builder (e.g. "Remove"), or `group.name` for a plugin step. */
  label: string;
  workflow?: string;
}

export interface LabeledCapability {
  capability: Capability;
  review: boolean;
  steps: LabeledCapabilityStep[];
}

export interface CapabilityReport {
  capabilities: LabeledCapability[];
  unknownWorkflows: string[];
}

function parseSource(source: unknown): any {
  if (!source) return null;
  if (typeof source === 'object') return source;
  try {
    return JSON.parse(String(source));
  } catch {
    return null;
  }
}

const loadInstalled = async (identifier: string) => {
  const task: any = await TaskService.getByIdentifier(identifier);
  if (!task) return null;
  const source = parseSource(task.source);
  return source ? { ...source, name: source.name ?? task.name } : null;
};

type Loader = (identifier: string) => Promise<any>;

/**
 * What a workflow source can do, with each step named the way the builder names it.
 * Sub-workflows are looked up among the installed ones unless `loadWorkflow` says otherwise.
 */
export async function capabilityReport(
  source: unknown,
  loadWorkflow: Loader = loadInstalled
): Promise<CapabilityReport> {
  const result = await workflowCapabilities(parseSource(source), loadWorkflow);
  return {
    unknownWorkflows: result.unknownWorkflows,
    capabilities: result.capabilities.map((entry) => ({
      ...entry,
      steps: entry.steps.map((step) => ({
        ...step,
        label: flatValidations[step.action]?.runtime?.label ?? step.action,
      })),
    })),
  };
}

/**
 * What a set of workflows can do together, e.g. everything in a backup. Every step
 * names its workflow, and one reached twice (directly, and as another's
 * sub-workflow) is listed once. Sub-workflows are found in the set first.
 */
export async function combinedCapabilityReport(
  workflows: { identifier: string; name: string; source: unknown }[]
): Promise<CapabilityReport> {
  const byIdentifier = new Map(workflows.map((w) => [w.identifier, w]));
  const loadWorkflow: Loader = async (identifier) => {
    const own = byIdentifier.get(identifier);
    if (own) {
      const source = parseSource(own.source);
      return source ? { ...source, name: own.name } : null;
    }
    return await loadInstalled(identifier);
  };

  const found = new Map<
    Capability,
    { review: boolean; steps: Map<string, LabeledCapabilityStep> }
  >();
  const unknown = new Set<string>();
  for (const workflow of workflows) {
    const report = await capabilityReport(workflow.source, loadWorkflow);
    report.unknownWorkflows.forEach((name) => unknown.add(name));
    for (const entry of report.capabilities) {
      if (!found.has(entry.capability))
        found.set(entry.capability, { review: entry.review, steps: new Map() });
      const steps = found.get(entry.capability)!.steps;
      for (const step of entry.steps) {
        const named = { ...step, workflow: step.workflow ?? workflow.name };
        steps.set(`${named.action}\u0000${named.workflow}`, named);
      }
    }
  }
  return {
    capabilities: CAPABILITIES.filter((capability) => found.has(capability)).map((capability) => ({
      capability,
      review: found.get(capability)!.review,
      steps: [...found.get(capability)!.steps.values()],
    })),
    unknownWorkflows: [...unknown],
  };
}

/**
 * The same report, short enough for the assistant: each capability with the steps
 * that cause it, as `group.name` (and the sub-workflow they're in).
 */
export async function capabilitySummary(source: unknown) {
  const report = await capabilityReport(source);
  return report.capabilities.map((entry) => ({
    capability: entry.capability,
    review: entry.review,
    steps: [
      ...new Set(
        entry.steps.map((step) =>
          step.workflow ? `${step.action} (in ${step.workflow})` : step.action
        )
      ),
    ],
  }));
}

/**
 * Every installed workflow → what it can do, for filtering the Workflows list.
 * The sources are read once, so sub-workflows don't cost a query each.
 */
export async function capabilityIndex(): Promise<Record<string, Capability[]>> {
  const tasks = await TaskService.getAllWithSource();
  const sources = new Map(tasks.map((task) => [task.identifier, parseSource(task.source)]));
  const loadWorkflow: Loader = async (identifier) => sources.get(identifier) ?? null;
  const index: Record<string, Capability[]> = {};
  for (const task of tasks) {
    const result = await workflowCapabilities(sources.get(task.identifier), loadWorkflow);
    index[task.identifier] = result.capabilities.map((entry) => entry.capability);
  }
  return index;
}
