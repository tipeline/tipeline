import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { generateIdentifier } from '@tipeline/utils';
import { PROVIDERS, PROVIDER_LABELS, type ProviderName } from '@tipeline/agent/provider-names';
import type { ChoiceOption, DraftOutcome, ReusedWorkflow, RunProposal, RunResult } from '@tipeline/agent';
import {
  CHOICE_MEMORY_SETTING,
  parseChoiceMemory,
  proposalFromChoice,
  rememberChoice,
} from '@tipeline/agent/choices';
import { INSTRUCTIONS_SETTING, type AgentInstructions } from '@tipeline/agent/instructions';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useSettingsStore } from '@/store/settingsStore';
import { useStreamStore } from '@/store/stream';
import { toast } from '@/components/ui/sonner';
import router from '@/router';
import { i18n } from '@/i18n';

const { t } = i18n.global;

const SIDEBAR_OPEN_KEY = 'tipeline.agent.sidebarOpen';
const SIDEBAR_WIDTH_KEY = 'tipeline.agent.sidebarWidth';
export const SIDEBAR_MIN_WIDTH = 340;
export const SIDEBAR_MAX_WIDTH = 720;
const SIDEBAR_DEFAULT_WIDTH = 400;

/**
 * Where one request is:
 * thinking → answer, or thinking → (choice →) proposal → running → done (or → scheduled,
 * when the request said how often and the user created the schedule),
 * or thinking → nomatch → drafting → drafted; dismissed when the user turns a
 * choice or proposal down; error from any step.
 */
export type TurnPhase =
  | 'thinking'
  | 'answer'
  | 'nomatch'
  | 'drafting'
  | 'drafted'
  | 'choice'
  | 'proposal'
  | 'dismissed'
  | 'running'
  | 'done'
  | 'scheduled'
  | 'error';

export interface AgentTurn {
  /** Also the agent run's correlationId in Core's history. */
  id: string;
  prompt: string;
  phase: TurnPhase;
  /** The keywords of the search in progress, while thinking. */
  searching?: string;
  /** The model's reply: the whole answer, or the one line that comes with a proposal. */
  text?: string;
  proposal?: RunProposal;
  /** The options of a "which one?" question, and the values the agent read for whichever is picked. */
  choice?: { options: ChoiceOption[]; variables: Record<string, unknown> };
  /** When nothing fits: the workflow that would, described for drafting (the user may edit it). */
  draftRequest?: string;
  /** Workflows the draft should run as steps; the user may remove them or install ones from a hub. */
  reuse?: ReusedWorkflow[];
  /**
   * When it should run on its own, as the request said ("every 40 seconds"): for a proposal the
   * user is offered a schedule instead of a run; for a draft it's the proposed schedule.
   */
  schedule?: string;
  /** The schedule created from a proposal. */
  scheduled?: { scheduleIdentifier: string; cron: string | null; runAt?: string | null; everySeconds?: number | null; nextRunAt?: string | null };
  /** What drafting is doing right now. */
  draftStep?: string;
  /** The saved draft. */
  draft?: Extract<DraftOutcome, { kind: 'drafted' }>;
  /** Drafting stopped before writing: what can't be done and what the rest would do. Nothing was saved. */
  draftGap?: { missing: string[]; possible: string };
  /** Why the last drafting attempt failed, shown so the user can edit the description and try again. */
  draftError?: { text: string; errors: string[] };
  /** The request's key for remembering which workflow the user picks (see @tipeline/agent/choices). */
  requestKey?: string;
  /** Values the run used, after the user's edits. */
  variables?: Record<string, unknown>;
  /** The run, matched from the live stream while it's going (exec_task only reports it at the end). */
  livePipeline?: string;
  result?: RunResult;
  /** The model's answer written from the outputs; undefined while it's being written. */
  answer?: string;
  error?: string;
  /** The instructions the request was sent with; drafting from it uses the same ones. */
  instructions?: AgentInstructions;
  /** Drafted from a planned node of a project map: the draft joins the project and becomes that node. */
  mapLink?: { projectIdentifier: string; nodeId: string };
}

/** The project the user is in (its page, or one of its workflows or apps). */
export interface ActiveProject {
  identifier: string;
  name: string;
  color?: string | null;
  instructions?: string | null;
}

export interface AgentRunRecord {
  id: number;
  correlation_id: string;
  prompt: string;
  answer: string | null;
  status: 'running' | 'proposed' | 'done' | 'error';
  task_identifier: string | null;
  task_name: string | null;
  pipeline_identifier: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

interface AgentConnection {
  provider: ProviderName;
  apiKey: string;
  baseURL?: string;
  model?: string;
  mcpToken: string;
  mcpUrl: string;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private storage unavailable: the sidebar just forgets its state.
  }
}

/**
 * The assistant sidebar's conversation. AgentService (Electron main) does the
 * model and MCP work; this store keeps the turns, sends each step, and listens on
 * `agent:<id>` for the phases that come back.
 */
export const useAgentStore = defineStore('agent', () => {
  const turns = ref<AgentTurn[]>([]);
  const sidebarOpen = ref(readStored(SIDEBAR_OPEN_KEY) === 'true');
  const storedWidth = Number(readStored(SIDEBAR_WIDTH_KEY));
  const sidebarWidth = ref(
    storedWidth >= SIDEBAR_MIN_WIDTH && storedWidth <= SIDEBAR_MAX_WIDTH ? storedWidth : SIDEBAR_DEFAULT_WIDTH
  );
  const history = ref<AgentRunRecord[]>([]);
  const historyLoading = ref(false);
  /** A request sent before any provider was set up: the sidebar puts it back in its box. */
  const pendingPrompt = ref('');
  /** The project of the page the user is on: its instructions go with their requests. */
  const activeProject = ref<ActiveProject | null>(null);

  watch(sidebarOpen, (open) => writeStored(SIDEBAR_OPEN_KEY, String(open)));
  watch(sidebarWidth, (width) => writeStored(SIDEBAR_WIDTH_KEY, String(width)));

  /** True while the model is thinking, a run is going or a draft is being written: the header icon pulses. */
  const working = computed(() =>
    turns.value.some((turn) => turn.phase === 'thinking' || turn.phase === 'running' || turn.phase === 'drafting')
  );
  const busyThinking = computed(() => turns.value.some((turn) => turn.phase === 'thinking'));

  /** The project a page belongs to: the project's own page, or the project of its workflow or app. */
  async function projectOfRoute(path: string, params: Record<string, any>): Promise<ActiveProject | null> {
    let identifier: string | null = null;
    if (path.startsWith('/projects/')) identifier = params.pid ?? null;
    else if (path.startsWith('/tasks/') && params.tid) {
      identifier = (await invokeCore<any>(SEND.TASK_DETAIL, { identifier: params.tid }))?.project_identifier ?? null;
    } else if (path.startsWith('/apps/') && params.aid) {
      identifier = (await invokeCore<any>(SEND.APP_DETAIL, { identifier: params.aid }))?.project_identifier ?? null;
    }
    if (!identifier) return null;
    const project = await invokeCore<any>(SEND.PROJECT_DETAIL, { identifier });
    return project ? { identifier, name: project.name, color: project.color, instructions: project.instructions } : null;
  }

  let routeLookup = 0;
  /** Looks the page's project up again; also before each request, so edited instructions apply. */
  async function refreshActiveProject() {
    const route = router.currentRoute.value;
    const lookup = ++routeLookup;
    const project = await projectOfRoute(route.path, route.params).catch(() => null);
    // A later navigation started its own lookup: that one decides.
    if (lookup === routeLookup) activeProject.value = project;
    return project;
  }
  watch(() => router.currentRoute.value.fullPath, () => void refreshActiveProject(), { immediate: true });

  /** Global instructions from Settings plus the active project's. */
  async function currentInstructions(): Promise<AgentInstructions> {
    const project = await refreshActiveProject();
    return {
      global: useSettingsStore().get(INSTRUCTIONS_SETTING) || undefined,
      project: project?.instructions ? { name: project.name, text: project.instructions } : undefined,
    };
  }

  const listeners = new Map<string, (_: any, response: any) => void>();
  const streamWatches = new Map<string, () => void>();

  function turn(id: string): AgentTurn | undefined {
    return turns.value.find((entry) => entry.id === id);
  }

  function stopListening(id: string) {
    const handler = listeners.get(id);
    if (handler) window.ipcRenderer.off(`agent:${id}`, handler);
    listeners.delete(id);
    streamWatches.get(id)?.();
    streamWatches.delete(id);
  }

  function listen(id: string) {
    stopListening(id);
    const handler = (_: any, response: any) => onPhase(id, response);
    listeners.set(id, handler);
    window.ipcRenderer.on(`agent:${id}`, handler);
  }

  function onPhase(id: string, response: any) {
    const entry = turn(id);
    if (!entry) return;
    switch (response.phase) {
      case 'thinking':
        entry.phase = 'thinking';
        break;
      case 'searching':
        entry.searching = response.query || '';
        break;
      case 'answer':
        entry.phase = 'answer';
        entry.text = response.text;
        entry.requestKey = response.requestKey;
        stopListening(id);
        break;
      case 'nomatch':
        entry.phase = 'nomatch';
        entry.text = response.text;
        entry.draftRequest = response.draftRequest;
        entry.reuse = response.reuse ?? [];
        entry.schedule = response.schedule || undefined;
        entry.requestKey = response.requestKey;
        stopListening(id);
        break;
      case 'draft_progress':
        entry.phase = 'drafting';
        entry.draftStep = response.step;
        break;
      case 'drafted':
        entry.phase = 'drafted';
        entry.draft = response.draft;
        stopListening(id);
        void loadHistory();
        if (entry.mapLink) void linkToMap(entry.mapLink, response.draft.identifier);
        // Straight to the builder to test it, as the request asked.
        router.push(`/tasks/${response.draft.identifier}/edit`);
        break;
      case 'draft_gap':
        entry.phase = 'nomatch';
        entry.draftGap = { missing: response.missing ?? [], possible: response.possible ?? '' };
        stopListening(id);
        break;
      case 'draft_failed':
        entry.phase = 'nomatch';
        entry.draftError = { text: response.text, errors: response.errors ?? [] };
        stopListening(id);
        break;
      case 'choice':
        entry.phase = 'choice';
        entry.text = response.text;
        entry.choice = { options: response.options, variables: response.variables ?? {} };
        entry.schedule = response.schedule || undefined;
        entry.requestKey = response.requestKey;
        stopListening(id);
        break;
      case 'proposal':
        entry.phase = 'proposal';
        entry.text = response.text;
        entry.proposal = response.proposal;
        entry.schedule = response.schedule || undefined;
        entry.requestKey = response.requestKey;
        stopListening(id);
        break;
      case 'task_running':
        entry.phase = 'running';
        watchForPipelineStart(id, response.identifier);
        break;
      case 'run_finished':
        entry.result = response.result;
        break;
      case 'done':
        entry.phase = 'done';
        entry.result = response.result;
        entry.answer = response.answer ?? '';
        stopListening(id);
        announceIfHidden(entry);
        void loadHistory();
        break;
      case 'error':
        entry.phase = 'error';
        entry.error = response.error;
        stopListening(id);
        if (!sidebarOpen.value) toast.error(t('agent.failed'), { description: response.error });
        void loadHistory();
        break;
    }
  }

  function announceIfHidden(entry: AgentTurn) {
    if (sidebarOpen.value || !entry.result) return;
    const failed = entry.result.status === 'failed';
    (failed ? toast.error : toast.success)(entry.proposal?.name ?? t('agent.finished'), {
      description: entry.answer || t(`agent.result.${entry.result.status}`),
      action: { label: t('agent.sidebar.open'), onClick: () => (sidebarOpen.value = true) },
    });
  }

  /**
   * exec_task only reports the pipeline once the run is over, so the live link
   * comes from the stream store: the next start event for this workflow.
   */
  function watchForPipelineStart(id: string, identifier: string) {
    const streamStore = useStreamStore();
    const since = Date.now();
    const tryMatch = () => {
      const hit = streamStore.events.find(
        (e) => e.type === 'start' && e.taskIdentifier === identifier && e.timestamp >= since
      );
      const entry = turn(id);
      if (hit && entry) {
        entry.livePipeline = hit.pipelineIdentifier;
        streamWatches.get(id)?.();
        streamWatches.delete(id);
      }
    };
    tryMatch();
    if (!turn(id)?.livePipeline) streamWatches.set(id, watch(() => streamStore.events.length, tryMatch));
  }

  /**
   * The provider the user picked, or else the one they gave a key to. None on a fresh
   * install: no provider comes with Tipeline, so none is shown until the user chooses.
   */
  function chosenProvider(): ProviderName | null {
    const settingsStore = useSettingsStore();
    const stored = settingsStore.get('agent_provider') as ProviderName;
    if ((PROVIDERS as readonly string[]).includes(stored)) return stored;
    return PROVIDERS.find((provider) => settingsStore.get(`agent_${provider}_api_key`)) ?? null;
  }

  /** The chosen provider has a key: the Assistant can answer. */
  const configured = computed(() => {
    const provider = chosenProvider();
    return !!provider && !!useSettingsStore().get(`agent_${provider}_api_key`);
  });

  /** The chosen provider's name, only once it's set up. */
  const providerLabel = computed(() => {
    const provider = chosenProvider();
    return configured.value && provider ? PROVIDER_LABELS[provider] : '';
  });

  async function connection(): Promise<AgentConnection | null> {
    const settingsStore = useSettingsStore();
    const provider = chosenProvider();
    const apiKey = provider ? settingsStore.get(`agent_${provider}_api_key`) : '';
    const baseURL = settingsStore.get(`agent_${provider}_base_url`) || undefined;
    const model = settingsStore.get(`agent_${provider}_model`) || undefined;
    const mcpUrl = settingsStore.get('agent_mcp_url', 'http://127.0.0.1:4002/mcp');

    // Falls back to Core's own API token when nothing's configured — covers the
    // case where the user runs the agent before ever opening Settings.
    let mcpToken = settingsStore.get('agent_mcp_token');
    if (!mcpToken) {
      mcpToken = await settingsStore.getApiToken().catch(() => '');
    }

    if (!provider || !apiKey || !mcpToken) {
      toast.error(t('agent.notConfigured'), {
        description: provider
          ? t('agent.notConfiguredDescription', { provider: PROVIDER_LABELS[provider] ?? provider })
          : t('agent.notConfiguredNoProvider'),
        action: { label: t('agent.openSettings'), onClick: () => router.push('/settings/agent') },
      });
      return null;
    }
    return { provider, apiKey, baseURL, model, mcpToken, mcpUrl };
  }

  /**
   * Sends a request. Before any provider key is set, the request waits in `pendingPrompt`
   * and the sidebar opens on its setup message instead of failing; the sidebar puts the
   * request back in its box to send once set up (returns true: it was taken).
   */
  async function submit(text: string) {
    const settingsStore = useSettingsStore();
    if (!Object.keys(settingsStore.settings).length) await settingsStore.load().catch(() => {});
    if (!configured.value) {
      pendingPrompt.value = text;
      sidebarOpen.value = true;
      return true;
    }

    const config = await connection();
    if (!config) return false;
    pendingPrompt.value = '';

    const id = generateIdentifier();
    turns.value.push({ id, prompt: text, phase: 'thinking' });
    listen(id);
    const rememberedChoices = parseChoiceMemory(useSettingsStore().get(CHOICE_MEMORY_SETTING));
    const instructions = await currentInstructions();
    const entry = turn(id);
    if (entry) entry.instructions = instructions;
    window.ipcRenderer.send(SEND.AGENT_PROMPT, {
      correlationId: id,
      payload: JSON.parse(JSON.stringify({ ...config, prompt: text, rememberedChoices, instructions })),
    });
    return true;
  }

  /**
   * From a planned node of a project map: opens the sidebar on a draft offer built from the
   * map (the brief and the workflows to reuse), for the user to check and send. Nothing is
   * sent to the model until they do.
   */
  async function draftFromMap(
    brief: string,
    reuse: ReusedWorkflow[],
    mapLink: { projectIdentifier: string; nodeId: string }
  ) {
    const id = generateIdentifier();
    turns.value.push({
      id,
      prompt: brief,
      phase: 'nomatch',
      text: t('projectMap.assistant.offer'),
      draftRequest: brief,
      reuse: JSON.parse(JSON.stringify(reuse)),
      instructions: await currentInstructions(),
      mapLink: { ...mapLink },
    });
    sidebarOpen.value = true;
  }

  /** The draft joins the map's project and takes the planned node's place. */
  async function linkToMap(mapLink: { projectIdentifier: string; nodeId: string }, taskIdentifier: string) {
    try {
      await invokeCore(SEND.PROJECT_ASSIGN_TASK, { projectIdentifier: mapLink.projectIdentifier, taskIdentifier });
      await invokeCore(SEND.PROJECT_MAP_LINK, {
        identifier: mapLink.projectIdentifier,
        nodeId: mapLink.nodeId,
        key: `task:${taskIdentifier}`,
      });
    } catch (error: any) {
      toast.error(t('projectMap.assistant.linkFailed'), { description: error?.message ?? String(error) });
    }
  }

  /** Opens the sidebar with a request already sent: the dashboard's box. */
  function ask(text: string) {
    sidebarOpen.value = true;
    return submit(text);
  }

  /** Runs a proposal with the values from its form. */
  async function runProposal(id: string, variables: Record<string, unknown>) {
    const entry = turn(id);
    if (!entry?.proposal || entry.phase !== 'proposal') return;
    const config = await connection();
    if (!config) return;

    entry.phase = 'running';
    entry.variables = variables;
    entry.livePipeline = undefined;
    listen(id);
    window.ipcRenderer.send(SEND.AGENT_RUN, {
      correlationId: id,
      payload: JSON.parse(
        JSON.stringify({
          ...config,
          prompt: entry.prompt,
          identifier: entry.proposal.identifier,
          name: entry.proposal.name,
          variables,
        })
      ),
    });
  }

  /**
   * Schedules a proposal instead of running it: the workflow runs on its own `when` (plain
   * words or a cron), with the values from its form. Nothing runs now.
   */
  async function scheduleProposal(id: string, variables: Record<string, unknown>, when: string) {
    const entry = turn(id);
    if (!entry?.proposal || entry.phase !== 'proposal' || !when.trim()) return false;
    try {
      const created = await invokeCore<{ scheduleIdentifier: string }>(SEND.SCHEDULE_SET, {
        identifier: entry.proposal.identifier,
        when: when.trim(),
        variables: JSON.parse(JSON.stringify(variables)),
      });
      const all = (await invokeCore<any[]>(SEND.SCHEDULE_LIST).catch(() => [])) ?? [];
      const saved = all.find((s) => s.scheduleIdentifier === created?.scheduleIdentifier);
      entry.schedule = when.trim();
      entry.variables = variables;
      entry.scheduled = {
        scheduleIdentifier: created?.scheduleIdentifier ?? '',
        cron: saved?.cron ?? null,
        runAt: saved?.runAt ?? null,
        everySeconds: saved?.everySeconds ?? null,
        nextRunAt: saved?.nextRunAt ?? null,
      };
      entry.phase = 'scheduled';
      return true;
    } catch (error: any) {
      toast.error(t('agent.schedule.failed'), { description: error?.message ?? String(error) });
      return false;
    }
  }

  /**
   * Has the assistant write the workflow described (the user may have edited it) and save it as a draft.
   * With `acceptMissing` (after drafting stopped on parts it can't do) the rest is drafted, marked incomplete.
   * `schedule` (when it runs on its own) goes with the draft as its proposed schedule; empty means none.
   */
  async function draft(id: string, request: string, acceptMissing: string[] = [], schedule = entryScheduleOf(id)) {
    const entry = turn(id);
    const text = request.trim();
    if (entry?.phase !== 'nomatch' || !text) return;
    const config = await connection();
    if (!config) return;

    entry.phase = 'drafting';
    entry.draftStep = 'writing';
    entry.draftRequest = text;
    entry.schedule = schedule.trim() || undefined;
    entry.draftError = undefined;
    entry.draftGap = undefined;
    listen(id);
    window.ipcRenderer.send(SEND.AGENT_DRAFT, {
      correlationId: id,
      payload: JSON.parse(
        JSON.stringify({
          ...config,
          request: text,
          reuse: entry.reuse ?? [],
          acceptMissing,
          schedule: entry.schedule,
          instructions: entry.instructions,
        })
      ),
    });
  }

  function entryScheduleOf(id: string): string {
    return turn(id)?.schedule ?? '';
  }

  /** Leaves a workflow out of the draft; it's built from actions instead, or not at all. */
  function removeReuse(id: string, identifier: string) {
    const entry = turn(id);
    if (entry?.reuse) entry.reuse = entry.reuse.filter((w) => w.identifier !== identifier);
  }

  /** A workflow to reuse was installed from its hub: the draft runs the installed copy. */
  function adoptInstalledReuse(id: string, identifier: string, installed: { identifier: string; name?: string }) {
    const entry = turn(id);
    if (!entry?.reuse) return;
    entry.reuse = entry.reuse.map((w) =>
      w.identifier === identifier ? { identifier: installed.identifier, name: installed.name ?? w.name } : w
    );
  }

  function dismissProposal(id: string) {
    const entry = turn(id);
    if (entry?.phase === 'proposal' || entry?.phase === 'choice' || entry?.phase === 'nomatch') entry.phase = 'dismissed';
  }

  /** Saves which workflow the user picked for this kind of request, so next time it's proposed first. */
  async function remember(entry: AgentTurn, choice: { identifier: string; name: string }) {
    if (!entry.requestKey) return;
    const settingsStore = useSettingsStore();
    try {
      const memory = parseChoiceMemory(settingsStore.get(CHOICE_MEMORY_SETTING));
      const next = rememberChoice(memory, entry.requestKey, choice);
      await settingsStore.set(CHOICE_MEMORY_SETTING, JSON.stringify(next));
    } catch (error) {
      // Forgetting a pick only means the question comes back next time.
      console.error('[agentStore] Could not save the choice:', error);
    }
  }

  /** Answers a "which one?" question: the picked workflow becomes the proposal, the rest alternatives. */
  function choose(id: string, identifier: string) {
    const entry = turn(id);
    if (entry?.phase !== 'choice' || !entry.choice) return;
    const proposal = proposalFromChoice(entry.choice.options, identifier, entry.choice.variables);
    if (!proposal) return;
    entry.proposal = proposal;
    entry.text = '';
    entry.phase = 'proposal';
    void remember(entry, proposal);
  }

  /** Swaps a proposal for one of its alternatives; its form starts from the workflow's defaults. */
  function switchProposal(id: string, identifier: string) {
    const entry = turn(id);
    const current = entry?.proposal;
    const alternative = current?.alternatives.find((alt) => alt.identifier === identifier);
    if (!entry || !current || !alternative) return;
    // Switching away from a proposal is a pick too: remember it like an answer to "which one?".
    void remember(entry, alternative);
    // After a "which one?" every option is known, so the values the agent read carry over.
    const fromChoice = entry.choice
      ? proposalFromChoice(entry.choice.options, identifier, entry.choice.variables)
      : null;
    if (fromChoice) {
      entry.proposal = fromChoice;
      return;
    }
    entry.proposal = {
      identifier: alternative.identifier,
      name: alternative.name,
      variables: {},
      inputs: [],
      alternatives: [
        { identifier: current.identifier, name: current.name, ...(current.hub ? { hub: current.hub } : {}) },
        ...current.alternatives.filter((alt) => alt.identifier !== identifier),
      ],
      ...(alternative.hub ? { hub: alternative.hub } : {}),
    };
  }

  /**
   * After a hub workflow is installed, the proposal points at the installed copy
   * (it has its own identifier) and keeps the values the agent read, so the
   * normal run form takes over.
   */
  function adoptInstalled(id: string, installed: { identifier: string; name?: string }) {
    const entry = turn(id);
    if (!entry?.proposal?.hub) return;
    const next: RunProposal = {
      ...entry.proposal,
      identifier: installed.identifier,
      name: installed.name ?? entry.proposal.name,
    };
    delete next.hub;
    // A pick remembered as the hub entry now means the installed copy.
    const memory = parseChoiceMemory(useSettingsStore().get(CHOICE_MEMORY_SETTING));
    if (entry.requestKey && memory[entry.requestKey]?.identifier === entry.proposal.identifier) {
      void remember(entry, next);
    }
    entry.proposal = next;
  }

  function newChat() {
    for (const id of [...listeners.keys()]) stopListening(id);
    // A run already going keeps going in Core; it's still in History.
    turns.value = [];
    pendingPrompt.value = '';
  }

  async function loadHistory() {
    historyLoading.value = true;
    try {
      history.value = (await invokeCore<AgentRunRecord[]>(SEND.AGENT_RUN_LIST)) ?? [];
    } finally {
      historyLoading.value = false;
    }
  }

  return {
    configured,
    providerLabel,
    chosenProvider,
    turns,
    sidebarOpen,
    sidebarWidth,
    working,
    busyThinking,
    history,
    historyLoading,
    pendingPrompt,
    activeProject,
    refreshActiveProject,
    submit,
    ask,
    runProposal,
    scheduleProposal,
    dismissProposal,
    switchProposal,
    choose,
    draft,
    draftFromMap,
    adoptInstalled,
    removeReuse,
    adoptInstalledReuse,
    newChat,
    loadHistory,
  };
});
