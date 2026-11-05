import type { McpClient } from '@/McpClient';
import { explainModelError } from '@/errors';
import { instructionsSection, type AgentInstructions } from '@/instructions';
import type {
  ChatMessage,
  DraftOptions,
  DraftOutcome,
  LLMProvider,
  ToolCall,
  ToolDefinition,
  WorkflowSummary,
} from '@/types';

const MAX_ROUNDS = 20;
const MAX_SUBMITS = 3;

/** MCP tools the drafting model may use. It can read and check, but saving goes through submit_draft. */
const DRAFT_MCP_TOOLS = ['search_workflows', 'list_actions', 'describe_actions', 'check_workflow'];

export const SUBMIT_DRAFT_TOOL: ToolDefinition = {
  name: 'submit_draft',
  description:
    'Hand in the finished workflow. It is checked and saved as a draft for the user to test in the builder; ' +
    'if the check finds errors you get them back to fix. Run check_workflow first.',
  inputSchema: {
    type: 'object',
    properties: {
      yaml: { type: 'string', description: 'The whole workflow as YAML.' },
      summary: {
        type: 'string',
        description: 'What the workflow does, as 2 to 5 short Markdown bullet points, for the user.',
      },
      todos: {
        type: 'array',
        items: { type: 'string' },
        description:
          'What the user must still do before it works: global variables to create, placeholder values to replace, ' +
          'things to check. Empty when nothing is left.',
      },
      schedule: {
        type: 'string',
        description:
          'Only when the request says it should run on its own at certain times: when, in plain English or as a ' +
          'cron expression ("every day at 9am", "every weekday at 8:30", "every 15 minutes", "every monday at 7am", ' +
          '"tomorrow at 8am", "0 9 * * 1-5"). The user turns it on when they mark the draft ready. Leave it out ' +
          'when the request gives no timing.',
      },
    },
    required: ['yaml', 'summary', 'todos'],
  },
};

export const CANNOT_DO_TOOL: ToolDefinition = {
  name: 'cannot_do',
  description:
    "Stop before writing anything when part of the request can't be done with any action or installed workflow. " +
    "Nothing is saved: the user sees what's missing and decides whether to have the rest drafted. Never use it " +
    "because a workflow isn't installed (build that part from actions), or for something a command " +
    '(system.runApplication) on this computer could do, or a script (script.runScript) could work out from values ' +
    'earlier steps found.',
  inputSchema: {
    type: 'object',
    properties: {
      missing: {
        type: 'array',
        items: { type: 'string' },
        description: "Each part of the request that can't be done, and why, in one short sentence each.",
      },
      possible: {
        type: 'string',
        description: 'What a workflow without those parts would still do, in one sentence.',
      },
    },
    required: ['missing', 'possible'],
  },
};

/** What the caller shows while a draft is being written. */
export type DraftProgress = 'reading' | 'writing' | 'checking' | 'saving' | 'fixing';

export interface DraftLoopConfig {
  mcpClient: McpClient;
  provider: LLMProvider;
  providerLabel?: string;
  onProgress?: (step: DraftProgress) => void;
  /** What the user told the assistant once: general and for the project the request comes from. */
  instructions?: AgentInstructions;
}

export function draftSystemPrompt(guide: string): string {
  return [
    'You write Tipeline workflows for people. You never run them: what you write is saved as a draft',
    'that the person tests in the builder before it can run anywhere else.',
    '',
    'How to work:',
    '1. Call search_workflows for each part of the request ("PHP version", "send email"). When an',
    '   installed workflow already does a part, reuse it as a subtask.exec step (see "Reusing',
    '   workflows" in the guide), with props from its inputs and outputs from what it returns.',
    '   Reuse one only when its description says it does that part, not because of its name, and,',
    '   when a later step needs its result, only when it returns that result as an output.',
    '   Never invent an identifier.',
    '2. For the parts no workflow covers, call list_actions to see what exists and what each action',
    '   does, then describe_actions for the ones you plan to use. Its example step shows the shape:',
    '   take the values and variable names from the request, not from the example, and leave out',
    '   optional fields you don\'t need.',
    '3. Write the workflow following the guide below. Set author to "Tipeline Assistant"; Tipeline',
    '   replaces it with the person\'s name when it saves the draft.',
    '   Do exactly what the request asks and nothing more: no extra options, modes, branches,',
    '   checks or outputs it did not ask for.',
    '   Turn the values in the request into inputs with those values as defaults ("Hello world"',
    '   becomes a text input), but keep what the workflow does fixed ("to uppercase" is one',
    '   toUpperCase step, not a choice of cases).',
    '   The description says what the workflow does with its inputs, not their defaults: "Converts',
    '   text to upper case", not "Converts Hello world"; "writes it to the file you choose", not',
    '   "writes it to systemInfo.txt". Default values go in the inputs only.',
    '   Use the fewest steps: when one action does the job, the workflow has one step.',
    '   When it should run on its own ("every 30 seconds", "each Monday at 9", "tomorrow"), Tipeline',
    '   starts it on a schedule: the workflow does the work once, with no loop, wait or repeat for',
    '   the timing. Pass the timing as schedule in submit_draft. Leave the schedule out of the summary',
    '   and the to-do list: the user sees it on its own.',
    '4. Call check_workflow and fix every error. Fix warnings too unless you are sure they are fine.',
    '5. Call submit_draft with the YAML, a short summary and the to-do list. When check_workflow\'s',
    '   canAccess has an entry with review: true, the summary says so in plain words, naming what and',
    '   where: "It deletes the files it finds in Downloads", "It runs ffmpeg", "It connects to the',
    '   server over SSH".',
    '',
    'If part of the request can\'t be done with any action or installed workflow, call cannot_do before',
    'writing anything. Never hand in a workflow that leaves part of the request out, unless the request',
    'says the user agreed to leave that part out.',
    'A workflow that isn\'t installed is never a reason to stop, even when the request names it: build',
    'that part from actions. Anything a command on this computer can do can be done with',
    'system.runApplication. script.runScript only computes values in a sandbox (no require, files',
    'or network), so pair it with the actions that do the work.',
    '',
    guide,
  ].join('\n');
}

/** Models sometimes wrap YAML in a Markdown code fence; the checker needs the bare text. */
export function stripFence(yaml: string): string {
  const match = /^\s*```(?:ya?ml)?\s*\n([\s\S]*?)\n?```\s*$/i.exec(yaml);
  return (match ? match[1] : yaml).trim() + '\n';
}

/**
 * The request, plus the workflows it should reuse and any parts the user agreed to
 * leave out. Installed workflows are looked up now, with their inputs and outputs as
 * they are today, so the model doesn't search for them; ones that aren't installed
 * (still on a hub, deleted, drafts) are built from actions instead.
 */
export async function draftRequestMessage(
  mcpClient: McpClient,
  request: string,
  options: DraftOptions = {}
): Promise<string> {
  const reuse = options.reuse ?? [];
  const acceptMissing = options.acceptMissing ?? [];
  const schedule = options.schedule?.trim()
    ? `It will run on a schedule (${options.schedule.trim()}) that Tipeline starts it on. Write it to do ` +
      'the work once: no loop, wait or repeat for the timing.'
    : '';
  const agreed =
    acceptMissing.length > 0
      ? 'The user agreed to a workflow without these parts. Write the rest, and list each one in the ' +
        `to-do list:\n${acceptMissing.map((part) => `- ${part}`).join('\n')}`
      : '';
  if (reuse.length === 0) return [request, schedule, agreed].filter(Boolean).join('\n\n');

  let installed: Array<WorkflowSummary & { draft?: boolean }> = [];
  try {
    const parsed = JSON.parse(await mcpClient.callTool('list_tasks', {}));
    if (Array.isArray(parsed)) installed = parsed;
  } catch {
    // Without the list every workflow counts as not installed; the model can still search.
  }

  const found: WorkflowSummary[] = [];
  const missing: string[] = [];
  for (const workflow of reuse) {
    const match = workflow.hub ? undefined : installed.find((w) => w.identifier === workflow.identifier && !w.draft);
    if (match) {
      const { identifier, name, description, inputs, outputs } = match;
      found.push({ identifier, name, ...(description ? { description } : {}), inputs, ...(outputs ? { outputs } : {}) });
    } else {
      missing.push(workflow.name);
    }
  }

  const parts = [request];
  if (found.length > 0) {
    parts.push(
      'Workflows to reuse: run each as a subtask.exec step, with props from its inputs and outputs from ' +
        "what it returns. They're already looked up, so there's no need to search for them:\n" +
        JSON.stringify(found, null, 2)
    );
  }
  if (missing.length > 0) {
    parts.push(
      `Not installed, so build what these do from actions instead, even where the request names them, and ` +
        `say in the summary which parts are built from actions because the workflow isn't installed: ` +
        `${missing.join(', ')}.`
    );
  }
  if (schedule) parts.push(schedule);
  if (agreed) parts.push(agreed);
  return parts.join('\n\n');
}

function progressFor(call: ToolCall): DraftProgress {
  if (call.name === 'check_workflow') return 'checking';
  if (call.name === SUBMIT_DRAFT_TOOL.name || call.name === CANNOT_DO_TOOL.name) return 'saving';
  return 'reading';
}

/**
 * Writes a workflow for a request and saves it as a draft. The model reads the
 * authoring guide, the user's workflows (to reuse as sub-workflows) and the
 * action catalog, writes YAML, checks it, and hands it in;
 * a hand-in with errors comes back to it to fix, up to MAX_SUBMITS times.
 * `options.reuse` names workflows the request loop found for parts of the request.
 * When part of it can't be done the model stops before writing (`gap`); drafting again
 * with `options.acceptMissing` writes the rest, marked incomplete.
 */
export async function draftWorkflow(
  config: DraftLoopConfig,
  request: string,
  options: DraftOptions = {}
): Promise<DraftOutcome> {
  const { mcpClient, provider } = config;
  const label = config.providerLabel ?? 'The AI provider';

  const [guide, available, content] = await Promise.all([
    mcpClient.callTool('authoring_guide', {}),
    mcpClient.listTools(),
    draftRequestMessage(mcpClient, request, options),
  ]);
  const mcpTools = available.filter((tool) => DRAFT_MCP_TOOLS.includes(tool.name));
  if (mcpTools.length < DRAFT_MCP_TOOLS.length) {
    throw new Error('Tipeline Core is out of date for drafting. Restart Core (tipeline stop, then tipeline start) and try again.');
  }
  const acceptMissing = options.acceptMissing ?? [];
  // Once the user has agreed to leave parts out there's nothing left to stop for.
  const tools = [...mcpTools, SUBMIT_DRAFT_TOOL, ...(acceptMissing.length > 0 ? [] : [CANNOT_DO_TOOL])];

  const messages: ChatMessage[] = [
    { role: 'system', content: draftSystemPrompt(guide) + instructionsSection(config.instructions) },
    { role: 'user', content },
  ];

  let submits = 0;
  let lastErrors: string[] = [];
  config.onProgress?.('writing');

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await provider.chat(messages, tools).catch((error) => {
      throw explainModelError(error, label);
    });

    if (!result.toolCalls || result.toolCalls.length === 0) {
      // The model stopped without handing anything in: ask once more, plainly.
      messages.push({ role: 'assistant', content: result.text ?? '', raw: result.raw });
      messages.push({ role: 'user', content: 'Hand in the workflow with submit_draft when it passes check_workflow.' });
      continue;
    }

    messages.push({ role: 'assistant', content: result.text ?? '', toolCalls: result.toolCalls, raw: result.raw });

    for (const call of result.toolCalls) {
      config.onProgress?.(progressFor(call));

      if (call.name === SUBMIT_DRAFT_TOOL.name) {
        submits++;
        const yaml = stripFence(String(call.arguments.yaml ?? ''));
        let saved: any;
        try {
          // The schedule the request step read takes precedence over one the model hands in.
          const schedule =
            options.schedule?.trim() ||
            (typeof call.arguments.schedule === 'string' ? call.arguments.schedule.trim() : '');
          saved = JSON.parse(
            await mcpClient.callTool('create_draft_workflow', { yaml, ...(schedule ? { schedule } : {}) })
          );
        } catch (error: any) {
          saved = { created: false, errors: [error.message ?? String(error)] };
        }

        if (saved?.created) {
          return {
            kind: 'drafted',
            identifier: saved.identifier,
            name: saved.name,
            summary: typeof call.arguments.summary === 'string' ? call.arguments.summary : '',
            todos: Array.isArray(call.arguments.todos) ? call.arguments.todos.map(String).filter(Boolean) : [],
            warnings: Array.isArray(saved.warnings) ? saved.warnings : [],
            ...(saved.schedule ? { schedule: saved.schedule } : {}),
            ...(acceptMissing.length > 0 ? { incomplete: acceptMissing } : {}),
          };
        }

        lastErrors = Array.isArray(saved?.errors) ? saved.errors : ['The draft could not be saved.'];
        if (submits >= MAX_SUBMITS) {
          return {
            kind: 'failed',
            text: `Couldn't write a workflow that passes the checks after ${MAX_SUBMITS} tries.`,
            errors: lastErrors,
          };
        }
        config.onProgress?.('fixing');
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: `Not saved. Fix these and hand it in again:\n${lastErrors.map((e) => `- ${e}`).join('\n')}`,
        });
        continue;
      }

      if (call.name === CANNOT_DO_TOOL.name && acceptMissing.length === 0) {
        const missing = Array.isArray(call.arguments.missing)
          ? call.arguments.missing.map(String).map((m: string) => m.trim()).filter(Boolean)
          : [];
        if (missing.length > 0) {
          const possible = typeof call.arguments.possible === 'string' ? call.arguments.possible.trim() : '';
          return { kind: 'gap', missing, possible };
        }
        messages.push({ role: 'tool', toolCallId: call.id, content: "Error: list each part that can't be done in missing." });
        continue;
      }

      let output: string;
      if (DRAFT_MCP_TOOLS.includes(call.name)) {
        try {
          output = await mcpClient.callTool(call.name, call.arguments);
        } catch (error: any) {
          output = `Error: ${error.message ?? String(error)}`;
        }
      } else {
        output = `Error: "${call.name}" is not available while writing a workflow.`;
      }
      messages.push({ role: 'tool', toolCallId: call.id, content: output });
    }
  }

  return {
    kind: 'failed',
    text: 'Stopped before the workflow was finished.',
    errors: lastErrors,
  };
}
