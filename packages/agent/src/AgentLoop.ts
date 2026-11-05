import type { McpClient } from '@/McpClient';
import { explainModelError } from '@/errors';
import { proposalFromChoice, requestKey, type ChoiceMemory } from '@/choices';
import { instructionsSection, type AgentInstructions } from '@/instructions';
import type {
  AgentOutcome,
  ChoiceOption,
  ChatMessage,
  LLMProvider,
  ReusedWorkflow,
  RunProposal,
  ToolCall,
  ToolDefinition,
  WorkflowSummary,
} from '@/types';

const MAX_TOOL_ROUNDS = 8;

/** MCP tools the agent may use. Running a workflow is the user's decision, so `exec_task` is not one of them. */
const AGENT_MCP_TOOLS = ['search_workflows'];

export const PROPOSE_RUN_TOOL: ToolDefinition = {
  name: 'propose_run',
  description:
    'Suggest running one workflow found with search_workflows. Nothing runs yet: the user sees a form ' +
    'with your values filled in, fills in the rest and confirms. Call this once, with your best match.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: { type: 'string', description: 'The workflow identifier from search_workflows.' },
      variables: {
        type: 'object',
        description:
          'Input values read from the request, keyed by input name. Leave out inputs the request gives no value for.',
        additionalProperties: true,
      },
      alternatives: {
        type: 'array',
        items: { type: 'string' },
        description: 'Identifiers of up to 3 other workflows that could also fit, best first.',
      },
      message: { type: 'string', description: 'One short sentence for the user about what you picked.' },
      schedule: {
        type: 'string',
        description:
          'Only when the request says when or how often it should run on its own ("every 40 seconds", "every day at ' +
          '9am", "every weekday at 8:30", "tomorrow at 8am"): that timing in plain English. The user is then offered ' +
          'a schedule for it instead of one run now. Leave it out when the request gives no timing.',
      },
    },
    required: ['identifier', 'variables', 'message'],
  },
};

export const ASK_CHOICE_TOOL: ToolDefinition = {
  name: 'ask_choice',
  description:
    'Ask the user which workflow they mean, when two to four found with search_workflows fit the request ' +
    "about equally and the request doesn't say which. The user picks one and then sees its form.",
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'One short question, e.g. "Which deployment do you mean?"' },
      identifiers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Identifiers from search_workflows of the workflows that fit, 2 to 4, best first.',
      },
      variables: {
        type: 'object',
        description: 'Input values read from the request, keyed by input name, for whichever workflow is picked.',
        additionalProperties: true,
      },
      schedule: {
        type: 'string',
        description:
          'Only when the request says when or how often it should run on its own ("every 40 seconds", "every day at ' +
          '9am", "every weekday at 8:30", "tomorrow at 8am"): that timing in plain English. The user is then offered ' +
          'a schedule for it instead of one run now. Leave it out when the request gives no timing.',
      },
    },
    required: ['question', 'identifiers'],
  },
};

export const NO_MATCH_TOOL: ToolDefinition = {
  name: 'no_match',
  description:
    'Say that no workflow found with search_workflows does what the request asks, and describe the workflow that ' +
    'would, so the user can have it drafted. Use only for requests to do something, not for questions.',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'One or two sentences for the user: nothing does this yet.' },
      draftRequest: {
        type: 'string',
        description:
          'The smallest workflow that does exactly this request, for whoever writes it: its inputs (with the ' +
          'values from the request), what it does, and what it returns. One to three sentences. Do not add ' +
          'options, modes or outputs the request did not ask for: "Hello world to uppercase" is one text input ' +
          'and one upper-case step, not a choice of cases. Describe each part by what it does ("reads this ' +
          'computer\'s system information"), not as "run workflow X", so it can still be built when a workflow ' +
          'is not installed. Put the workflows that do parts in reuse, not here; never write an identifier here. ' +
          'Describe one run only: when or how often it runs ("every 30 seconds", "every day at 9") goes in ' +
          'schedule, never here.',
      },
      schedule: {
        type: 'string',
        description:
          'Only when the request says when or how often it should run on its own: that timing in plain English, ' +
          'e.g. "every 30 seconds", "every day at 9am", "every weekday at 8:30", "tomorrow at 8am". Tipeline runs ' +
          'the workflow on this schedule, so the workflow itself never repeats or waits for it. Leave it out ' +
          'when the request gives no timing.',
      },
      reuse: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Identifiers from search_workflows of workflows that each do part of the request, so the new workflow ' +
          'runs them as steps instead of rebuilding them. Judge by the description and outputs, not the name. ' +
          'A workflow whose value the rest needs must return it as an output. Empty when none do.',
      },
    },
    required: ['message', 'draftRequest'],
  },
};

export interface AgentLoopConfig {
  mcpClient: McpClient;
  provider: LLMProvider;
  systemPrompt?: string;
  /** Called immediately before each tool call is handled. */
  onToolCall?: (call: ToolCall) => void;
  /** The date the model resolves "April" or "last week" against. Defaults to now. */
  now?: Date;
  /** Names the provider in error messages, e.g. "DeepSeek". */
  providerLabel?: string;
  /** What the user picked before for each kind of request; settles a "which one?" without asking. */
  rememberedChoices?: ChoiceMemory;
  /** What the user told the assistant once: general and for the project the request comes from. */
  instructions?: AgentInstructions;
}

export function defaultSystemPrompt(now: Date): string {
  // The local calendar day: toISOString() would give tomorrow's date late in the evening west of UTC.
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return [
    `You help people use Tipeline, a workflow automation app. Today is ${today}.`,
    '',
    'To act on a request:',
    '1. Call search_workflows with a few keywords from the request.',
    '2. If a workflow fits, call propose_run with its identifier and the input values the request gives.',
    "   Match each value to the input's type and description. A date input gets an ISO date (YYYY-MM-DD);",
    '   "April" means April of the current year unless the request says otherwise. A string input follows',
    "   the format its description asks for, and otherwise keeps the user's wording.",
    '   A workflow fits when its inputs can take the values the request gives. A value named in its',
    '   description or used as an input default is only a default: one that saves "systemInfo.txt"',
    '   with a file path input also saves "systemInfo2.txt".',
    '   Leave out inputs the request gives no value for. The user fills them in.',
    '   Prefer an installed workflow. One with a `hub` field is not installed yet: propose it only when',
    '   no installed workflow fits. The user is asked to install it first.',
    '   If two to four workflows fit about equally and the request does not say which (e.g. "run the',
    '   deployment" with both "Deploy app" and "Deploy website"), call ask_choice instead of guessing.',
    '   Only call propose_run when one workflow clearly fits better than the rest.',
    "   A workflow's outputs say what it returns: use them to tell apart workflows that sound alike.",
    '   Never propose or offer a workflow marked helper: true. It only fetches data or looks something',
    '   up for other workflows; propose the workflow that answers the request with that data.',
    '3. You cannot run or install workflows. The user reviews the form and runs it.',
    '   When the request says when or how often it should run on its own ("every 40 seconds", "every',
    '   day at 9am", "tomorrow at 8"), pass that timing as schedule with propose_run or ask_choice: the',
    '   user is offered a schedule instead of a run. Never call no_match only because of the timing.',
    '4. If no workflow fits a request to do something, call no_match with a short message and a',
    '   description of the workflow that would do it. Never invent an identifier.',
    '   A request that needs several workflows together (e.g. "get the PHP and MySQL versions and email',
    '   them") has no single fit: search for each part, then call no_match with the workflows that do',
    '   the parts in reuse, so the new workflow runs them as steps. List one only when its description',
    '   says it does that part (a name alone is not enough) and, when a later part needs its result,',
    '   it returns that result as an output.',
    '',
    'If the message is a question rather than a task, answer it briefly.',
  ].join('\n');
}

/**
 * Runs one prompt until the model either answers in text or proposes a run.
 * The model only sees `search_workflows` and `propose_run`; a proposal ends the
 * loop and goes back to the caller, which shows it to the user.
 */
export async function runAgent(config: AgentLoopConfig, prompt: string): Promise<AgentOutcome> {
  const { mcpClient, provider } = config;
  const mcpTools = (await mcpClient.listTools()).filter((tool) => AGENT_MCP_TOOLS.includes(tool.name));
  // A Core built before search_workflows existed would leave the model unable to find anything.
  if (!mcpTools.some((tool) => tool.name === 'search_workflows')) {
    throw new Error('Tipeline Core is out of date for the assistant. Restart Core (tipeline stop, then tipeline start) and try again.');
  }
  const tools = [...mcpTools, PROPOSE_RUN_TOOL, ASK_CHOICE_TOOL, NO_MATCH_TOOL];
  const key = requestKey(prompt);
  // Every workflow search results have shown, so a proposal can be checked and filled in.
  const seen = new Map<string, WorkflowSummary>();

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        (config.systemPrompt ?? defaultSystemPrompt(config.now ?? new Date())) +
        instructionsSection(config.instructions),
    },
    { role: 'user', content: prompt },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await provider.chat(messages, tools).catch((error) => {
      throw explainModelError(error, config.providerLabel ?? 'The AI provider');
    });

    if (!result.toolCalls || result.toolCalls.length === 0) {
      return { kind: 'answer', text: result.text ?? '(no response)', requestKey: key };
    }

    messages.push({ role: 'assistant', content: result.text ?? '', toolCalls: result.toolCalls, raw: result.raw });

    for (const call of result.toolCalls) {
      config.onToolCall?.(call);

      if (call.name === PROPOSE_RUN_TOOL.name) {
        const picked = seen.get(String(call.arguments.identifier ?? ''));
        if (picked?.helper) {
          messages.push({ role: 'tool', toolCallId: call.id, content: helperError(picked.name) });
          continue;
        }
        const proposal = buildProposal(call.arguments, seen);
        if (proposal) {
          const message = typeof call.arguments.message === 'string' ? call.arguments.message : '';
          return withSchedule({ kind: 'proposal', text: message, proposal, requestKey: key }, call.arguments.schedule);
        }
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: `Error: "${call.arguments.identifier}" is not a workflow from search_workflows. Search first and use an identifier it returned.`,
        });
        continue;
      }

      if (call.name === NO_MATCH_TOOL.name) {
        const message = typeof call.arguments.message === 'string' ? call.arguments.message : '';
        const draftRequest = typeof call.arguments.draftRequest === 'string' ? call.arguments.draftRequest.trim() : '';
        const schedule = typeof call.arguments.schedule === 'string' ? call.arguments.schedule.trim() : '';
        return {
          kind: 'nomatch',
          text: message || 'No workflow does this yet.',
          draftRequest: draftRequest || prompt,
          ...(schedule ? { schedule } : {}),
          reuse: reusedWorkflows(call.arguments.reuse, seen, draftRequest),
          requestKey: key,
        };
      }

      if (call.name === ASK_CHOICE_TOOL.name) {
        const outcome = buildChoice(call.arguments, seen, key, config.rememberedChoices ?? {});
        if (outcome) return withSchedule(outcome, call.arguments.schedule);
        const helpers = (Array.isArray(call.arguments.identifiers) ? call.arguments.identifiers : [])
          .map((identifier: unknown) => seen.get(String(identifier)))
          .filter((workflow: WorkflowSummary | undefined): workflow is WorkflowSummary => !!workflow?.helper);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content:
            helpers.length > 0
              ? helperError(helpers.map((w: WorkflowSummary) => w.name).join('", "'))
              : 'Error: none of those identifiers came from search_workflows. Search first and use identifiers it returned.',
        });
        continue;
      }

      let output: string;
      try {
        output = await mcpClient.callTool(call.name, call.arguments);
        if (call.name === 'search_workflows') rememberWorkflows(output, seen);
      } catch (error: any) {
        output = `Error: ${error.message ?? String(error)}`;
      }
      messages.push({ role: 'tool', content: output, toolCallId: call.id });
    }
  }

  return { kind: 'answer', text: 'Stopped after too many tool-call rounds without a final answer.', requestKey: key };
}

function helperError(name: string): string {
  return (
    `Error: "${name}" is a helper: other workflows run it for its data, so it is not offered as a run. ` +
    'Propose a workflow that answers the request. If none does, call no_match and list the helper in reuse.'
  );
}

/** Adds the timing the request gave, if any: the caller then offers a schedule instead of a run. */
function withSchedule<T extends AgentOutcome>(outcome: T, schedule: unknown): T {
  const when = typeof schedule === 'string' ? schedule.trim() : '';
  return when ? { ...outcome, schedule: when } : outcome;
}

/**
 * The workflows to reuse that the search really returned, once each; made-up
 * identifiers are dropped. A searched workflow the description names (by identifier,
 * or by its name in quotes) is added too: models sometimes name one there and forget
 * to list it, and only the list offers to install it.
 */
export function reusedWorkflows(
  identifiers: unknown,
  seen: Map<string, WorkflowSummary>,
  draftRequest = ''
): ReusedWorkflow[] {
  const named = [...seen.values()]
    .filter((w) => draftRequest.includes(w.identifier) || new RegExp(`["“]${escapeRegExp(w.name)}["”]`).test(draftRequest))
    .map((w) => w.identifier);
  const listed = Array.isArray(identifiers) ? identifiers.map(String) : [];
  const reuse: ReusedWorkflow[] = [];
  for (const identifier of new Set([...listed, ...named])) {
    const workflow = seen.get(identifier);
    if (!workflow) continue;
    reuse.push({ identifier, name: workflow.name, ...(workflow.hub ? { hub: workflow.hub } : {}) });
  }
  return reuse;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rememberWorkflows(output: string, seen: Map<string, WorkflowSummary>) {
  try {
    const parsed = JSON.parse(output);
    const list: WorkflowSummary[] = Array.isArray(parsed) ? parsed : (parsed?.workflows ?? []);
    for (const workflow of list) {
      if (workflow?.identifier) seen.set(workflow.identifier, { ...workflow, inputs: workflow.inputs ?? [] });
    }
  } catch {
    // Not JSON: nothing to remember, and the model still sees the text.
  }
}

export function buildProposal(
  args: Record<string, any>,
  seen: Map<string, WorkflowSummary>
): RunProposal | null {
  const workflow = seen.get(String(args.identifier ?? ''));
  if (!workflow || workflow.helper) return null;

  // Only keep values for inputs the workflow has: anything else would be ignored by the run.
  const inputNames = new Set(workflow.inputs.map((input) => input.name));
  const raw = args.variables && typeof args.variables === 'object' ? args.variables : {};
  const variables = Object.fromEntries(Object.entries(raw).filter(([name]) => inputNames.has(name)));

  const alternatives = (Array.isArray(args.alternatives) ? args.alternatives : [])
    .map((identifier: unknown) => seen.get(String(identifier)))
    .filter((alt): alt is WorkflowSummary => !!alt && !alt.helper && alt.identifier !== workflow.identifier)
    .slice(0, 3)
    .map((alt) => ({ identifier: alt.identifier, name: alt.name, ...(alt.hub ? { hub: alt.hub } : {}) }));

  return {
    identifier: workflow.identifier,
    name: workflow.name,
    variables,
    inputs: workflow.inputs,
    alternatives,
    ...(workflow.hub ? { hub: workflow.hub } : {}),
  };
}

/**
 * Turns an ask_choice call into the question for the user — or straight into a
 * proposal when only one option is real, or when the user picked one of these
 * options for the same kind of request before (the others stay as alternatives).
 */
export function buildChoice(
  args: Record<string, any>,
  seen: Map<string, WorkflowSummary>,
  key: string,
  memory: ChoiceMemory
): AgentOutcome | null {
  const ids: string[] = Array.isArray(args.identifiers) ? args.identifiers.map(String) : [];
  const options: ChoiceOption[] = [...new Set(ids)]
    .map((identifier) => seen.get(identifier))
    .filter((workflow): workflow is WorkflowSummary => !!workflow && !workflow.helper)
    .slice(0, 4)
    .map((workflow) => ({
      identifier: workflow.identifier,
      name: workflow.name,
      ...(workflow.description ? { description: workflow.description } : {}),
      inputs: workflow.inputs,
      ...(workflow.hub ? { hub: workflow.hub } : {}),
    }));
  if (options.length === 0) return null;

  const variables = args.variables && typeof args.variables === 'object' ? args.variables : {};
  const remembered = key ? memory[key] : undefined;
  if (options.length === 1 || (remembered && options.some((o) => o.identifier === remembered.identifier))) {
    const pick = options.length === 1 ? options[0].identifier : remembered!.identifier;
    const proposal = proposalFromChoice(options, pick, variables, options.length > 1);
    return proposal ? { kind: 'proposal', text: '', proposal, requestKey: key } : null;
  }

  const question = typeof args.question === 'string' && args.question ? args.question : 'Which one do you mean?';
  return { kind: 'choice', text: question, options, variables, requestKey: key };
}
