import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  CommandError,
  ConnectionLostError,
  type AssistantChoiceOption,
  type AssistantHandle,
  type AssistantProposal,
  type AssistantRunResult,
  type AssistantUpdate,
} from '@tipeline/client';
import { useSession } from './session';
import { proposalFromOption, proposalInputs } from './lib/assistant';
import { initialValues, toRunVariables, type FormProblem } from './lib/workflows';

export type TurnState =
  | 'thinking'
  | 'searching'
  | 'answer'
  | 'nomatch'
  | 'choice'
  | 'proposal'
  | 'running'
  | 'done'
  | 'error';

/** One request and everything that followed it. */
export interface Turn {
  id: number;
  prompt: string;
  state: TurnState;
  requestId?: string;
  /** What the Assistant searched for, while it searches. */
  query?: string;
  /** What the Assistant said: the answer, the question, or the line above a proposal. */
  text?: string;
  requestKey?: string;
  schedule?: string;
  options?: AssistantChoiceOption[];
  choiceVariables?: Record<string, unknown>;
  proposal?: AssistantProposal;
  values: Record<string, unknown>;
  problems: FormProblem[];
  /** Steps finished so far in the run. */
  stepsDone: number;
  result?: AssistantRunResult;
  /** The answer written from the run's outputs. */
  answer?: string;
  error?: string;
  /** The connection dropped mid-run: it carries on on the Server. */
  lost?: boolean;
}

/**
 * The conversation with the Server's Assistant. It lives here, not in the page, so leaving
 * the tab and coming back keeps it. Nothing runs without the person pressing Run.
 */
export const useAssistant = defineStore('mobile-assistant', () => {
  const turns = ref<Turn[]>([]);
  let nextId = 1;
  const handles = new Map<number, AssistantHandle>();

  const busy = computed(() => turns.value.some((t) => t.state === 'thinking' || t.state === 'searching' || t.state === 'running'));

  const find = (id: number) => turns.value.find((t) => t.id === id);

  function ask(prompt: string) {
    const text = prompt.trim();
    if (!text || busy.value) return;
    turns.value.push({ id: nextId++, prompt: text, state: 'thinking', values: {}, problems: [], stepsDone: 0 });
    const id = turns.value[turns.value.length - 1].id;

    const handle = useSession()
      .api()
      .ask(text, (update) => applyAsk(id, update));
    handles.set(id, handle);
    handle.done.catch((err) => failed(id, err)).finally(() => handles.delete(id));
  }

  function applyAsk(id: number, update: AssistantUpdate) {
    const turn = find(id);
    if (!turn) return;
    if (update.requestId) turn.requestId = update.requestId;
    if (update.error) return; // handled by failed()
    switch (update.phase) {
      case 'thinking':
        turn.state = 'thinking';
        break;
      case 'searching':
        turn.state = 'searching';
        turn.query = update.query;
        break;
      case 'answer':
      case 'nomatch':
        turn.state = update.phase;
        turn.text = update.text;
        break;
      case 'choice':
        turn.state = 'choice';
        turn.text = update.text;
        turn.options = update.options ?? [];
        turn.choiceVariables = update.variables ?? {};
        turn.requestKey = update.requestKey;
        turn.schedule = update.schedule;
        break;
      case 'proposal':
        turn.text = update.text;
        turn.requestKey = update.requestKey;
        turn.schedule = update.schedule;
        if (update.proposal) propose(turn, update.proposal);
        break;
    }
  }

  function propose(turn: Turn, proposal: AssistantProposal) {
    turn.proposal = proposal;
    turn.values = initialValues(proposalInputs(proposal));
    turn.problems = [];
    turn.state = 'proposal';
  }

  /** The person picked one of the workflows the Assistant asked about. */
  function pick(id: number, identifier: string) {
    const turn = find(id);
    if (!turn?.options) return;
    const proposal = proposalFromOption(turn.options, identifier, turn.choiceVariables);
    if (!proposal) return;
    propose(turn, proposal);
    // Next time the same kind of request goes straight to it. Not worth an error if it fails.
    if (turn.requestKey && !proposal.hub) {
      void useSession()
        .api()
        .rememberAssistantChoice(turn.requestKey, { identifier: proposal.identifier, name: proposal.name })
        .catch(() => {});
    }
  }

  /** Runs the proposal with the form's values, after the person pressed Run. */
  function run(id: number) {
    const turn = find(id);
    if (!turn?.proposal || !turn.requestId || busy.value) return;
    const { variables, problems } = toRunVariables(proposalInputs(turn.proposal), turn.values);
    turn.problems = problems;
    if (problems.length) return;

    turn.state = 'running';
    turn.stepsDone = 0;
    turn.error = undefined;
    turn.lost = false;
    const handle = useSession()
      .api()
      .runForAssistant(
        { requestId: turn.requestId, identifier: turn.proposal.identifier, name: turn.proposal.name, variables },
        (update) => {
          const current = find(id);
          if (!current || update.error) return;
          if (update.result) current.result = update.result;
          if (update.phase === 'done') {
            current.answer = update.answer ?? '';
            current.state = 'done';
          }
        },
        (event) => {
          const current = find(id);
          if (current && event.type === 'action') current.stepsDone += 1;
        }
      );
    handles.set(id, handle);
    handle.done.catch((err) => failed(id, err)).finally(() => handles.delete(id));
  }

  function failed(id: number, err: unknown) {
    const turn = find(id);
    if (!turn) return;
    turn.lost = err instanceof ConnectionLostError;
    turn.error = err instanceof CommandError || !(err instanceof ConnectionLostError) ? (err as Error).message : undefined;
    turn.state = 'error';
  }

  /** After a failed run: the form again, with the values as they were. */
  function retry(id: number) {
    const turn = find(id);
    if (turn?.proposal && turn.state === 'error') {
      turn.state = 'proposal';
      turn.error = undefined;
      turn.lost = false;
    }
  }

  /** A new conversation. Runs keep going on the Server; this only stops following them. */
  function clear() {
    for (const handle of handles.values()) handle.stopListening();
    handles.clear();
    turns.value = [];
  }

  // Another sign-in (or none) never sees the last person's conversation.
  watch(
    () => useSession().token,
    () => clear()
  );

  return { turns, busy, ask, pick, run, retry, clear };
});
