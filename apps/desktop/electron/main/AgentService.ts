import { ipcMain, BrowserWindow } from 'electron';
import {
  McpClient,
  createProvider,
  draftWorkflow,
  parseRunResult,
  PROVIDER_LABELS,
  runAgent,
  summarizeRun,
  type AgentInstructions,
  type ChoiceMemory,
  type ProviderName,
  type ReusedWorkflow,
  type ToolCall,
} from '@tipeline/agent';
import { generateIdentifier } from '@tipeline/utils';
import { SEND, CORE } from './utils/ipc-channels';
import { CoreService } from './utils/CoreService';

/**
 * Runs `@tipeline/agent` from the main process — it needs outbound network access
 * (Core's MCP endpoint, the configured LLM provider's API) and API keys that
 * shouldn't live in the renderer. Both steps are fire-and-forget from the renderer
 * (ipcRenderer.send), with phase updates pushed back on `agent:<correlationId>`:
 *
 * 1. AGENT_PROMPT — the model searches the workflows and answers in text, asks
 *    which of a few workflows is meant, or proposes a run (`answer` / `choice` /
 *    `proposal`). Nothing runs at this step.
 * 2. AGENT_RUN — after the user confirms the proposal's form: runs the workflow
 *    through MCP `exec_task`, then asks the model to answer the original request
 *    from the run's public outputs (`task_running` → `run_finished` → `done`).
 *
 * 3. AGENT_DRAFT — when nothing fits and the user asks for one: the model writes
 *    a workflow and Core saves it as a draft (`draft_progress` → `drafted`).
 *
 * Each turn is also persisted to Core (agent_run table) via CoreService.localRequest —
 * always local, since the agent feature is local-workspace-only. Persistence failures
 * are logged and swallowed so they never interrupt the live flow.
 */
export class AgentService {
  private readonly window: BrowserWindow;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  init() {
    ipcMain.on(SEND.AGENT_PROMPT, (_, message: { correlationId: string; payload: AgentPromptPayload }) => {
      void this.prompt(message.correlationId, message.payload);
    });
    ipcMain.on(SEND.AGENT_RUN, (_, message: { correlationId: string; payload: AgentRunPayload }) => {
      void this.run(message.correlationId, message.payload);
    });
    ipcMain.on(SEND.AGENT_DRAFT, (_, message: { correlationId: string; payload: AgentDraftPayload }) => {
      void this.draft(message.correlationId, message.payload);
    });
  }

  private connect(config: AgentConnection) {
    return {
      mcpClient: new McpClient({ url: config.mcpUrl, token: config.mcpToken }),
      provider: createProvider({
        provider: config.provider,
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
      }),
      providerLabel: PROVIDER_LABELS[config.provider] ?? config.provider,
    };
  }

  private async prompt(correlationId: string, payload: AgentPromptPayload) {
    const send = (msg: Record<string, any>) => this.send(`agent:${correlationId}`, msg);
    await this.record(CORE.AGENT_RUN_CREATE, { correlationId, prompt: payload.prompt });

    try {
      const { mcpClient, provider, providerLabel } = this.connect(payload);
      send({ phase: 'thinking' });

      const outcome = await runAgent(
        {
          mcpClient,
          provider,
          providerLabel,
          rememberedChoices: payload.rememberedChoices ?? {},
          instructions: payload.instructions,
          onToolCall: (call: ToolCall) => {
            if (call.name === 'search_workflows') send({ phase: 'searching', query: call.arguments.query ?? '' });
          },
        },
        payload.prompt
      );

      if (outcome.kind === 'answer') {
        send({ phase: 'answer', text: outcome.text, requestKey: outcome.requestKey });
        void this.record(CORE.AGENT_RUN_COMPLETE, { correlationId, answer: outcome.text });
      } else if (outcome.kind === 'nomatch') {
        send({
          phase: 'nomatch',
          text: outcome.text,
          draftRequest: outcome.draftRequest,
          reuse: outcome.reuse,
          schedule: outcome.schedule,
          requestKey: outcome.requestKey,
        });
        void this.record(CORE.AGENT_RUN_COMPLETE, { correlationId, answer: outcome.text });
      } else if (outcome.kind === 'choice') {
        send({
          phase: 'choice',
          text: outcome.text,
          options: outcome.options,
          variables: outcome.variables,
          schedule: outcome.schedule,
          requestKey: outcome.requestKey,
        });
        void this.record(CORE.AGENT_RUN_MARK_PROPOSED, {
          correlationId,
          taskIdentifier: null,
          taskName: outcome.options.map((o) => o.name).join(' / '),
          answer: outcome.text,
        });
      } else {
        const { proposal } = outcome;
        send({ phase: 'proposal', text: outcome.text, proposal, schedule: outcome.schedule, requestKey: outcome.requestKey });
        void this.record(CORE.AGENT_RUN_MARK_PROPOSED, {
          correlationId,
          taskIdentifier: proposal.hub ? null : proposal.identifier,
          taskName: proposal.name,
          answer: outcome.text,
        });
      }
    } catch (error: any) {
      const message = error.message ?? String(error);
      send({ phase: 'error', error: message });
      void this.record(CORE.AGENT_RUN_FAIL, { correlationId, error: message });
    }
  }

  private async run(correlationId: string, payload: AgentRunPayload) {
    const send = (msg: Record<string, any>) => this.send(`agent:${correlationId}`, msg);
    const { identifier, name, variables, prompt } = payload;

    try {
      const { mcpClient, provider, providerLabel } = this.connect(payload);
      send({ phase: 'task_running', identifier });
      void this.record(CORE.AGENT_RUN_MARK_TASK_RUNNING, { correlationId, taskIdentifier: identifier });

      const { text } = await mcpClient.callToolRaw('exec_task', { identifier, variables });
      const result = parseRunResult(text);
      if (result.pipelineIdentifier) {
        void this.record(CORE.AGENT_RUN_SET_PIPELINE, {
          correlationId,
          pipelineIdentifier: result.pipelineIdentifier,
        });
      }
      send({ phase: 'run_finished', result });

      // The run card already shows everything exact; a failed summary only costs the sentence above it.
      const answer = await summarizeRun(provider, { prompt, workflowName: name, result, providerLabel }).catch((err) => {
        console.error('[AgentService] Summary failed:', err);
        return '';
      });
      send({ phase: 'done', answer, result });

      if (result.status === 'failed') {
        void this.record(CORE.AGENT_RUN_FAIL, { correlationId, error: result.error ?? 'Run failed' });
      } else {
        void this.record(CORE.AGENT_RUN_COMPLETE, { correlationId, answer: answer || result.status });
      }
    } catch (error: any) {
      const message = error.message ?? String(error);
      send({ phase: 'error', error: message });
      void this.record(CORE.AGENT_RUN_FAIL, { correlationId, error: message });
    }
  }

  /**
   * AGENT_DRAFT — after the user agrees to have a workflow written: the model
   * writes it and Core saves it as a draft (`draft_progress` → `drafted`). The
   * draft never runs from here; the user tests it in the builder.
   */
  private async draft(correlationId: string, payload: AgentDraftPayload) {
    const send = (msg: Record<string, any>) => this.send(`agent:${correlationId}`, msg);
    try {
      const { mcpClient, provider, providerLabel } = this.connect(payload);
      send({ phase: 'draft_progress', step: 'writing' });
      const outcome = await draftWorkflow(
        {
          mcpClient,
          provider,
          providerLabel,
          instructions: payload.instructions,
          onProgress: (step) => send({ phase: 'draft_progress', step }),
        },
        payload.request,
        { reuse: payload.reuse ?? [], acceptMissing: payload.acceptMissing ?? [], schedule: payload.schedule }
      );
      if (outcome.kind === 'drafted') {
        send({ phase: 'drafted', draft: outcome });
        void this.record(CORE.AGENT_RUN_MARK_PROPOSED, {
          correlationId,
          taskIdentifier: outcome.identifier,
          taskName: outcome.name,
          answer: `Drafted "${outcome.name}"`,
        }).then(() => this.record(CORE.AGENT_RUN_COMPLETE, { correlationId, answer: `Drafted "${outcome.name}"` }));
      } else if (outcome.kind === 'gap') {
        // Nothing was saved: the user decides whether to have the rest drafted.
        send({ phase: 'draft_gap', missing: outcome.missing, possible: outcome.possible });
        void this.record(CORE.AGENT_RUN_COMPLETE, {
          correlationId,
          answer: `Can't draft all of it: ${outcome.missing.join('; ')}`,
        });
      } else {
        send({ phase: 'draft_failed', text: outcome.text, errors: outcome.errors });
        void this.record(CORE.AGENT_RUN_FAIL, { correlationId, error: [outcome.text, ...outcome.errors].join('\n') });
      }
    } catch (error: any) {
      const message = error.message ?? String(error);
      send({ phase: 'error', error: message });
      void this.record(CORE.AGENT_RUN_FAIL, { correlationId, error: message });
    }
  }

  private async record(coreEvent: string, payload: Record<string, any>) {
    try {
      await CoreService.localRequest(coreEvent, { correlationId: generateIdentifier(), payload });
    } catch (err) {
      console.error(`[AgentService] Failed to record ${coreEvent}:`, err);
    }
  }

  private send(channel: string, data: any) {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, data);
    }
  }
}

interface AgentConnection {
  provider: ProviderName;
  apiKey: string;
  baseURL?: string;
  model?: string;
  mcpToken: string;
  mcpUrl: string;
}

interface AgentPromptPayload extends AgentConnection {
  prompt: string;
  /** What the user picked before per kind of request (settings `agent_choices`). */
  rememberedChoices?: ChoiceMemory;
  /** Global instructions plus those of the project the request was made from. */
  instructions?: AgentInstructions;
}

interface AgentDraftPayload extends AgentConnection {
  /** What the workflow should do; the no_match description, possibly edited by the user. */
  request: string;
  /** Workflows the draft should run as steps; ones still on a hub go on its to-do list. */
  reuse?: ReusedWorkflow[];
  /** Parts the user agreed to leave out after drafting stopped on them; the draft is marked incomplete. */
  acceptMissing?: string[];
  /** When it should run on its own ("every 30 seconds"); proposed with the draft, never built into it. */
  schedule?: string;
  /** The instructions the request was sent with. */
  instructions?: AgentInstructions;
}

interface AgentRunPayload extends AgentConnection {
  /** The request the run answers; the model writes its summary for it. */
  prompt: string;
  identifier: string;
  name: string;
  variables: Record<string, unknown>;
}
