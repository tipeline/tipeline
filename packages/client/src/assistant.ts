/**
 * The Server's Assistant, as a phone or browser sees it (apps/server AssistantService).
 * The shapes match `@tipeline/agent`'s, written out here so the client stays free of
 * Node and AI SDK code.
 *
 * `assistantAsk` → `onAssistantAsk` updates: thinking → searching → answer | nomatch | choice | proposal.
 * `assistantRun` → `onAssistantRun` updates: task_running → run_finished → done, with the run's
 * own events (onTaskStart, onAction…) on the same correlationId in between.
 * Only editors and admins may use it.
 */

export type AssistantPhase =
  | 'thinking'
  | 'searching'
  | 'answer'
  | 'nomatch'
  | 'choice'
  | 'proposal'
  | 'task_running'
  | 'run_finished'
  | 'done';

/** The phases that end a stream; an error ends it too. */
export const ASSISTANT_FINAL_PHASES = new Set<AssistantPhase>(['answer', 'nomatch', 'choice', 'proposal', 'done']);

export interface AssistantInput {
  name: string;
  type: string;
  label?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
}

/** Where a workflow that isn't installed yet can be installed from. */
export interface AssistantHubSource {
  id: string;
  name: string;
  itemIdentifier: string;
  version: string;
}

/** A suggested run: nothing has run yet, the user fills in the rest and confirms. */
export interface AssistantProposal {
  identifier: string;
  name: string;
  variables: Record<string, unknown>;
  inputs: AssistantInput[];
  alternatives: Array<{ identifier: string; name: string; hub?: AssistantHubSource }>;
  /** Not installed yet: it can't run until someone installs it. */
  hub?: AssistantHubSource;
  /** The user picked it for the same kind of request before. */
  remembered?: boolean;
}

/** One answer to a "which one?" question. */
export interface AssistantChoiceOption {
  identifier: string;
  name: string;
  description?: string;
  inputs: AssistantInput[];
  hub?: AssistantHubSource;
}

export interface AssistantRunResult {
  /** 'paused' means the run is waiting on an approval step. */
  status: 'completed' | 'failed' | 'canceled' | 'paused';
  pipelineIdentifier: string;
  durationMs: number;
  outputs: Record<string, unknown>;
  outputDetails?: Record<string, { label?: string; description?: string }>;
  description?: string;
  error?: string;
}

/** One update of a request or a run. Which fields are set depends on the phase. */
export interface AssistantUpdate {
  phase?: AssistantPhase;
  /** The request it belongs to: send it with assistantRun and it's kept with the run. */
  requestId?: string;
  /** Set on an error, which ends the stream. */
  error?: string;
  /** searching */
  query?: string;
  /** answer, nomatch, choice, proposal: what the Assistant says. */
  text?: string;
  /** Lets assistantChoose remember which workflow the user meant for this kind of request. */
  requestKey?: string;
  /** When the request said it should run on its own ("every day at 9"). */
  schedule?: string;
  /** proposal */
  proposal?: AssistantProposal;
  /** choice */
  options?: AssistantChoiceOption[];
  /** choice: values read from the request, for whichever option is picked. */
  variables?: Record<string, unknown>;
  /** task_running */
  identifier?: string;
  /** run_finished, done */
  result?: AssistantRunResult;
  /** done: the answer to the request, written from the run's outputs ('' when it couldn't be written). */
  answer?: string;
}

export interface AssistantHandle {
  correlationId: string;
  /** Settles with the last update (a final phase); rejects with a CommandError on an error. */
  done: Promise<AssistantUpdate>;
  /** Stops listening. A run keeps going on the Server. */
  stopListening(): void;
}

export interface AssistantRequestItem {
  id: string;
  prompt: string;
  status: 'thinking' | 'answered' | 'proposed' | 'running' | 'completed' | 'failed';
  taskIdentifier: string | null;
  taskName: string | null;
  pipelineIdentifier: string | null;
  answer: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  /** Who asked: an admin's list of everyone's requests mixes users. */
  user: { id: string; email: string; name: string };
}
