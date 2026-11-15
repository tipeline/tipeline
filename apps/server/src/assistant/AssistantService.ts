import { randomUUID } from 'crypto';
import {
  createProvider,
  parseRunResult,
  PROVIDER_LABELS,
  rememberChoice,
  runAgent,
  summarizeRun,
  type AgentInstructions,
  type AgentOutcome,
  type LLMProvider,
  type RunResult,
} from '@tipeline/agent';
import type { User } from '../auth/AuthService.js';
import type { TaskOwnership } from '../ownership/TaskOwnershipService.js';
import { assistantConfigFrom, type AssistantConfig } from './assistantConfig.js';
import { IpcToolClient, type CoreRequester } from './IpcToolClient.js';
import type { AssistantHistoryService } from './AssistantHistoryService.js';

/** Commands the Server answers itself, never forwarded to Core. */
export const ASSISTANT_COMMANDS = new Set(['assistantAsk', 'assistantRun', 'assistantChoose', 'assistantHistory']);

/** A request is a page of text at most; the instructions have their own limit. */
export const PROMPT_MAX_LENGTH = 4000;

export const NOT_SET_UP =
  "The Assistant isn't set up on this Server yet: an admin adds an LLM key in Desktop's Settings → Assistant while connected to it.";

/** Where one request's answers go: the connection that sent it. */
export interface AssistantReply {
  /** Sends `{ event, correlationId, data | error }` to the asker. */
  send(message: { event: string; correlationId: string; data?: unknown; error?: string }): void;
  /** Routes a run's events to the asker and records who started it, before it starts. */
  beforeRun(runCorrelationId: string, taskIdentifier: string): void;
}

export interface AssistantDeps {
  core: CoreRequester;
  history: typeof AssistantHistoryService;
  getOwner(taskIdentifier: string): Promise<TaskOwnership | null>;
  /** Other users' private workflows: left out of everything the assistant sees for this user. */
  privateOwnedByOthers(userId: string): Promise<Set<string>>;
  /** Defaults to the real providers; tests pass a scripted one. */
  createProvider?(config: AssistantConfig): LLMProvider;
  /** Defaults to Date.now's date; the model resolves "last week" against it. */
  now?(): Date;
}

/**
 * The Assistant for the Server's users (the phone app first). The same request loop as
 * Desktop's (`@tipeline/agent`), with the Server's rules around it:
 *
 * - only editors and admins get here (WsGateway turns viewers away);
 * - the tools come over IPC (IpcToolClient) without other users' private workflows;
 * - the LLM key is the organization's, from the Server's Core settings, never the client's;
 * - a run is checked like any run the user starts, recorded as theirs, and streams to them;
 * - each request is kept with who asked: users list their own, admins everyone's.
 *
 * `assistantAsk` answers on `onAssistantAsk` with `{ phase, requestId, ... }` updates, ending
 * on `answer`, `nomatch`, `choice`, `proposal` or an error. `assistantRun` answers on
 * `onAssistantRun` (`task_running` → `run_finished` → `done`) with the run's own events
 * (onTaskStart, onAction…) on the same correlationId in between.
 */
export class AssistantService {
  constructor(private readonly deps: AssistantDeps) {}

  async handle(event: string, correlationId: string, payload: any, user: User, reply: AssistantReply): Promise<void> {
    const answerEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    const fail = (error: string) => reply.send({ event: answerEvent, correlationId, error });
    try {
      if (event === 'assistantAsk') return await this.ask(correlationId, payload ?? {}, user, reply);
      if (event === 'assistantRun') return await this.run(correlationId, payload ?? {}, user, reply);
      if (event === 'assistantChoose') {
        reply.send({ event: answerEvent, correlationId, data: await this.choose(payload ?? {}, user) });
        return;
      }
      if (event === 'assistantHistory') {
        reply.send({ event: answerEvent, correlationId, data: await this.historyFor(payload ?? {}, user) });
        return;
      }
      fail(`Unknown command: ${event}`);
    } catch (error: any) {
      fail(error?.message ?? String(error));
    }
  }

  private async ask(correlationId: string, payload: any, user: User, reply: AssistantReply) {
    const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
    if (!prompt) throw new Error('Type what you need first.');
    if (prompt.length > PROMPT_MAX_LENGTH) throw new Error(`Keep the request under ${PROMPT_MAX_LENGTH} characters.`);

    const settings = await this.deps.core.request<Record<string, unknown>>('settingsList', {});
    const config = assistantConfigFrom(settings);
    if (!config) throw new Error(NOT_SET_UP);

    const requestId = randomUUID();
    const phase = (data: Record<string, unknown>) =>
      reply.send({ event: 'onAssistantAsk', correlationId, data: { requestId, ...data } });

    await this.deps.history.create(requestId, user.id, prompt);
    phase({ phase: 'thinking' });

    try {
      const [hidden, rememberedChoices, instructions] = await Promise.all([
        this.hiddenFor(user),
        this.deps.history.getChoices(user.id),
        this.instructions(config, payload.projectIdentifier),
      ]);
      const outcome: AgentOutcome = await runAgent(
        {
          toolClient: new IpcToolClient(this.deps.core, hidden),
          provider: this.provider(config),
          providerLabel: PROVIDER_LABELS[config.provider] ?? config.provider,
          rememberedChoices,
          instructions,
          now: this.deps.now?.(),
          onToolCall: (call) => {
            if (call.name === 'search_workflows') phase({ phase: 'searching', query: call.arguments.query ?? '' });
          },
        },
        prompt
      );

      if (outcome.kind === 'answer') {
        phase({ phase: 'answer', text: outcome.text, requestKey: outcome.requestKey });
        await this.deps.history.update(requestId, { status: 'answered', answer: outcome.text });
      } else if (outcome.kind === 'nomatch') {
        // Drafting a workflow isn't offered on the Server yet: the text says nothing fits.
        phase({ phase: 'nomatch', text: outcome.text, schedule: outcome.schedule, requestKey: outcome.requestKey });
        await this.deps.history.update(requestId, { status: 'answered', answer: outcome.text });
      } else if (outcome.kind === 'choice') {
        phase({
          phase: 'choice',
          text: outcome.text,
          options: outcome.options,
          variables: outcome.variables,
          schedule: outcome.schedule,
          requestKey: outcome.requestKey,
        });
        await this.deps.history.update(requestId, {
          status: 'proposed',
          task_name: outcome.options.map((o) => o.name).join(' / '),
          answer: outcome.text,
        });
      } else {
        const { proposal } = outcome;
        phase({ phase: 'proposal', text: outcome.text, proposal, schedule: outcome.schedule, requestKey: outcome.requestKey });
        await this.deps.history.update(requestId, {
          status: 'proposed',
          task_identifier: proposal.hub ? null : proposal.identifier,
          task_name: proposal.name,
          answer: outcome.text,
        });
      }
    } catch (error: any) {
      const message = error?.message ?? String(error);
      reply.send({ event: 'onAssistantAsk', correlationId, data: { requestId }, error: message });
      await this.deps.history.update(requestId, { status: 'failed', error: message }).catch(() => {});
    }
  }

  /**
   * Runs the workflow the user confirmed for one of their requests, then has the model answer
   * the request from the run's outputs. Any workflow the user may run will do (they may have
   * picked an alternative): the checks are the ones a run from the workflow page gets.
   */
  private async run(correlationId: string, payload: any, user: User, reply: AssistantReply) {
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
    const identifier = typeof payload.identifier === 'string' ? payload.identifier : '';
    const variables = payload.variables && typeof payload.variables === 'object' && !Array.isArray(payload.variables)
      ? (payload.variables as Record<string, unknown>)
      : {};
    if (!identifier) throw new Error('Which workflow should run?');

    const request = requestId ? await this.deps.history.get(requestId) : null;
    // Another user's request reads as missing, like their private workflows.
    if (!request || request.user_id !== user.id) throw new Error('Request not found');

    const owner = await this.deps.getOwner(identifier);
    if (owner && owner.visibility === 'private' && owner.user_id !== user.id && user.role !== 'admin') {
      throw new Error('Workflow not found');
    }

    const phase = (data: Record<string, unknown>) =>
      reply.send({ event: 'onAssistantRun', correlationId, data: { requestId, ...data } });

    const settings = await this.deps.core.request<Record<string, unknown>>('settingsList', {});
    const config = assistantConfigFrom(settings);
    const hidden = await this.hiddenFor(user);
    const tools = new IpcToolClient(this.deps.core, hidden);

    reply.beforeRun(correlationId, identifier);
    phase({ phase: 'task_running', identifier });
    await this.deps.history.update(requestId, { status: 'running', task_identifier: identifier, error: null });

    let result: RunResult;
    try {
      result = parseRunResult((await tools.runWorkflow(identifier, variables, correlationId)).text);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      reply.send({ event: 'onAssistantRun', correlationId, data: { requestId }, error: message });
      await this.deps.history.update(requestId, { status: 'failed', error: message }).catch(() => {});
      return;
    }
    if (result.pipelineIdentifier) {
      await this.deps.history.update(requestId, { pipeline_identifier: result.pipelineIdentifier });
    }
    phase({ phase: 'run_finished', result });

    // The run card already shows everything exact; a failed summary only costs the sentence above it.
    const answer = config
      ? await summarizeRun(this.provider(config), {
          prompt: request.prompt,
          workflowName: typeof payload.name === 'string' && payload.name ? payload.name : identifier,
          result,
          providerLabel: PROVIDER_LABELS[config.provider] ?? config.provider,
        }).catch((err) => {
          console.error('[Assistant] Summary failed:', err?.message ?? err);
          return '';
        })
      : '';
    phase({ phase: 'done', answer, result });

    if (result.status === 'failed') {
      await this.deps.history.update(requestId, { status: 'failed', error: result.error ?? 'Run failed' });
    } else {
      await this.deps.history.update(requestId, { status: 'completed', answer: answer || result.status });
    }
  }

  /** Remembers which workflow the user meant for a kind of request, for their next one. */
  private async choose(payload: any, user: User) {
    const requestKey = typeof payload.requestKey === 'string' ? payload.requestKey : '';
    const identifier = typeof payload.identifier === 'string' ? payload.identifier : '';
    const name = typeof payload.name === 'string' ? payload.name : identifier;
    if (!requestKey || !identifier) throw new Error('A requestKey and an identifier are required');
    const memory = await this.deps.history.getChoices(user.id);
    await this.deps.history.saveChoices(user.id, rememberChoice(memory, requestKey, { identifier, name }));
    return { remembered: true };
  }

  /** The user's own requests; an admin may ask for everyone's (`scope: 'everyone'`). */
  private async historyFor(payload: any, user: User) {
    const everyone = payload.scope === 'everyone';
    if (everyone && user.role !== 'admin') throw new Error("Permission denied: only admins see everyone's requests.");
    const limit = typeof payload.limit === 'number' ? payload.limit : 50;
    return this.deps.history.list(everyone ? null : user.id, limit);
  }

  private async hiddenFor(user: User): Promise<string[]> {
    if (user.role === 'admin') return [];
    return [...(await this.deps.privateOwnedByOthers(user.id))];
  }

  private async instructions(config: AssistantConfig, projectIdentifier: unknown): Promise<AgentInstructions> {
    const instructions: AgentInstructions = { global: config.globalInstructions };
    if (typeof projectIdentifier === 'string' && projectIdentifier) {
      const project = await this.deps.core
        .request<{ name?: string; instructions?: string | null } | null>('projectDetail', { identifier: projectIdentifier })
        .catch(() => null);
      if (project?.name && project.instructions) instructions.project = { name: project.name, text: project.instructions };
    }
    return instructions;
  }

  private provider(config: AssistantConfig): LLMProvider {
    return this.deps.createProvider
      ? this.deps.createProvider(config)
      : createProvider({ provider: config.provider, apiKey: config.apiKey, baseURL: config.baseURL, model: config.model });
  }
}
