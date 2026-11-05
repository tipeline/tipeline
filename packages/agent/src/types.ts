export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  /**
   * The provider's own copy of an assistant turn, sent back unchanged on the next
   * request. Anthropic needs this for thinking blocks; other providers ignore it.
   */
  raw?: unknown;
}

export interface ChatResult {
  text?: string;
  toolCalls?: ToolCall[];
  /** See ChatMessage.raw. */
  raw?: unknown;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult>;
}

/** An input of a workflow (public or protected), as `search_workflows` reports it. */
export interface WorkflowInput {
  name: string;
  type: string;
  label?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
}

/** An output of a workflow, as `search_workflows` reports it: what a run returns. */
export interface WorkflowOutput {
  name: string;
  type: string;
  label?: string;
  description?: string;
}

/** What a run's output means, from its variable's label and description. */
export interface OutputDetail {
  label?: string;
  description?: string;
}

/** Where a workflow that isn't installed yet can be installed from. */
export interface WorkflowHubSource {
  id: string;
  name: string;
  itemIdentifier: string;
  version: string;
}

/** One workflow as `search_workflows` reports it. */
export interface WorkflowSummary {
  identifier: string;
  name: string;
  description?: string;
  tags?: string[];
  inputs: WorkflowInput[];
  /** The workflow's declared outputs; left out when it declares none. */
  outputs?: WorkflowOutput[];
  /** Set when the workflow is on a hub and not installed yet. */
  hub?: WorkflowHubSource;
  /** Run by other workflows for its data: offered for reuse in drafts, never as a run. */
  helper?: true;
}

/** What the agent suggests running. Nothing has run yet: the user confirms first. */
export interface RunProposal {
  identifier: string;
  name: string;
  /** Values the model read from the request, by input name. */
  variables: Record<string, unknown>;
  /** The workflow's inputs, so a caller can build the form without another lookup. */
  inputs: WorkflowInput[];
  /** Other workflows that could also fit, best first. */
  alternatives: Array<{ identifier: string; name: string; hub?: WorkflowHubSource }>;
  /** Set when the workflow has to be installed from a hub first. */
  hub?: WorkflowHubSource;
  /** The user picked this workflow for the same kind of request before; the others are alternatives. */
  remembered?: boolean;
}

/** A workflow a draft should run as a step. `hub` is set while it still has to be installed. */
export interface ReusedWorkflow {
  identifier: string;
  name: string;
  hub?: WorkflowHubSource;
}

/** One answer to a "which one?" question. */
export interface ChoiceOption {
  identifier: string;
  name: string;
  description?: string;
  inputs: WorkflowInput[];
  hub?: WorkflowHubSource;
}

/**
 * How a prompt ended. Each carries the request's key (see choices.ts) so the
 * caller can remember which workflow the user ends up picking for it.
 */
export type AgentOutcome =
  | { kind: 'answer'; text: string; requestKey: string }
  | {
      kind: 'proposal';
      text: string;
      proposal: RunProposal;
      /** When to run it on its own, if the request said: the user is offered a schedule, not a run. */
      schedule?: string;
      requestKey: string;
    }
  | {
      kind: 'choice';
      /** When to run the picked workflow on its own, if the request said. */
      schedule?: string;
      /** The question to show above the options. */
      text: string;
      options: ChoiceOption[];
      /** Values read from the request; each option keeps the ones it has inputs for. */
      variables: Record<string, unknown>;
      requestKey: string;
    }
  | {
      kind: 'nomatch';
      /** What the model tells the user: nothing installed does this. */
      text: string;
      /** The workflow that would, described so it can be drafted (inputs, steps, outputs). */
      draftRequest: string;
      /** Workflows from the search that each do part of it, for the draft to run as steps. */
      reuse: ReusedWorkflow[];
      /** When it should run on its own, kept out of draftRequest: "every 30 seconds". */
      schedule?: string;
      requestKey: string;
    };

/** How drafting a workflow ended. */
export type DraftOutcome =
  | {
      kind: 'drafted';
      identifier: string;
      name: string;
      /** What the workflow does, step by step, in a few lines of Markdown. */
      summary: string;
      /** What the user still has to do before it works: credentials, placeholders, checks. */
      todos: string[];
      /** The checker's notes on the saved draft (probably-wrong but allowed things). */
      warnings: string[];
      /** Parts of the request the user agreed to leave out; set only for an incomplete draft. */
      incomplete?: string[];
      /**
       * The schedule proposed with the draft, as Core read it: `when` is the assistant's words,
       * with a cron (repeats) or runAt (ISO, runs once). Off until the user marks the draft ready.
       */
      schedule?: { when: string; cron: string | null; runAt: string | null };
    }
  | {
      /** Stopped before writing: part of the request can't be done. Nothing was saved. */
      kind: 'gap';
      /** Each part that can't be done, and why. */
      missing: string[];
      /** What a draft without those parts would still do. */
      possible: string;
    }
  | { kind: 'failed'; text: string; errors: string[] };

/** What a draft is written from besides the request. */
export interface DraftOptions {
  /** Workflows to run as steps; ones not installed are built from actions instead. */
  reuse?: ReusedWorkflow[];
  /** Parts the user agreed to leave out after a `gap`: the draft is written without them. */
  acceptMissing?: string[];
  /**
   * When it should run on its own ("every 30 seconds"). The draft does one run and is saved
   * with this as its proposed schedule; the timing is never built into the workflow.
   */
  schedule?: string;
}

/** What `exec_task` reports once a run has finished. */
export interface RunResult {
  /** 'paused' means the run is waiting on an approval step. */
  status: 'completed' | 'failed' | 'canceled' | 'paused';
  pipelineIdentifier: string;
  durationMs: number;
  /**
   * Final values of the workflow's outputs, or of its public variables when it declares
   * no outputs. Private and secret ones are never included.
   */
  outputs: Record<string, unknown>;
  /** Label and description of each output that has one, by output name. */
  outputDetails?: Record<string, OutputDetail>;
  /** The workflow's description, cut to a reasonable length. */
  description?: string;
  error?: string;
}
