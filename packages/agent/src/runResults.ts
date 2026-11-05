import type { LLMProvider, OutputDetail, RunResult, WorkflowInput } from '@/types';
import { explainModelError } from '@/errors';

/** How much of a run's outputs the model gets to read when it writes the answer. */
export const OUTPUT_CHAR_BUDGET = 4000;

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  );
}

/** Required inputs that still have no value once the proposal's values and the defaults are applied. */
export function missingInputs(inputs: WorkflowInput[], values: Record<string, unknown>): WorkflowInput[] {
  return inputs.filter((input) => input.required && isEmpty(values[input.name] ?? input.default));
}

function shrink(value: unknown, limits: { string: number; items: number; depth: number }, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > limits.string
      ? `${value.slice(0, limits.string)}… (${value.length - limits.string} more characters)`
      : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= limits.depth) return Array.isArray(value) ? `[${value.length} items]` : '{…}';
  if (Array.isArray(value)) {
    const head = value.slice(0, limits.items).map((item) => shrink(item, limits, depth + 1));
    return value.length > limits.items ? [...head, `… ${value.length - limits.items} more items`] : head;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, shrink(item, limits, depth + 1)])
  );
}

/**
 * A copy of the outputs small enough to send to the model: long text is cut,
 * long lists keep their first items, deep objects are folded. Tighter limits are
 * tried until it fits; the last resort only names each output and its type.
 */
export function compactOutputs(outputs: Record<string, unknown>, budget = OUTPUT_CHAR_BUDGET): Record<string, unknown> {
  const steps = [
    { string: 1000, items: 20, depth: 4 },
    { string: 300, items: 5, depth: 3 },
    { string: 100, items: 3, depth: 2 },
  ];
  for (const limits of steps) {
    const compact = shrink(outputs, limits) as Record<string, unknown>;
    if (JSON.stringify(compact).length <= budget) return compact;
  }
  return Object.fromEntries(
    Object.entries(outputs).map(([key, value]) => [
      key,
      Array.isArray(value) ? `[${value.length} items]` : typeof value === 'object' && value ? '{…}' : typeof value,
    ])
  );
}

const SUMMARY_SYSTEM_PROMPT = [
  'You tell someone how the workflow they asked for went.',
  'Answer their request in 2 to 4 short sentences, using the outputs. Bold the one or two key figures.',
  "Don't list every output: the app shows them all under your answer.",
  'outputDetails says what an output means (its label and description, e.g. its unit), and description is the',
  "workflow's own description: use them to read the values right, e.g. 46.1 in an output described as millions.",
  'If the run failed, say what went wrong in plain words and suggest one next step.',
  'Only use values that appear in the outputs. Some outputs may be cut short; never guess the rest.',
].join('\n');

/** Asks the model for a short answer to the original request, written from the run's outputs. */
export async function summarizeRun(
  provider: LLMProvider,
  input: { prompt: string; workflowName: string; result: RunResult; providerLabel?: string }
): Promise<string> {
  const { prompt, workflowName, result } = input;
  const report = {
    request: prompt,
    workflow: workflowName,
    ...(result.description ? { description: result.description } : {}),
    status: result.status,
    seconds: Math.round(result.durationMs / 100) / 10,
    ...(result.error ? { error: result.error } : {}),
    outputs: compactOutputs(result.outputs ?? {}),
    ...(result.outputDetails && Object.keys(result.outputDetails).length > 0
      ? { outputDetails: result.outputDetails }
      : {}),
  };
  const reply = await provider.chat(
    [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(report) },
    ],
    []
  ).catch((error) => {
    throw explainModelError(error, input.providerLabel ?? 'The AI provider');
  });
  return reply.text?.trim() ?? '';
}

function isDetails(value: unknown): value is Record<string, OutputDetail> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Reads `exec_task`'s JSON reply. */
export function parseRunResult(text: string): RunResult {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && typeof parsed.status === 'string') {
      return {
        status: parsed.status,
        pipelineIdentifier: parsed.pipelineIdentifier ?? '',
        durationMs: Number(parsed.durationMs) || 0,
        outputs: parsed.outputs ?? {},
        ...(isDetails(parsed.outputDetails) ? { outputDetails: parsed.outputDetails } : {}),
        ...(typeof parsed.description === 'string' && parsed.description ? { description: parsed.description } : {}),
        ...(parsed.error ? { error: String(parsed.error) } : {}),
      };
    }
  } catch {
    // Older Core: plain text reply.
  }
  return { status: 'failed', pipelineIdentifier: '', durationMs: 0, outputs: {}, error: text };
}
