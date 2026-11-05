import type { ChoiceOption, RunProposal } from '@/types';

/**
 * Which workflow the user picked for a kind of request, keyed by `requestKey`.
 * Stored in Core's settings as JSON under CHOICE_MEMORY_SETTING, shared by the
 * Desktop app and the CLI. No AI SDK imports here: the renderer loads this file.
 */
export type ChoiceMemory = Record<string, { identifier: string; name: string; at: string }>;

export const CHOICE_MEMORY_SETTING = 'agent_choices';
const MEMORY_LIMIT = 200;

// Words that don't say which workflow is meant, on top of very short ones.
const FILLER = new Set([
  'the', 'and', 'for', 'from', 'with', 'please', 'can', 'could', 'you', 'run', 'start', 'launch', 'execute',
  'do', 'make', 'get', 'give', 'show', 'workflow', 'workflows', 'task', 'tasks', 'this', 'that', 'now',
  'again', 'want', 'need', 'would', 'like', 'let', 'our', 'my', 'your', 'some', 'one',
]);

// The same stemming Core's workflow search uses (apps/core/src/engine/WorkflowCatalog.ts).
const ENDINGS = /(ments?|ings?|ed|ations?|ions?)$/;
const MIN_STEM = 4;

function stem(word: string): string {
  const plain = word.replace(/ies$/, 'y').replace(/(?<=[^sui])s$/, '');
  const cut = plain.replace(ENDINGS, '');
  return cut.length >= MIN_STEM ? cut : plain;
}

/**
 * The words of a request that name what's wanted, stemmed so the same ask
 * phrased slightly differently ("run the deployment workflow", "deploy
 * please") gets the same key. Empty when nothing is left to remember by.
 */
export function requestKey(prompt: string): string {
  const words = (prompt.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length >= 3 && !FILLER.has(word))
    .map(stem);
  return [...new Set(words)].sort().join(' ');
}

export function parseChoiceMemory(raw: string | null | undefined): ChoiceMemory {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The memory with this pick added, keeping only the most recent MEMORY_LIMIT keys. */
export function rememberChoice(
  memory: ChoiceMemory,
  key: string,
  choice: { identifier: string; name: string },
  now = new Date()
): ChoiceMemory {
  if (!key) return memory;
  const next: ChoiceMemory = { ...memory, [key]: { identifier: choice.identifier, name: choice.name, at: now.toISOString() } };
  const keys = Object.keys(next);
  if (keys.length <= MEMORY_LIMIT) return next;
  const newest = keys.sort((a, b) => next[b].at.localeCompare(next[a].at)).slice(0, MEMORY_LIMIT);
  return Object.fromEntries(newest.map((k) => [k, next[k]]));
}

/** Turns one option of a "which one?" question into the proposal for it; the others become alternatives. */
export function proposalFromChoice(
  options: ChoiceOption[],
  identifier: string,
  variables: Record<string, unknown>,
  remembered = false
): RunProposal | null {
  const option = options.find((o) => o.identifier === identifier);
  if (!option) return null;
  const inputNames = new Set(option.inputs.map((input) => input.name));
  return {
    identifier: option.identifier,
    name: option.name,
    variables: Object.fromEntries(Object.entries(variables).filter(([name]) => inputNames.has(name))),
    inputs: option.inputs,
    alternatives: options
      .filter((o) => o.identifier !== identifier)
      .map((o) => ({ identifier: o.identifier, name: o.name, ...(o.hub ? { hub: o.hub } : {}) })),
    ...(option.hub ? { hub: option.hub } : {}),
    ...(remembered ? { remembered: true } : {}),
  };
}
