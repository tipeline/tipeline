import type { AssistantChoiceOption, AssistantProposal, AssistantRunResult } from '@tipeline/client';
import { runInputs, type RunInput, type WorkflowVariable } from './workflows';

/**
 * The Assistant's proposals as the phone's run form. The inputs come from the search
 * (public and protected: what a caller may set), filled with the values the Assistant read
 * from the request, else each input's default.
 */
export function proposalInputs(proposal: AssistantProposal): RunInput[] {
  const variables: WorkflowVariable[] = proposal.inputs.map((input) => ({
    type: input.type,
    name: input.name,
    label: input.label,
    description: input.description,
    required: input.required,
    // The search already left out what a caller may not set.
    visibility: 'public',
    value: Object.prototype.hasOwnProperty.call(proposal.variables, input.name)
      ? proposal.variables[input.name]
      : input.default,
  }));
  return runInputs({ pipeline: { variables } });
}

/**
 * One option of a "which one?" question as a proposal; the others become alternatives.
 * (The same as proposalFromChoice in @tipeline/agent, which the phone can't load.)
 */
export function proposalFromOption(
  options: AssistantChoiceOption[],
  identifier: string,
  variables: Record<string, unknown> = {}
): AssistantProposal | null {
  const option = options.find((o) => o.identifier === identifier);
  if (!option) return null;
  const names = new Set(option.inputs.map((input) => input.name));
  return {
    identifier: option.identifier,
    name: option.name,
    variables: Object.fromEntries(Object.entries(variables).filter(([name]) => names.has(name))),
    inputs: option.inputs,
    alternatives: options
      .filter((o) => o.identifier !== identifier)
      .map((o) => ({ identifier: o.identifier, name: o.name, ...(o.hub ? { hub: o.hub } : {}) })),
    ...(option.hub ? { hub: option.hub } : {}),
  };
}

export interface ResultOutput {
  name: string;
  label: string;
  description?: string;
  value: unknown;
}

/** A finished run's outputs, labelled the way the workflow names them. */
export function resultOutputs(result: AssistantRunResult | undefined): ResultOutput[] {
  if (!result?.outputs) return [];
  return Object.entries(result.outputs).map(([name, value]) => {
    const detail = result.outputDetails?.[name];
    return { name, label: detail?.label || name, ...(detail?.description ? { description: detail.description } : {}), value };
  });
}

/** "820 ms", "4.8 s", "2 min 5 s". */
export function durationText(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}
