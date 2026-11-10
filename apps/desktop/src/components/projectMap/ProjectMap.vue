<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ArrowLeft, Check, Loader2, Plus, Redo2, RefreshCw, RotateCcw, TriangleAlert, Undo2, X } from 'lucide-vue-next';
import {
  applyPositions,
  clusterLeaves,
  clusterSize,
  draftBrief,
  drawnEdge,
  edgeKey,
  emptyPlan,
  generateIdentifier,
  linkableKinds,
  layoutFlow,
  layoutLanes,
  laneByOf,
  laneOfNode,
  laneOrder,
  LANE_BY,
  type LaneBy,
  mergeMap,
  parsePlan,
  placeNode,
  planKey,
  type LiveMap,
  type MapNodeKind as LinkKind,
  type MapEdgeKind,
  type MapNode,
  type MapNodeKind,
  type PlanNode,
  type Point,
  type ProjectMapPlan,
  type StickyNote,
} from '@tipeline/utils';
import { Button } from '@/components/ui/button';
import { useStreamStore } from '@/store/stream';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useAgentStore } from '@/store/agentStore';
import { useNewItemDefaults } from '@/composables/useNewItemDefaults';
import MapCanvas from './MapCanvas.vue';
import MapDetailsPanel from './MapDetailsPanel.vue';
import AssistantButton from '@/components/agent/AssistantButton.vue';
import MapOverviewPanel from './MapOverviewPanel.vue';
import MapSidebar from './MapSidebar.vue';
import type { MapDropKind } from './mapDrag';
import { assignToProject, removeFromProject } from '@/utils/projectAssign';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { mapClipboard, type MapClip } from './mapClipboard';

/**
 * The map editor: a full page like the workflow builder. Left, what to add and what's on
 * the map; middle, the map; right, the selected node's details, or the plan's progress
 * and differences when nothing is selected.
 */
const props = defineProps<{ projectIdentifier: string; projectName?: string }>();
const router = useRouter();
const canvasRef = ref<InstanceType<typeof MapCanvas> | null>(null);
const nudge = ref(0);

/** `projects`: the names of the projects it's in. */
type LinkCandidate = { key: string; kind: LinkKind; name: string; projects: string[] };

const { t } = useI18n();
const agentStore = useAgentStore();
const newItemDefaults = useNewItemDefaults();

const live = ref<LiveMap>({ nodes: [], edges: [] });
const plan = ref<ProjectMapPlan>(emptyPlan());
const loading = ref(true);
/** Everything in Tipeline a planned node could be linked to. */
const candidates = ref<LinkCandidate[]>([]);
const loadError = ref<string | null>(null);

type LayoutMode = 'flow' | 'lanes';

// Remembered per project: whether ideas show, and which layout the map was left in.
const prefsKey = `tipeline.projectMap.${props.projectIdentifier}`;
function readPrefs(): { ideas?: boolean; layout?: LayoutMode; toggled?: string[] } {
  try {
    return JSON.parse(localStorage.getItem(prefsKey) ?? '{}');
  } catch {
    return {};
  }
}
const prefs = readPrefs();
/** Off: only what exists (for a screenshot, say). Ideas and planned lines hide; notes stay. */
const showIdeas = ref(prefs.ideas !== false);
const layoutMode = ref<LayoutMode>(prefs.layout === 'lanes' ? 'lanes' : 'flow');
// Boxes the user opened or closed, against their default (small ones open, big ones closed).
const toggled = ref<Set<string>>(new Set(Array.isArray(prefs.toggled) ? prefs.toggled : []));
watch([showIdeas, layoutMode, toggled], () => {
  try {
    localStorage.setItem(
      prefsKey,
      JSON.stringify({ ideas: showIdeas.value, layout: layoutMode.value, toggled: [...toggled.value] })
    );
  } catch {
    // Only a convenience.
  }
});

const selected = ref<string | null>(null);

async function load() {
  loadError.value = null;
  try {
    const result = await invokeCore<{ live: LiveMap; plan: unknown; candidates?: LinkCandidate[] }>(SEND.PROJECT_MAP, {
      identifier: props.projectIdentifier,
    });
    live.value = result.live;
    candidates.value = result.candidates ?? [];
    // A save still waiting would be lost: keep the local plan then.
    if (!saveTimer) {
      const stored = parsePlan(result.plan);
      // Changed somewhere else (the Assistant linking a draft, say): undo can't go back past that.
      if (!committed || withoutCoreNotes(stored) !== withoutCoreNotes(parsePlan(snapshot()))) {
        plan.value = stored;
        resetHistory();
      } else if (JSON.stringify(stored) !== JSON.stringify(parsePlan(snapshot()))) {
        // Only Core's notes changed (whether a link brought something in): keep undo.
        plan.value = stored;
        committed = snapshot();
      }
    }
  } catch (error: any) {
    loadError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
  }
}

/** The plan as the person made it, without the notes Core keeps on it. */
function withoutCoreNotes(p: ProjectMapPlan): string {
  return JSON.stringify({ ...p, nodes: p.nodes.map(({ alreadyIn: _, ...n }) => n) });
}

// Coming back to the window (from the builder, say): the definitions may have changed.
const onFocus = () => void load();
onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
});

// A run ending (here, in an app or anywhere else) can move a workflow to Tested, and its
// apps and schedules with it. Runs end in bursts (a parent and its sub-workflows), so wait
// a moment and load once.
const streamStore = useStreamStore();
let runEndTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => streamStore.events[streamStore.events.length - 1],
  (event) => {
    if (!event || (event.type !== 'end' && event.type !== 'end_all' && event.type !== 'error')) return;
    if (runEndTimer) clearTimeout(runEndTimer);
    runEndTimer = setTimeout(() => {
      runEndTimer = null;
      void load();
    }, 400);
  }
);
onBeforeUnmount(() => {
  if (runEndTimer) clearTimeout(runEndTimer);
});

// The plan saves itself shortly after each change; the toolbar says how that went.
// "Saved" fades after a moment; "Couldn't save" stays until it's retried.
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;
async function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  if (savedTimer) clearTimeout(savedTimer);
  saveTimer = null;
  savedTimer = null;
  saveState.value = 'saving';
  try {
    await invokeCore(SEND.PROJECT_MAP_SAVE, {
      identifier: props.projectIdentifier,
      plan: JSON.parse(JSON.stringify(plan.value)),
    });
    saveState.value = 'saved';
    savedTimer = setTimeout(() => {
      savedTimer = null;
      if (saveState.value === 'saved') saveState.value = 'idle';
    }, 2000);
  } catch (error: any) {
    saveState.value = 'error';
    toast.error(t('projectMap.saveFailed'), { description: error?.message ?? String(error) });
  }
}
/** Every edit ends here: records an undo step (once per tick) and saves shortly after. */
function save() {
  if (!commitQueued) {
    commitQueued = true;
    queueMicrotask(commitHistory);
  }
  queueSave();
}
function queueSave() {
  if (saveTimer) clearTimeout(saveTimer);
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = null;
  saveState.value = 'saving';
  saveTimer = setTimeout(() => void flush(), 400);
}
onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus);
  if (savedTimer) clearTimeout(savedTimer);
  if (saveTimer) void flush();
});

// ---- Undo / redo ---------------------------------------------------------------------
// JSON snapshots of the plan, like the app builder: everything one interaction changes (one
// tick) is one step. Only the plan goes back; things made for real (Create, Join project,
// a draft) stay, so those start the history over.
const HISTORY_LIMIT = 100;
const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
let committed = '';
let commitQueued = false;
const snapshot = () => JSON.stringify(plan.value);

function commitHistory() {
  commitQueued = false;
  const now = snapshot();
  if (now === committed) return;
  if (committed) {
    undoStack.value.push(committed);
    if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift();
    redoStack.value = [];
  }
  committed = now;
}

function resetHistory() {
  commitQueued = false;
  undoStack.value = [];
  redoStack.value = [];
  committed = snapshot();
}

function restore(json: string) {
  plan.value = JSON.parse(json);
  committed = json;
  queueSave();
}

function undo() {
  if (commitQueued) commitHistory();
  const previous = undoStack.value.pop();
  if (previous === undefined) return;
  redoStack.value.push(snapshot());
  restore(previous);
}

function redo() {
  if (commitQueued) commitHistory();
  const next = redoStack.value.pop();
  if (next === undefined) return;
  undoStack.value.push(snapshot());
  restore(next);
}

/** One map: what exists, with the plan's ideas and lines laid over it. */
const merged = computed(() => {
  const map = mergeMap(live.value, plan.value);
  // A workflow the viewer may not see comes without a name: every list calls it the same.
  for (const n of map.nodes) if (n.hidden) n.name = t('projectMap.node.hidden');
  return map;
});

// "Show ideas" off only changes what's drawn: the differences and progress stay the same.
const visibleNodes = computed(() =>
  showIdeas.value ? merged.value.nodes : merged.value.nodes.filter((n) => !n.planned)
);
const visibleEdges = computed(() => {
  if (showIdeas.value) return merged.value.edges;
  const shown = new Set(visibleNodes.value.map((n) => n.key));
  return merged.value.edges.filter((e) => e.source !== 'plan' && shown.has(e.from) && shown.has(e.to));
});

/** Workflows that only feed one node go in a box beside it, with one line for all. */
const clustered = computed(() =>
  clusterLeaves(visibleNodes.value, visibleEdges.value, { toggled: toggled.value })
);

const byKey = computed(() => new Map(merged.value.nodes.map((n) => [n.key, n])));

function toggleCluster(key: string) {
  const next = new Set(toggled.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  toggled.value = next;
}

/** What the Lanes layout groups by (owner until the plan has custom lanes). */
const laneBy = computed<LaneBy>(() => laneByOf(plan.value));

function setLaneBy(by: LaneBy) {
  plan.value.laneBy = by;
  save();
}

const laneOf = (n: MapNode | undefined) => (n ? laneOfNode(n, laneBy.value) : undefined);

/** Lane names as shown: statuses and kinds translated, the unnamed lane per grouping. */
const laneLabels = computed<Record<string, string>>(() => {
  const by = laneBy.value;
  const labels: Record<string, string> = {
    '': t(by === 'owner' ? 'projectMap.lanes.noOwner' : 'projectMap.lanes.unassigned'),
  };
  if (by === 'status' || by === 'kind') {
    for (const name of laneOrder(visibleNodes.value, by, [])) labels[name] = t(`projectMap.${by}.${name}`);
  }
  return labels;
});

/** Lanes would show nothing useful yet: no custom lanes, or nobody owns anything. */
const lanesHint = computed<'custom' | 'owner' | null>(() => {
  if (layoutMode.value !== 'lanes' || !visibleNodes.value.length) return null;
  if (laneBy.value === 'custom' && !plan.value.lanes.length) return 'custom';
  if (laneBy.value === 'owner' && !visibleNodes.value.some((n) => n.owner?.trim())) return 'owner';
  return null;
});

const layout = computed(() => {
  const c = clustered.value;
  const lanes = layoutMode.value === 'lanes';
  const nodes = [
    ...c.nodes.map((n) => ({ key: n.key, lane: lanes ? laneOf(n) : n.lane })),
    ...c.clusters.map((box) => ({ key: box.key, lane: lanes ? laneOf(byKey.value.get(box.anchor)) : undefined, ...clusterSize(box) })),
  ];
  if (lanes) return layoutLanes(nodes, c.edges, laneOrder(visibleNodes.value, laneBy.value, plan.value.lanes));
  return applyPositions(layoutFlow(nodes, c.edges), plan.value.positions);
});

// Picking a workflow that's in a closed box (from a list in the panel) opens the box.
watch(selected, (key) => {
  const box = key ? clustered.value.clusters.find((c) => c.members.includes(key)) : undefined;
  if (box && !box.open) toggleCluster(box.key);
});

/**
 * For the selected planned node: same kind. Ones another plan node already links to stay in
 * the list, marked `linked`, so the dropdown says why they can't be picked.
 */
const linkTargets = computed(() => {
  const node = selectedNode.value;
  if (!node?.planned) return [];
  const taken = new Set(plan.value.nodes.map((n) => n.link).filter(Boolean));
  const kinds = linkableKinds(node.kind);
  return candidates.value
    .filter((c) => kinds.includes(c.kind))
    .map((c) => ({ ...c, linked: taken.has(c.key) }))
    .sort((a, b) => Number(a.linked) - Number(b.linked));
});

const selectedNode = computed(() => merged.value.nodes.find((n) => n.key === selected.value) ?? null);

/** The header pills lead back to the Overview, so they only act as buttons while a node is open. */
const overviewPillAttrs = computed(() =>
  selectedNode.value
    ? { type: 'button', title: t('projectMap.overview.show'), onClick: () => (selected.value = null) }
    : {}
);
const planNodeOf = (node: MapNode | null): PlanNode | undefined =>
  node?.planId ? plan.value.nodes.find((p) => p.id === node.planId) : undefined;

// A planned node that got linked moves to its live key: keep it selected.
watch(merged, (m) => {
  if (!selected.value || m.nodes.some((n) => n.key === selected.value)) return;
  if (selected.value.startsWith('plan:')) {
    const id = selected.value.slice(5);
    selected.value = m.nodes.find((n) => n.planId === id)?.key ?? null;
  } else selected.value = null;
});

// ---- Editing the plan --------------------------------------------------------------

const newId = () => generateIdentifier().replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || String(Date.now());

/** The lane under a point (Lanes layout), if any. */
function laneAt(y: number): string | undefined {
  const lane = layout.value.lanes.find((l) => y >= l.y && y < l.y + l.h);
  return lane?.name || undefined;
}

/**
 * What joining a lane changes on a node: its custom lane, or its owner. Lanes by status
 * or kind follow the node, so dropping it in another one changes nothing.
 */
function lanePatch(lane: string | undefined): Patch | null {
  if (laneBy.value === 'custom') return { lane };
  if (laneBy.value === 'owner') return { owner: lane };
  return null;
}

/**
 * Adds a planned node: where it was dropped, else beside the selected node (Flow), else
 * wherever the layout puts it. Dropped in a lane (Lanes), it joins that lane.
 */
function addNode(kind: MapNodeKind, point?: Point) {
  const id = newId();
  const node: PlanNode = { id, kind, name: t(`projectMap.newName.${kind}`), inputs: [], outputs: [] };
  const beside = selected.value ? layout.value.positions[selected.value] : undefined;
  if (layoutMode.value === 'lanes') {
    const lane = point ? laneAt(point.y + 36) : laneOf(selectedNode.value ?? undefined);
    const patch = lane ? lanePatch(lane) : null;
    if (patch) Object.assign(node, patch);
  } else if (point) plan.value.positions[planKey(id)] = point;
  else if (beside) plan.value.positions[planKey(id)] = { x: beside.x, y: beside.y + 112 };
  plan.value.nodes.push(node);
  showIdeas.value = true;
  selected.value = planKey(id);
  save();
}

function addNote(point?: Point) {
  const at = point ?? canvasRef.value?.center() ?? { x: 40, y: 40 };
  plan.value.notes.push({ id: newId(), text: '', x: at.x, y: at.y, w: 220, color: 'yellow' });
  save();
}

function onAdd(kind: MapDropKind, point?: Point) {
  if (kind === 'note') addNote(point);
  else addNode(kind, point);
}

function updateNote(id: string, patch: Partial<Pick<StickyNote, 'text' | 'color' | 'w' | 'h'>>) {
  const note = plan.value.notes.find((n) => n.id === id);
  if (!note) return;
  Object.assign(note, patch);
  save();
}

function moveNote(id: string, point: Point) {
  const note = plan.value.notes.find((n) => n.id === id);
  if (!note) return;
  note.x = point.x;
  note.y = point.y;
  save();
}

function removeNote(id: string) {
  plan.value.notes = plan.value.notes.filter((n) => n.id !== id);
  save();
}

/** Picked from a list: select it and bring it into view (its box opens first). */
async function pick(key: string) {
  selected.value = key;
  await nextTick();
  setTimeout(() => canvasRef.value?.focus(key), 50);
}

type Patch = Partial<
  Pick<PlanNode, 'name' | 'description' | 'owner' | 'lane' | 'inputs' | 'outputs' | 'readyAt' | 'readyBy' | 'note' | 'when'>
>;

function update(node: MapNode, patch: Patch) {
  const planNode = planNodeOf(node);
  if (planNode) {
    Object.assign(planNode, patch);
    for (const k of Object.keys(patch) as (keyof Patch)[]) if (patch[k] === undefined) delete planNode[k];
  } else {
    const meta = { ...(plan.value.meta[node.key] ?? {}) };
    for (const k of ['owner', 'lane', 'readyAt', 'readyBy', 'note'] as const) {
      if (!(k in patch)) continue;
      if (patch[k] === undefined) delete meta[k];
      else (meta as any)[k] = patch[k];
    }
    if (Object.keys(meta).length) plan.value.meta[node.key] = meta;
    else delete plan.value.meta[node.key];
  }
  save();
}

function removePlanned(node: MapNode) {
  if (!node.planId) return;
  const key = planKey(node.planId);
  plan.value.nodes = plan.value.nodes.filter((p) => p.id !== node.planId);
  plan.value.edges = plan.value.edges.filter((e) => e.from !== key && e.to !== key);
  delete plan.value.positions[key];
  selected.value = null;
  save();
}

function link(node: MapNode, key: string) {
  const planNode = planNodeOf(node);
  if (!planNode) return;
  planNode.link = key;
  const from = planKey(planNode.id);
  if (plan.value.positions[from] && !plan.value.positions[key]) plan.value.positions[key] = plan.value.positions[from];
  delete plan.value.positions[from];
  selected.value = key;
  // Linking makes it part of the project (Core adds it when the plan saves), and something
  // from outside this map shows once Core knows it's linked: save now and load again.
  if (live.value.nodes.some((n) => n.key === key)) {
    adoptLiveEdges(key);
    save();
    void flush().then(load);
    return;
  }
  save();
  void flush()
    .then(load)
    .then(() => {
      if (adoptLiveEdges(key)) save();
    });
}

/**
 * Linking to something already built: its real lines go on the plan as they are, so the
 * Plan check only flags lines that change after linking. Returns whether any were added.
 */
function adoptLiveEdges(key: string): boolean {
  const onMap = new Set(live.value.nodes.map((n) => n.key));
  // Lines drawn while it was planned are stored by plan key: compare after the link resolves them.
  const planned = new Set(merged.value.edges.filter((e) => e.source !== 'live').map((e) => e.key));
  let added = false;
  for (const e of live.value.edges) {
    if (e.from !== key && e.to !== key) continue;
    if (!onMap.has(e.from) || !onMap.has(e.to)) continue;
    if (planned.has(edgeKey(e.from, e.to, e.kind))) continue;
    plan.value.edges.push({ id: generateIdentifier().slice(0, 12), from: e.from, to: e.to, kind: e.kind });
    added = true;
  }
  return added;
}

function unlink(nodeKey: string) {
  const node = merged.value.nodes.find((n) => n.key === nodeKey);
  const planNode = planNodeOf(node ?? null);
  if (!node || !planNode) return;
  // A schedule stays on the map while it starts one of the project's workflows: unlinking
  // deletes it (asked first), so only the idea is left, as for a workflow.
  if (planNode.link?.startsWith('schedule:') && !node.linkMissing) {
    pendingScheduleUnlink = node;
    unlinkingSchedule.value = node;
    return;
  }
  detach(node, planNode);
}

/**
 * Takes the link off. Core takes out of the project what the link brought in; what was in
 * it before stays, and a global the project's workflows use stays on the map: both are said.
 */
function detach(node: MapNode, planNode: PlanNode, after?: () => void) {
  const link = planNode.link;
  const kept = !!planNode.alreadyIn;
  delete planNode.link;
  delete planNode.alreadyIn;
  selected.value = planKey(planNode.id);
  save();
  // What came onto the map only through the link (its sub-workflows and schedules, say)
  // goes once Core knows it's unlinked, not at the next reload.
  void flush()
    .then(load)
    .then(() => {
      if (after) return after();
      if (!link) return;
      const member = link.startsWith('task:') || link.startsWith('app:');
      const stays = live.value.nodes.some((n) => n.key === link);
      if (member && kept) toast.info(t('projectMap.unlinked.kept', { name: node.name }));
      else if (member) {
        toast.success(t('projectMap.unlinked.removed', { name: node.name }), {
          description: t('projectMap.unlinked.removedDescription'),
        });
      } else if (link.startsWith('global:') && stays) toast.info(t('projectMap.unlinked.globalUsed', { name: node.name }));
    });
}

/** A linked schedule being unlinked: asked first, since unlinking deletes it. */
const unlinkingSchedule = ref<MapNode | null>(null);
// The dialog's action button closes it (clearing `unlinkingSchedule`) before our click
// handler runs, so the handler works from this copy taken when the dialog opened.
let pendingScheduleUnlink: MapNode | null = null;
async function confirmUnlinkSchedule() {
  const node = pendingScheduleUnlink;
  pendingScheduleUnlink = null;
  unlinkingSchedule.value = null;
  const planNode = planNodeOf(node);
  const link = planNode?.link;
  if (!node || !planNode || !link) return;
  try {
    await invokeCore(SEND.SCHEDULE_REMOVE, { scheduleIdentifier: link.slice('schedule:'.length) });
  } catch (error: any) {
    toast.error(t('schedules.deleteFailed'), { description: error?.message ?? String(error) });
    return;
  }
  // Undo can't bring the schedule back: history starts again from here.
  detach(node, planNode, () => {
    resetHistory();
    toast.success(t('projectMap.unlinked.scheduleDeleted', { name: node.name }));
  });
}

/** Where a node's lines are stored: its plan key while planned, else its live key. */
const endOf = (node: MapNode) => (node.planned && node.planId ? planKey(node.planId) : node.key);

function connect(fromKey: string, toKey: string) {
  const from = merged.value.nodes.find((n) => n.key === fromKey);
  const to = merged.value.nodes.find((n) => n.key === toKey);
  if (!from || !to) return;
  // From a global means "reads it"; backwards to an app or schedule gets turned (see drawnEdge).
  const drawn = drawnEdge(from.kind, to.kind);
  if (!drawn) {
    toast.error(
      t('projectMap.cantConnect', {
        from: t(`projectMap.kind.${from.kind}`),
        to: t(`projectMap.kind.${to.kind}`),
      })
    );
    return;
  }
  const [a, b] = drawn.turned ? [to, from] : [from, to];
  // A schedule starts one workflow: a second line from one becomes a new planned schedule.
  if (drawn.kind === 'triggers') {
    const other = merged.value.edges.find((e) => e.kind === 'triggers' && e.from === a.key && e.to !== b.key);
    if (other) {
      const id = newId();
      plan.value.nodes.push({ id, kind: 'schedule', name: t('projectMap.newName.schedule'), inputs: [], outputs: [], ...(a.lane ? { lane: a.lane } : {}) });
      const at = layout.value.positions[a.key];
      if (at && layoutMode.value !== 'lanes') plan.value.positions[planKey(id)] = { x: at.x, y: at.y + 112 };
      showIdeas.value = true;
      addEdge(planKey(id), endOf(b), 'triggers');
      toast.info(t('projectMap.schedule.oneWorkflow', { name: b.name }));
      return;
    }
  }
  addEdge(endOf(a), endOf(b), drawn.kind);
}

function addEdge(from: string, to: string, kind: MapEdgeKind) {
  if (plan.value.edges.some((e) => e.from === from && e.to === to && e.kind === kind)) return;
  plan.value.edges.push({ id: generateIdentifier().slice(0, 12), from, to, kind });
  save();
}

/**
 * A schedule starts one workflow. Moves a planned "starts" line onto a new planned
 * schedule of its own, placed under the one it came from.
 */
function moveToNewSchedule(planEdgeId: string, quiet = false) {
  const edge = plan.value.edges.find((e) => e.id === planEdgeId);
  if (!edge || edge.kind !== 'triggers') return;
  const fromKey = edge.from.startsWith('plan:')
    ? (merged.value.nodes.find((n) => n.planId === edge.from.slice(5))?.key ?? edge.from)
    : edge.from;
  const id = newId();
  // The new one runs when the one it came from was meant to: same idea, other workflow.
  const when = edge.from.startsWith('plan:') ? plan.value.nodes.find((n) => n.id === edge.from.slice(5))?.when : undefined;
  plan.value.nodes.push({
    id,
    kind: 'schedule',
    name: t('projectMap.newName.schedule'),
    inputs: [],
    outputs: [],
    ...(when ? { when } : {}),
  });
  const at = layout.value.positions[fromKey];
  if (at && layoutMode.value !== 'lanes') plan.value.positions[planKey(id)] = { x: at.x, y: at.y + 112 };
  const lane = byKey.value.get(fromKey)?.lane;
  if (lane) plan.value.nodes[plan.value.nodes.length - 1].lane = lane;
  edge.from = planKey(id);
  showIdeas.value = true;
  if (!quiet) selected.value = planKey(id);
  save();
}

/** A planned schedule drawn to several workflows: keeps the first line, gives each other one its own schedule. */
function splitSchedule(node: MapNode) {
  const end = endOf(node);
  const extra = plan.value.edges.filter((e) => e.kind === 'triggers' && e.from === end).slice(1);
  for (const e of extra) moveToNewSchedule(e.id, true);
}

function removeEdge(planEdgeId: string) {
  plan.value.edges = plan.value.edges.filter((e) => e.id !== planEdgeId);
  save();
}

/**
 * A planned workflow–global line switched between reads and writes. When the plan already
 * has that line (drawn to the linked global directly, say), this one just goes.
 */
function setEdgeKind(planEdgeId: string, kind: MapEdgeKind) {
  const edge = plan.value.edges.find((e) => e.id === planEdgeId);
  const drawn = merged.value.edges.find((e) => e.planEdgeId === planEdgeId);
  if (!edge || !drawn) return;
  const twin = merged.value.edges.find(
    (e) => e.planEdgeId && e.planEdgeId !== planEdgeId && e.key === edgeKey(drawn.from, drawn.to, kind)
  );
  if (twin) plan.value.edges = plan.value.edges.filter((e) => e.id !== planEdgeId);
  else edge.kind = kind;
  save();
}

function ignore(differenceKey: string) {
  if (!plan.value.ignored.includes(differenceKey)) plan.value.ignored.push(differenceKey);
  save();
}

function acceptFields(nodeKey: string, which: 'inputs' | 'outputs', actual: string[]) {
  const planNode = planNodeOf(merged.value.nodes.find((n) => n.key === nodeKey) ?? null);
  if (!planNode) return;
  planNode[which] = [...actual];
  save();
}

/** Flow: the node stays where it was dropped. Lanes: it joins the lane it was dropped in. */
function move(key: string, point: Point) {
  if (layoutMode.value === 'lanes') {
    const node = byKey.value.get(key);
    const lane = laneAt(point.y + 36);
    const patch = lanePatch(lane);
    if (node && !node.external && patch && lane !== laneOf(node)) update(node, patch);
    nudge.value++;
    return;
  }
  const { positions, shift } = placeNode(layout.value.positions, key, point);
  Object.assign(plan.value.positions, positions);
  if (shift) {
    for (const note of plan.value.notes) {
      note.x += shift.x;
      note.y += shift.y;
    }
    canvasRef.value?.panBy(shift);
  }
  save();
}

function resetLayout() {
  plan.value.positions = {};
  save();
}

function addLane(name: string) {
  if (!name || plan.value.lanes.includes(name)) return;
  plan.value.lanes.push(name);
  save();
}

function moveLane(name: string, by: -1 | 1) {
  const lanes = [...plan.value.lanes];
  const i = lanes.indexOf(name);
  const j = i + by;
  if (i < 0 || j < 0 || j >= lanes.length) return;
  [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  plan.value.lanes = lanes;
  save();
}

function removeLane(name: string) {
  plan.value.lanes = plan.value.lanes.filter((l) => l !== name);
  for (const n of plan.value.nodes) if (n.lane === name) delete n.lane;
  for (const meta of Object.values(plan.value.meta)) if (meta.lane === name) delete meta.lane;
  save();
}

/** A workflow or app this project uses but that isn't in it joins it (staying in its others). */
async function adopt(node: MapNode) {
  if (!node.ref) return;
  try {
    await assignToProject(node.kind === 'app' ? 'app' : 'task', props.projectIdentifier, node.ref);
    await load();
    resetHistory();
  } catch (error: any) {
    toast.error(t('projectMap.details.adoptFailed'), { description: error?.message ?? String(error) });
  }
}

/** Taking a workflow or app out of this project: asked first, since its card leaves the map. */
const removing = ref<MapNode | null>(null);
// The dialog's action button closes it (clearing `removing`) before our click handler runs,
// so the handler works from this copy taken when the dialog opened.
let pendingRemove: MapNode | null = null;
function askRemoveFromProject(node: MapNode) {
  pendingRemove = node;
  removing.value = node;
}
async function confirmRemoveFromProject() {
  const node = pendingRemove;
  pendingRemove = null;
  removing.value = null;
  if (!node?.ref) return;
  try {
    // Its card goes with it; the workflow itself is kept (and stays in any other projects).
    const planNode = planNodeOf(node);
    if (planNode) {
      plan.value.nodes = plan.value.nodes.filter((p) => p.id !== planNode.id);
      await flush();
    }
    await removeFromProject(node.kind === 'app' ? 'app' : 'task', props.projectIdentifier, node.ref);
    selected.value = null;
    await load();
  } catch (error: any) {
    toast.error(t('projectMap.details.removeFromProjectFailed'), { description: error?.message ?? String(error) });
  }
}

/** Signs a node off as ready (with today's time and the default author), or takes it back. */
function markReady(node: MapNode, on: boolean) {
  if (on) {
    update(node, { readyAt: new Date().toISOString(), readyBy: newItemDefaults.author() || undefined });
  } else update(node, { readyAt: undefined, readyBy: undefined });
}

const creating = ref(false);

const GLOBAL_DEFAULTS: Record<string, unknown> = { string: '', number: 0, boolean: false, object: {}, array: [] };

/**
 * Makes a planned app, global or schedule for real, then links the planned node to it so
 * its lines come from the definition from now on.
 */
async function create(node: MapNode, options: { type?: string; when?: string }) {
  const planNode = planNodeOf(node);
  if (!planNode || creating.value) return;
  creating.value = true;
  try {
    let key: string | null = null;
    if (node.kind === 'app') {
      const app = await invokeCore<{ identifier: string }>(SEND.APP_NEW, {
        name: planNode.name,
        description: planNode.description || planNode.name,
      });
      await invokeCore(SEND.PROJECT_ASSIGN_APP, { projectIdentifier: props.projectIdentifier, appIdentifier: app.identifier });
      key = `app:${app.identifier}`;
    } else if (node.kind === 'global') {
      const type = options.type ?? 'string';
      await invokeCore(SEND.VARIABLE_NEW, {
        name: planNode.name,
        type,
        description: planNode.description || undefined,
        value: GLOBAL_DEFAULTS[type],
      });
      key = `global:${planNode.name}`;
    } else if (node.kind === 'schedule' && options.when) {
      const edge = merged.value.edges.find((e) => e.from === node.key && e.kind === 'triggers');
      const target = edge ? merged.value.nodes.find((n) => n.key === edge.to) : undefined;
      if (!target?.ref || target.planned) return;
      const created = await invokeCore<{ scheduleIdentifier: string }>(SEND.SCHEDULE_SET, {
        identifier: target.ref,
        when: options.when,
      });
      key = `schedule:${created.scheduleIdentifier}`;
    }
    if (!key) return;
    link(node, key);
    await flush();
    await load();
    resetHistory();
    toast.success(t('projectMap.created', { name: planNode.name }));
  } catch (error: any) {
    toast.error(t('projectMap.createFailed'), { description: error?.message ?? String(error) });
  } finally {
    creating.value = false;
  }
}

async function build(node: MapNode) {
  if (!node.planId) return;
  if (saveTimer) await flush();
  const brief = draftBrief(merged.value, node.key);
  await agentStore.draftFromMap(brief.text, brief.reuse, {
    projectIdentifier: props.projectIdentifier,
    nodeId: node.planId,
  });
}

// ---- Copy, paste, duplicate ---------------------------------------------------------
// A copy is always an idea: copying a workflow that exists plans another one like it.

function clipOf(node: MapNode): MapClip {
  const planNode = planNodeOf(node);
  const clip: MapClip['node'] = {
    kind: node.kind,
    name: node.name,
    inputs: [...(planNode?.inputs ?? node.inputs)],
    outputs: [...(planNode?.outputs ?? node.outputs)],
  };
  const description = planNode?.description ?? node.description ?? undefined;
  if (description) clip.description = description;
  if (node.owner) clip.owner = node.owner;
  if (node.lane) clip.lane = node.lane;
  if (node.note) clip.note = node.note;
  return { node: clip, from: node.key };
}

function copySelected() {
  if (selectedNode.value) mapClipboard.value = clipOf(selectedNode.value);
}

/** Adds the clip as a new idea, a step down and right from the node it came from (or the selected one). */
function pasteClip(clip: MapClip) {
  const id = newId();
  const node: PlanNode = { ...JSON.parse(JSON.stringify(clip.node)), id, name: t('projectMap.copyName', { name: clip.node.name }) };
  const base = layout.value.positions[clip.from] ?? (selected.value ? layout.value.positions[selected.value] : undefined);
  if (base && layoutMode.value === 'flow') {
    // Past any copies already pasted there.
    const taken = Object.values(layout.value.positions);
    let point = { x: base.x + 40, y: base.y + 40 };
    while (taken.some((p) => Math.abs(p.x - point.x) < 10 && Math.abs(p.y - point.y) < 10)) {
      point = { x: point.x + 40, y: point.y + 40 };
    }
    plan.value.positions[planKey(id)] = point;
  }
  plan.value.nodes.push(node);
  showIdeas.value = true;
  selected.value = planKey(id);
  save();
}

function paste() {
  if (mapClipboard.value) pasteClip(mapClipboard.value);
}

function duplicateSelected() {
  if (selectedNode.value) pasteClip(clipOf(selectedNode.value));
}

/** Delete removes an idea only: what exists is deleted where it lives, not from the map. */
function deleteSelected() {
  const node = selectedNode.value;
  if (node?.planned) removePlanned(node);
}

// Like the app builder. Text fields keep their own undo, copy and paste; an open menu,
// list or dialog keeps its keys too.
const onCanvas = () => !document.activeElement?.closest('[role="dialog"], [role="menu"], [role="listbox"]');
const hasSelection = () => onCanvas() && !!selectedNode.value;
useKeyboardShortcuts([
  { key: 'z', meta: true, skipWhenEditable: true, enabled: onCanvas, handler: undo },
  { key: 'z', meta: true, shift: true, skipWhenEditable: true, enabled: onCanvas, handler: redo },
  { key: 'c', meta: true, skipWhenEditable: true, enabled: hasSelection, handler: copySelected },
  { key: 'v', meta: true, skipWhenEditable: true, enabled: () => onCanvas() && !!mapClipboard.value, handler: paste },
  { key: 'd', meta: true, skipWhenEditable: true, enabled: hasSelection, handler: duplicateSelected },
  { key: 'Delete', skipWhenEditable: true, enabled: () => hasSelection() && !!selectedNode.value?.planned, handler: deleteSelected },
  { key: 'Backspace', skipWhenEditable: true, enabled: () => hasSelection() && !!selectedNode.value?.planned, handler: deleteSelected },
  { key: 'Escape', skipWhenEditable: true, enabled: hasSelection, handler: () => (selected.value = null) },
]);

const isEmpty = computed(() => !loading.value && !visibleNodes.value.length);
</script>

<template>
  <div class="flex h-full min-h-0 w-full">
    <!-- Left: what to add, lanes, what needs attention, what's on the map -->
    <aside class="hidden w-72 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div class="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span class="text-base font-semibold">{{ t('projectMap.editor.title') }}</span>
        <span class="truncate pl-2 text-xs text-muted-foreground">{{ projectName }}</span>
      </div>
      <MapSidebar
        class="min-h-0 flex-1"
        :nodes="visibleNodes"
        :differences="merged.differences"
        :lanes-layout="layoutMode === 'lanes'"
        :lane-by="laneBy"
        :lanes="plan.lanes"
        :selected="selected"
        @select="pick"
        @add="onAdd($event)"
        @lane-add="addLane"
        @lane-remove="removeLane"
        @lane-move="moveLane"
      />
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Same order as the builders: back, name, view switches | save state, status -->
      <!--
        Sized by its own width (the Assistant panel narrows it, not just the window): the left side
        shrinks and drops labels first, the right side never shrinks, so the Assistant button stays put.
      -->
      <div class="@container flex h-12 shrink-0 items-center gap-2 border-b px-3 text-sm">
        <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <Button variant="ghost" size="icon" class="shrink-0" :aria-label="t('projectMap.editor.back')" @click="router.push(`/projects/${projectIdentifier}`)">
            <ArrowLeft class="size-4" />
          </Button>
          <div class="h-5 w-px shrink-0 bg-border" />
          <span class="hidden min-w-0 truncate text-muted-foreground @5xl:inline">{{ projectName }}</span>
          <span class="hidden text-muted-foreground/60 @5xl:inline">/</span>
          <span class="hidden shrink-0 font-semibold @3xl:inline">{{ t('projectMap.editor.title') }}</span>

          <div role="group" :aria-label="t('projectMap.layoutLabel')" class="flex shrink-0 items-center rounded-md border p-0.5 @3xl:ml-3">
            <Button
              v-for="l in (['flow', 'lanes'] as LayoutMode[])"
              :key="l"
              size="sm"
              :variant="layoutMode === l ? 'secondary' : 'ghost'"
              class="h-7 px-2.5"
              :aria-pressed="layoutMode === l"
              @click="layoutMode = l"
            >
              {{ t(`projectMap.layout.${l}`) }}
            </Button>
          </div>

          <Select v-if="layoutMode === 'lanes'" :model-value="laneBy" @update:model-value="setLaneBy($event as LaneBy)">
            <SelectTrigger class="ml-1 h-8 w-auto shrink-0 gap-1.5 text-xs" :aria-label="t('projectMap.lanes.groupBy')">
              <span class="hidden text-muted-foreground @4xl:inline">{{ t('projectMap.lanes.groupBy') }}</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="by in LANE_BY" :key="by" :value="by">{{ t(`projectMap.lanes.by.${by}`) }}</SelectItem>
            </SelectContent>
          </Select>

          <label class="ml-2 flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground" :title="t('projectMap.ideas.hint')">
            <Switch v-model="showIdeas" :aria-label="t('projectMap.ideas.label')" />
            <span class="hidden whitespace-nowrap @4xl:inline">{{ t('projectMap.ideas.label') }}</span>
          </label>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <div class="flex items-center">
            <Button size="icon" variant="ghost" class="size-8" :disabled="!undoStack.length" :title="t('projectMap.editor.undo')" :aria-label="t('projectMap.editor.undo')" @click="undo">
              <Undo2 class="size-4" />
            </Button>
            <Button size="icon" variant="ghost" class="size-8" :disabled="!redoStack.length" :title="t('projectMap.editor.redo')" :aria-label="t('projectMap.editor.redo')" @click="redo">
              <Redo2 class="size-4" />
            </Button>
          </div>

          <span
            v-if="saveState !== 'idle'"
            class="flex items-center gap-1 text-xs"
            :class="saveState === 'error' ? 'text-destructive' : 'text-muted-foreground'"
            role="status"
          >
            <Check v-if="saveState === 'saved'" class="size-3 text-green-500" />
            <Loader2 v-else-if="saveState === 'saving'" class="size-3 animate-spin @4xl:hidden" />
            <span class="whitespace-nowrap" :class="saveState === 'error' ? '' : 'sr-only @4xl:not-sr-only'">{{ t(`projectMap.save.${saveState}`) }}</span>
            <button v-if="saveState === 'error'" type="button" class="underline" @click="flush">{{ t('projectMap.save.retry') }}</button>
          </span>
          <component
            :is="selectedNode ? 'button' : 'span'"
            v-if="merged.progress.total"
            v-bind="overviewPillAttrs"
            class="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-900 dark:bg-green-950 dark:text-green-300"
            :class="selectedNode && 'hover:bg-green-200 dark:hover:bg-green-900'"
          >
            <span class="sr-only whitespace-nowrap @4xl:not-sr-only">{{ t('projectMap.progress', { ready: merged.progress.ready, total: merged.progress.total }) }}</span>
            <span aria-hidden="true" class="@4xl:hidden">{{ merged.progress.ready }}/{{ merged.progress.total }}</span>
          </component>
          <component
            :is="selectedNode ? 'button' : 'span'"
            v-if="merged.differences.length"
            v-bind="overviewPillAttrs"
            class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300"
            :class="selectedNode && 'hover:bg-amber-200 dark:hover:bg-amber-900'"
          >
            <span class="sr-only whitespace-nowrap @4xl:not-sr-only">{{ t('projectMap.editor.differences', { count: merged.differences.length }, merged.differences.length) }}</span>
            <span aria-hidden="true" class="inline-flex items-center gap-1 @4xl:hidden"><TriangleAlert class="size-3" />{{ merged.differences.length }}</span>
          </component>
          <Button
            v-if="layoutMode === 'flow' && Object.keys(plan.positions).length"
            size="sm"
            variant="ghost"
            :title="t('projectMap.resetLayoutHint')"
            :aria-label="t('projectMap.resetLayout')"
            @click="resetLayout"
          >
            <RotateCcw class="size-3.5" /> <span class="hidden @5xl:inline">{{ t('projectMap.resetLayout') }}</span>
          </Button>
          <Button size="icon" variant="ghost" :aria-label="t('projectMap.refresh')" :title="t('projectMap.refresh')" @click="load">
            <RefreshCw class="size-3.5" />
          </Button>
          <div class="h-5 w-px bg-border" />
          <AssistantButton />
        </div>
      </div>

      <div v-if="loading" class="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 class="size-5 animate-spin" />
      </div>
      <div v-else-if="loadError" class="m-4 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{{ loadError }}</div>
      <div v-else class="relative min-h-0 flex-1">
        <MapCanvas
          ref="canvasRef"
          :nodes="clustered.nodes"
          :edges="clustered.edges"
          :clusters="clustered.clusters"
          :by-key="byKey"
          :layout="layout"
          :selected="selected"
          :editable="true"
          :draggable="true"
          :fit-key="layoutMode === 'lanes' ? `lanes:${laneBy}` : layoutMode"
          :lane-labels="laneLabels"
          :notes="plan.notes"
          :nudge="nudge"
          @select="selected = $event"
          @move="move"
          @connect="connect"
          @toggle-cluster="toggleCluster"
          @drop="(kind, point) => onAdd(kind, point)"
          @note-move="moveNote"
          @note-update="updateNote"
          @note-remove="removeNote"
        />
        <div
          v-if="lanesHint"
          class="absolute left-1/2 top-3 z-10 flex max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-xs shadow-sm"
          role="status"
        >
          <span class="text-muted-foreground">{{ t(`projectMap.lanes.hint.${lanesHint}`) }}</span>
          <Button
            size="sm"
            variant="outline"
            class="h-7 shrink-0"
            @click="setLaneBy(lanesHint === 'custom' ? 'owner' : 'custom')"
          >
            {{ t(lanesHint === 'custom' ? 'projectMap.lanes.hint.useOwner' : 'projectMap.lanes.hint.useCustom') }}
          </Button>
        </div>
        <div v-if="isEmpty && !plan.notes.length" class="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div class="pointer-events-auto max-w-md rounded-xl border bg-card p-6 text-center text-sm shadow-sm">
            <p class="font-semibold">{{ t('projectMap.empty.title') }}</p>
            <p class="mt-1 text-muted-foreground">{{ t('projectMap.empty.description') }}</p>
            <Button class="mt-4" size="sm" @click="addNode('workflow')">
              <Plus class="size-3.5" /> {{ t('projectMap.empty.start') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: the selected node, or how the plan is going -->
    <aside class="hidden w-[340px] shrink-0 flex-col border-l bg-background lg:flex">
      <div class="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span class="text-base font-semibold">
          {{ selectedNode ? t('projectMap.editor.details') : t('projectMap.overview.title') }}
        </span>
        <button
          v-if="selectedNode"
          type="button"
          class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          :aria-label="t('common.close')"
          @click="selected = null"
        >
          <X class="size-4" />
        </button>
      </div>
      <div class="min-h-0 flex-1">
        <!-- Someone else's private workflow: nothing to show about it. -->
        <div v-if="selectedNode?.hidden" class="flex flex-col gap-2 p-4 text-sm">
          <h3 class="text-base font-semibold">{{ t('projectMap.node.hidden') }}</h3>
          <p class="text-muted-foreground">{{ t('projectMap.details.hidden') }}</p>
        </div>
        <MapDetailsPanel
          v-else-if="selectedNode"
          :key="selectedNode.key"
          :node="selectedNode"
          :map="merged"
          :plan-node="planNodeOf(selectedNode)"
          :editable="true"
          :lanes="plan.lanes"
          :creating="creating"
          :link-targets="linkTargets"
          :hide-header-close="true"
          @select="pick"
          @close="selected = null"
          @update="update(selectedNode, $event)"
          @ready="markReady(selectedNode, $event)"
          @remove="removePlanned(selectedNode)"
          @link="link(selectedNode, $event)"
          @unlink="unlink(selectedNode.key)"
          @remove-edge="removeEdge"
          @set-edge-kind="setEdgeKind"
          @build="build(selectedNode)"
          @create="create(selectedNode, $event)"
          @split-schedule="splitSchedule(selectedNode)"
          @changed="load"
          @adopt="adopt(selectedNode)"
          @remove-from-project="askRemoveFromProject(selectedNode)"
        />
        <MapOverviewPanel
          v-else
          :map="merged"
          :hide-title="true"
          @select="pick"
          @remove-edge="removeEdge"
          @set-edge-kind="setEdgeKind"
          @new-schedule="moveToNewSchedule"
          @add-edge="addEdge"
          @ignore="ignore"
          @accept-fields="acceptFields"
          @unlink="unlink"
        />
      </div>
    </aside>
    <AlertDialog :open="!!unlinkingSchedule" @update:open="(v) => !v && (unlinkingSchedule = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('projectMap.unlinkSchedule.title', { name: unlinkingSchedule?.name ?? '' }) }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t('projectMap.unlinkSchedule.description') }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmUnlinkSchedule"
          >
            {{ t('projectMap.unlinkSchedule.confirm') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog :open="!!removing" @update:open="(v) => !v && (removing = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('projectMap.removeFromProject.title', { name: removing?.name ?? '' }) }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t(removing?.planId ? 'projectMap.removeFromProject.descriptionCard' : 'projectMap.removeFromProject.description') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="confirmRemoveFromProject">{{ t('projectMap.removeFromProject.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
