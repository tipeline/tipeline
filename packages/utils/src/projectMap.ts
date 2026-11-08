import { z } from 'zod';

/**
 * The project map: what a project's workflows, apps, globals and schedules are, and how
 * they connect. Two layers:
 *
 * - The live map, which Core reads from the definitions every time (never stored, so it
 *   can't go stale): sub-workflow calls, the workflows each app runs, the globals each
 *   workflow writes and reads, and the schedules that start workflows.
 * - The plan, which is stored per project: nodes for things not built yet, lines drawn by
 *   hand, and per-node notes (owner, lane, planned inputs and outputs, a Ready sign-off).
 *
 * Statuses are worked out, never typed in: idea (only planned), drafting (an assistant
 * draft), built (exists, no successful run since its last change), tested (ran
 * successfully since). Ready is the one a person sets, and a later change undoes it.
 *
 * `mergeMap` lays the plan over the live map and lists where the two disagree.
 */

export type MapNodeKind = 'workflow' | 'helper' | 'app' | 'global' | 'schedule';

/**
 * How two nodes connect. A line goes from whatever does something to what it's done to,
 * so every line reads as a sentence: "Activity Log runs Suite", "Suite runs Child".
 * - `calls`: a workflow runs another as a sub-workflow (caller → sub-workflow)
 * - `runs`: an app runs a workflow (app → workflow)
 * - `writes`: a workflow sets a global (workflow → global)
 * - `reads`: a workflow or app reads a global (reader → global)
 * - `triggers`: a schedule starts a workflow (schedule → workflow)
 */
export type MapEdgeKind = 'calls' | 'runs' | 'writes' | 'reads' | 'triggers';

const EDGE_KINDS = ['calls', 'runs', 'writes', 'reads', 'triggers'] as const;

export type PlanStatus = 'idea' | 'drafting' | 'built' | 'tested' | 'ready';

export const PLAN_STATUSES: PlanStatus[] = ['idea', 'drafting', 'built', 'tested', 'ready'];

export type MapProjectRef = { identifier: string; name: string; color: string | null };

/** A node of the live map, read from a definition. */
export type LiveMapNode = {
  /** `task:<identifier>`, `app:<identifier>`, `global:<name>` or `schedule:<identifier>`. */
  key: string;
  kind: MapNodeKind;
  name: string;
  /** The workflow or app identifier, the global's name, the schedule identifier. */
  ref: string;
  description?: string | null;
  /** The project it lives in; null when it's in none (globals and schedules have none). */
  project: MapProjectRef | null;
  /** Shown because something in the project uses it, but it lives elsewhere. */
  external?: boolean;
  /** A global the workflows use that doesn't exist. */
  missing?: boolean;
  /** A workflow's inputs and outputs, by variable name. */
  inputs?: string[];
  outputs?: string[];
  /** A workflow that builds global names while it runs: its globals can't be known. */
  dynamicGlobals?: boolean;
  /** A schedule's timing, in words Core already formats elsewhere (cron, every_seconds…). */
  timing?: string;
  /** A workflow the assistant drafted that nobody has marked ready yet. */
  draft?: boolean;
  /** When a workflow was last saved (ISO). */
  changedAt?: string | null;
  /** When a workflow last ran successfully (ISO). */
  lastSuccessAt?: string | null;
  /** A schedule that's switched on. */
  enabled?: boolean;
};

export type LiveMapEdge = { from: string; to: string; kind: MapEdgeKind };

export type LiveMap = { nodes: LiveMapNode[]; edges: LiveMapEdge[] };

export const planNodeSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['workflow', 'helper', 'app', 'global', 'schedule']),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  owner: z.string().max(200).optional(),
  lane: z.string().max(100).optional(),
  inputs: z.array(z.string().max(200)).max(100).default([]),
  outputs: z.array(z.string().max(200)).max(100).default([]),
  /** The live node it became: once linked, its lines come from the definition. */
  link: z.string().max(300).optional(),
  /** Signed off as ready (ISO time), and by whom. */
  readyAt: z.string().max(40).optional(),
  readyBy: z.string().max(200).optional(),
  /** A note pinned to the node. */
  note: z.string().max(4000).optional(),
});

export const planEdgeSchema = z.object({
  id: z.string().min(1).max(40),
  /** A live node key or `plan:<id>`. */
  from: z.string().min(1).max(300),
  to: z.string().min(1).max(300),
  kind: z.enum(EDGE_KINDS),
});

/** Notes on a live node that isn't in the plan as a planned node. */
export const nodeMetaSchema = z.object({
  owner: z.string().max(200).optional(),
  lane: z.string().max(100).optional(),
  readyAt: z.string().max(40).optional(),
  readyBy: z.string().max(200).optional(),
  note: z.string().max(4000).optional(),
});

export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink'] as const;

/** A sticky note anywhere on the map. */
export const stickyNoteSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().max(4000).default(''),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().min(120).max(800).default(220),
  /** Set once the note is resized; until then it's as tall as three lines of text. */
  h: z.number().finite().min(80).max(1200).optional(),
  color: z.enum(NOTE_COLORS).default('yellow'),
});

export type StickyNote = z.infer<typeof stickyNoteSchema>;

export const projectMapPlanSchema = z.object({
  /** 2: lines go from the one doing it (v1 drew sub-workflow, app and read lines the other way). */
  version: z.literal(2).default(2),
  nodes: z.array(planNodeSchema).max(500).default([]),
  edges: z.array(planEdgeSchema).max(2000).default([]),
  /** Where the user put each node (by key); the rest are placed automatically. */
  positions: z.record(z.object({ x: z.number().finite(), y: z.number().finite() })).default({}),
  meta: z.record(nodeMetaSchema).default({}),
  /** Lane names, top to bottom. */
  lanes: z.array(z.string().min(1).max(100)).max(20).default([]),
  /** What the Lanes layout groups by; unset: custom lanes if there are any, else owner. */
  laneBy: z.enum(['owner', 'status', 'kind', 'custom']).optional(),
  /** Differences the user chose to ignore, by `differenceKey`. */
  ignored: z.array(z.string().max(700)).max(2000).default([]),
  notes: z.array(stickyNoteSchema).max(300).default([]),
});

export type PlanNode = z.infer<typeof planNodeSchema>;
export type PlanEdge = z.infer<typeof planEdgeSchema>;
export type ProjectMapPlan = z.infer<typeof projectMapPlanSchema>;

export function emptyPlan(): ProjectMapPlan {
  return { version: 2, nodes: [], edges: [], positions: {}, meta: {}, lanes: [], ignored: [], notes: [] };
}

/** A stored plan, or an empty one when there's none or it can't be read. */
export function parsePlan(raw: unknown): ProjectMapPlan {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return emptyPlan();
    }
  }
  const parsed = projectMapPlanSchema.safeParse(upgradePlan(data ?? {}));
  return parsed.success ? parsed.data : emptyPlan();
}

/** v1 line kinds that v2 draws the other way round, and their v2 names. */
const V1_TURNED: Record<string, string> = { feeds: 'calls', runs: 'runs', reads: 'reads' };

/**
 * A v1 plan with its lines turned to v2's direction: hand-drawn lines, ignored
 * differences (`<prefix>|<kind>|<from>|<to>`) and box positions (`cluster:<kind>:in|out:<anchor>`).
 */
function upgradePlan(data: any): any {
  if (!data || typeof data !== 'object' || (data.version !== undefined && data.version !== 1)) return data;
  const turnEdge = (e: any) => {
    const kind = V1_TURNED[e?.kind];
    return kind ? { ...e, kind, from: e.to, to: e.from } : e;
  };
  const turnKey = (key: string) => {
    const parts = key.split('|');
    if (parts.length !== 4 || !V1_TURNED[parts[1]]) return key;
    return [parts[0], V1_TURNED[parts[1]], parts[3], parts[2]].join('|');
  };
  const turnCluster = (key: string) => {
    const m = key.match(/^cluster:([a-z]+):(in|out):(.*)$/);
    if (!m || !V1_TURNED[m[1]]) return key;
    return `cluster:${V1_TURNED[m[1]]}:${m[2] === 'in' ? 'out' : 'in'}:${m[3]}`;
  };
  const positions =
    data.positions && typeof data.positions === 'object'
      ? Object.fromEntries(Object.entries(data.positions).map(([k, v]) => [turnCluster(k), v]))
      : data.positions;
  return {
    ...data,
    version: 2,
    edges: Array.isArray(data.edges) ? data.edges.map(turnEdge) : data.edges,
    ignored: Array.isArray(data.ignored) ? data.ignored.map((k: unknown) => (typeof k === 'string' ? turnKey(k) : k)) : data.ignored,
    positions,
  };
}

export const planKey = (id: string) => `plan:${id}`;

const isWorkflowKind = (kind: MapNodeKind) => kind === 'workflow' || kind === 'helper';

/**
 * The kind of line between two nodes, or null when they can't connect that way round.
 * A workflow → global line is `writes`; a read is drawn the same way, so it's asked for
 * by name (`drawnEdge` turns a line dragged from a global into one).
 */
export function edgeKindFor(from: MapNodeKind, to: MapNodeKind): MapEdgeKind | null {
  if (isWorkflowKind(from) && isWorkflowKind(to)) return 'calls';
  if (from === 'app' && isWorkflowKind(to)) return 'runs';
  if (isWorkflowKind(from) && to === 'global') return 'writes';
  if (from === 'app' && to === 'global') return 'reads';
  if (from === 'schedule' && isWorkflowKind(to)) return 'triggers';
  return null;
}

/**
 * A line someone dragged from one node to another, as stored: its kind and whether it
 * turns round. Dragged from a global to a workflow or app, it means "reads" and points at
 * the global. Dragged backwards to an app or schedule, it's turned. A sub-workflow line
 * keeps the way it was drawn: that says which one runs which.
 */
export function drawnEdge(from: MapNodeKind, to: MapNodeKind): { kind: MapEdgeKind; turned: boolean } | null {
  if (from === 'global' && (isWorkflowKind(to) || to === 'app')) return { kind: 'reads', turned: true };
  const kind = edgeKindFor(from, to);
  if (kind) return { kind, turned: false };
  const reverse = edgeKindFor(to, from);
  if (reverse && reverse !== 'calls') return { kind: reverse, turned: true };
  return null;
}

/** Plan nodes of these kinds can be linked to live nodes of these kinds. */
export function linkableKinds(kind: MapNodeKind): MapNodeKind[] {
  return isWorkflowKind(kind) ? ['workflow', 'helper'] : [kind];
}

export type MapNode = {
  key: string;
  kind: MapNodeKind;
  name: string;
  description?: string | null;
  /** In the plan only: nothing exists yet. */
  planned: boolean;
  external: boolean;
  missing: boolean;
  status: PlanStatus;
  /** Why it has that status, as a key for `projectMap.statusWhy.*`. */
  statusWhy: StatusWhy;
  /** The Ready sign-off, when there is one (even one a later change undid). */
  readyAt?: string;
  readyBy?: string;
  /** Was signed off as ready, but changed (or stopped passing) since. */
  readyStale: boolean;
  /** Can be signed off as ready now. */
  canBeReady: boolean;
  draft: boolean;
  /** A schedule: switched on or off. */
  enabled?: boolean;
  changedAt?: string | null;
  lastSuccessAt?: string | null;
  owner?: string;
  lane?: string;
  /** The note pinned to it. */
  note?: string;
  /** The plan node behind it (planned, or linked to this live node). */
  planId?: string;
  /** The live definition's ref (identifier or global name); absent while planned. */
  ref?: string;
  project: MapProjectRef | null;
  inputs: string[];
  outputs: string[];
  plannedInputs: string[];
  plannedOutputs: string[];
  dynamicGlobals: boolean;
  timing?: string;
  /** Linked to a live node that no longer exists. */
  linkMissing: boolean;
  /** How many differences touch it. */
  differences: number;
};

export type MapEdge = {
  key: string;
  from: string;
  to: string;
  kind: MapEdgeKind;
  /** `live`: read from definitions; `plan`: drawn by hand only; `both`: planned and real. */
  source: 'live' | 'plan' | 'both';
  planEdgeId?: string;
  /** `missing`: planned between built things, but not in the definitions; `unplanned`: real, not on the plan. */
  difference?: 'missing' | 'unplanned';
  /** A line standing for several (a box of workflows): how many. */
  count?: number;
};

export type MapDifference =
  | { kind: 'missing-link'; key: string; edgeKey: string; planEdgeId: string; from: string; to: string; edgeKind: MapEdgeKind }
  | { kind: 'not-on-plan'; key: string; edgeKey: string; from: string; to: string; edgeKind: MapEdgeKind }
  | { kind: 'inputs' | 'outputs'; key: string; nodeKey: string; planned: string[]; actual: string[] }
  | { kind: 'link-missing'; key: string; nodeKey: string; link: string };

export type StatusWhy =
  | 'planned'
  | 'missingGlobal'
  | 'draft'
  | 'neverRun'
  | 'changedSinceRun'
  | 'ranSinceChange'
  | 'appUntested'
  | 'appTested'
  | 'appEmpty'
  | 'exists'
  | 'scheduleOff'
  | 'scheduleUntested'
  | 'scheduleTested'
  | 'signedOff';

export type MapProgress = Record<PlanStatus, number> & { total: number };

export type MergedMap = {
  nodes: MapNode[];
  edges: MapEdge[];
  differences: MapDifference[];
  /** How many of the project's own nodes (borrowed ones don't count) are at each status. */
  progress: MapProgress;
};

export const edgeKey = (from: string, to: string, kind: MapEdgeKind) => `${kind}|${from}|${to}`;

const sameSet = (a: string[], b: string[]) => {
  const sa = new Set(a);
  return sa.size === new Set(b).size && b.every((x) => sa.has(x));
};

/**
 * The plan laid over the live map. A plan node linked to a live node becomes that node
 * (with the plan's notes); one that isn't linked is drawn as planned. Plan lines between
 * nodes that both exist are checked against the real lines.
 */
export function mergeMap(live: LiveMap, plan: ProjectMapPlan): MergedMap {
  const liveByKey = new Map(live.nodes.map((n) => [n.key, n]));
  const nodes = new Map<string, MapNode>();

  for (const n of live.nodes) {
    const meta = plan.meta[n.key] ?? {};
    nodes.set(n.key, {
      key: n.key,
      kind: n.kind,
      name: n.name,
      description: n.description ?? null,
      planned: false,
      external: !!n.external,
      missing: !!n.missing,
      status: 'built',
      statusWhy: 'exists',
      readyAt: meta.readyAt,
      readyBy: meta.readyBy,
      readyStale: false,
      canBeReady: false,
      draft: !!n.draft,
      enabled: n.enabled,
      changedAt: n.changedAt ?? null,
      lastSuccessAt: n.lastSuccessAt ?? null,
      owner: meta.owner,
      lane: meta.lane,
      note: meta.note,
      ref: n.ref,
      project: n.project,
      inputs: n.inputs ?? [],
      outputs: n.outputs ?? [],
      plannedInputs: [],
      plannedOutputs: [],
      dynamicGlobals: !!n.dynamicGlobals,
      timing: n.timing,
      linkMissing: false,
      differences: 0,
    });
  }

  // Plan node id → the key it's drawn under.
  const resolved = new Map<string, string>();
  const differences: MapDifference[] = [];
  const ignored = new Set(plan.ignored);
  const addDifference = (d: MapDifference) => {
    if (!ignored.has(d.key)) differences.push(d);
  };

  for (const p of plan.nodes) {
    const linked = p.link ? nodes.get(p.link) : undefined;
    if (linked && !linked.planId) {
      resolved.set(p.id, linked.key);
      linked.planId = p.id;
      linked.description = linked.description || p.description || null;
      linked.readyAt = p.readyAt ?? linked.readyAt;
      linked.readyBy = p.readyAt ? p.readyBy : linked.readyBy;
      linked.note = p.note ?? linked.note;
      linked.owner = p.owner ?? linked.owner;
      linked.lane = p.lane ?? linked.lane;
      linked.plannedInputs = p.inputs;
      linked.plannedOutputs = p.outputs;
      if (isWorkflowKind(linked.kind)) {
        for (const which of ['inputs', 'outputs'] as const) {
          const planned = which === 'inputs' ? p.inputs : p.outputs;
          const actual = linked[which];
          if (planned.length && !sameSet(planned, actual)) {
            addDifference({ kind: which, key: `${which}|${linked.key}`, nodeKey: linked.key, planned, actual });
          }
        }
      }
      continue;
    }
    const key = planKey(p.id);
    resolved.set(p.id, key);
    nodes.set(key, {
      key,
      kind: p.kind,
      name: p.name,
      description: p.description ?? null,
      planned: true,
      external: false,
      missing: false,
      status: 'idea',
      statusWhy: 'planned',
      readyStale: false,
      canBeReady: false,
      draft: false,
      owner: p.owner,
      lane: p.lane,
      note: p.note,
      planId: p.id,
      project: null,
      inputs: [],
      outputs: [],
      plannedInputs: p.inputs,
      plannedOutputs: p.outputs,
      dynamicGlobals: false,
      linkMissing: !!p.link,
      differences: 0,
    });
    if (p.link) addDifference({ kind: 'link-missing', key: `link|${p.id}`, nodeKey: key, link: p.link });
  }

  const resolveEnd = (end: string) => (end.startsWith('plan:') ? resolved.get(end.slice(5)) : end);

  const edges = new Map<string, MapEdge>();
  for (const e of live.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    const key = edgeKey(e.from, e.to, e.kind);
    edges.set(key, { key, from: e.from, to: e.to, kind: e.kind, source: 'live' });
  }
  const plannedKeys = new Set<string>();
  for (const e of plan.edges) {
    const from = resolveEnd(e.from);
    const to = resolveEnd(e.to);
    if (!from || !to || !nodes.has(from) || !nodes.has(to)) continue;
    const key = edgeKey(from, to, e.kind);
    plannedKeys.add(key);
    const existing = edges.get(key);
    if (existing) {
      existing.source = 'both';
      existing.planEdgeId = e.id;
      continue;
    }
    const edge: MapEdge = { key, from, to, kind: e.kind, source: 'plan', planEdgeId: e.id };
    edges.set(key, edge);
    // Both ends exist, so this line should be in the definitions by now.
    if (!nodes.get(from)!.planned && !nodes.get(to)!.planned && !liveByKey.get(from)?.missing && !liveByKey.get(to)?.missing) {
      edge.difference = 'missing';
      addDifference({ kind: 'missing-link', key: `missing|${key}`, edgeKey: key, planEdgeId: e.id, from, to, edgeKind: e.kind });
    }
  }

  // A real line touching a node that came from the plan, which the plan doesn't have.
  for (const edge of edges.values()) {
    if (edge.source !== 'live') continue;
    const touchesPlan = [edge.from, edge.to].some((k) => {
      const n = nodes.get(k)!;
      return !n.planned && !!n.planId;
    });
    if (!touchesPlan || plannedKeys.has(edge.key)) continue;
    const d: MapDifference = { kind: 'not-on-plan', key: `unplanned|${edge.key}`, edgeKey: edge.key, from: edge.from, to: edge.to, edgeKind: edge.kind };
    if (!ignored.has(d.key)) {
      edge.difference = 'unplanned';
      differences.push(d);
    }
  }

  for (const d of differences) {
    const keys =
      d.kind === 'missing-link' || d.kind === 'not-on-plan' ? [d.from, d.to] : [d.nodeKey];
    for (const k of new Set(keys)) {
      const n = nodes.get(k);
      if (n) n.differences++;
    }
  }

  deriveStatuses(nodes, live.edges);

  const own = [...nodes.values()].filter((n) => !n.external);
  const progress = { idea: 0, drafting: 0, built: 0, tested: 0, ready: 0, total: own.length } as MapProgress;
  for (const n of own) progress[n.status]++;
  return { nodes: [...nodes.values()], edges: [...edges.values()], differences, progress };
}

const after = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && (!b || Date.parse(a) >= Date.parse(b));

/**
 * Each node's status, from facts: planned or not, draft or not, its last change and
 * last successful run. Apps follow the workflows they run, schedules the workflow they
 * start. Then the Ready sign-off, which holds only while the node is still tested (or,
 * for a global, still there) and hasn't changed since it was given.
 */
function deriveStatuses(nodes: Map<string, MapNode>, liveEdges: LiveMapEdge[]) {
  const set = (n: MapNode, status: PlanStatus, why: StatusWhy) => {
    n.status = status;
    n.statusWhy = why;
  };
  // Workflows and globals first: apps and schedules depend on them.
  for (const n of nodes.values()) {
    if (n.planned) set(n, 'idea', 'planned');
    else if (n.missing) set(n, 'idea', 'missingGlobal');
    else if (isWorkflowKind(n.kind)) {
      if (n.draft) set(n, 'drafting', 'draft');
      else if (!n.lastSuccessAt) set(n, 'built', 'neverRun');
      else if (after(n.lastSuccessAt, n.changedAt)) set(n, 'tested', 'ranSinceChange');
      else set(n, 'built', 'changedSinceRun');
    } else if (n.kind === 'global') set(n, 'built', 'exists');
  }
  const runsInto = new Map<string, string[]>();
  const triggers = new Map<string, string>();
  for (const e of liveEdges) {
    if (e.kind === 'runs') runsInto.set(e.from, [...(runsInto.get(e.from) ?? []), e.to]);
    if (e.kind === 'triggers') triggers.set(e.from, e.to);
  }
  const tested = (key: string) => {
    const n = nodes.get(key);
    return !!n && (n.status === 'tested' || n.status === 'ready');
  };
  for (const n of nodes.values()) {
    if (n.planned) continue;
    if (n.kind === 'app') {
      const workflows = runsInto.get(n.key) ?? [];
      if (!workflows.length) set(n, 'built', 'appEmpty');
      else if (workflows.every((w) => nodes.get(w) ? tested(w) : false)) set(n, 'tested', 'appTested');
      else set(n, 'built', 'appUntested');
    } else if (n.kind === 'schedule') {
      const target = triggers.get(n.key);
      if (n.enabled === false) set(n, 'built', 'scheduleOff');
      else if (target && tested(target)) set(n, 'tested', 'scheduleTested');
      else set(n, 'built', 'scheduleUntested');
    }
  }
  // Ready: a tested node (a global: one that exists) whose sign-off is newer than its last change.
  for (const n of nodes.values()) {
    if (n.planned || n.missing) continue;
    n.canBeReady = n.status === 'tested' || n.kind === 'global';
    if (!n.readyAt) continue;
    const valid = n.canBeReady && (!isWorkflowKind(n.kind) || after(n.readyAt, n.changedAt));
    if (valid) set(n, 'ready', 'signedOff');
    else n.readyStale = true;
  }
}

// ---------------------------------------------------------------------------------------
// Grouping leaves
// ---------------------------------------------------------------------------------------

/**
 * Workflows that do nothing on the map but feed one node the same way (an app's own
 * workflows, say) drawn as one box beside that node, with one line for all of them.
 * Members are listed in `members`; the box is open (a grid of cards) or closed (one card).
 */
export type MapCluster = {
  key: string;
  /** The node they all connect to. */
  anchor: string;
  edgeKind: MapEdgeKind;
  /** True when the line goes from the members to the anchor (they run, write or read it). */
  toAnchor: boolean;
  members: string[];
  open: boolean;
};

export const CLUSTER_MIN = 4;
/** Bigger boxes start closed. */
export const CLUSTER_OPEN_MAX = 12;

export const clusterKey = (anchor: string, kind: MapEdgeKind, toAnchor: boolean) =>
  `cluster:${kind}:${toAnchor ? 'in' : 'out'}:${anchor}`;

/**
 * Finds the leaves to group. A leaf has exactly one line, isn't planned, has no
 * differences and isn't in `keep` (the selected node, say). Leaves on the same line kind
 * and side of the same node are grouped when there are at least `CLUSTER_MIN` of them.
 * `toggled` flips a box from its default (open when small, closed when big).
 */
export function clusterLeaves(
  nodes: MapNode[],
  edges: MapEdge[],
  options: { toggled?: Set<string>; keep?: Set<string>; min?: number; openMax?: number } = {}
): { nodes: MapNode[]; edges: MapEdge[]; clusters: MapCluster[]; memberOf: Map<string, string> } {
  const min = options.min ?? CLUSTER_MIN;
  const openMax = options.openMax ?? CLUSTER_OPEN_MAX;
  const keys = new Set(nodes.map((n) => n.key));
  const degree = new Map<string, MapEdge[]>();
  for (const e of edges) {
    if (!keys.has(e.from) || !keys.has(e.to)) continue;
    degree.set(e.from, [...(degree.get(e.from) ?? []), e]);
    degree.set(e.to, [...(degree.get(e.to) ?? []), e]);
  }
  const candidates = new Map<string, { anchor: string; kind: MapEdgeKind; toAnchor: boolean; members: string[] }>();
  for (const n of nodes) {
    const own = degree.get(n.key) ?? [];
    if (own.length !== 1 || n.planned || n.differences || options.keep?.has(n.key)) continue;
    if (n.kind !== 'workflow' && n.kind !== 'helper') continue;
    const e = own[0];
    if (e.source === 'plan' || e.difference) continue;
    const toAnchor = e.from === n.key;
    const anchor = toAnchor ? e.to : e.from;
    const key = clusterKey(anchor, e.kind, toAnchor);
    const c = candidates.get(key) ?? { anchor, kind: e.kind, toAnchor, members: [] };
    c.members.push(n.key);
    candidates.set(key, c);
  }
  const clusters: MapCluster[] = [];
  const memberOf = new Map<string, string>();
  for (const [key, c] of candidates) {
    if (c.members.length < min) continue;
    const defaultOpen = c.members.length <= openMax;
    const open = options.toggled?.has(key) ? !defaultOpen : defaultOpen;
    clusters.push({ key, anchor: c.anchor, edgeKind: c.kind, toAnchor: c.toAnchor, members: c.members, open });
    for (const m of c.members) memberOf.set(m, key);
  }
  const outEdges: MapEdge[] = edges.filter((e) => !memberOf.has(e.from) && !memberOf.has(e.to));
  for (const c of clusters) {
    const [from, to] = c.toAnchor ? [c.key, c.anchor] : [c.anchor, c.key];
    outEdges.push({ key: edgeKey(from, to, c.edgeKind), from, to, kind: c.edgeKind, source: 'live', count: c.members.length });
  }
  return { nodes: nodes.filter((n) => !memberOf.has(n.key)), edges: outEdges, clusters, memberOf };
}

const CLUSTER_PAD = 16;
const CLUSTER_HEADER = 40;
const CLUSTER_GAP_X = 16;
const CLUSTER_GAP_Y = 12;

/** How many columns an open box's grid has: wider than tall, at most 6. */
export const clusterColumns = (count: number) => Math.min(6, Math.max(1, Math.ceil(Math.sqrt(count * 2))));

/** An open box's size, and where each member sits inside it. */
export function clusterGrid(count: number): { w: number; h: number; cells: Point[] } {
  const cols = clusterColumns(count);
  const rows = Math.ceil(count / cols);
  const cells: Point[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({
      x: CLUSTER_PAD + (i % cols) * (MAP_NODE_W + CLUSTER_GAP_X),
      y: CLUSTER_HEADER + Math.floor(i / cols) * (MAP_NODE_H + CLUSTER_GAP_Y),
    });
  }
  return {
    w: CLUSTER_PAD * 2 + cols * MAP_NODE_W + (cols - 1) * CLUSTER_GAP_X,
    h: CLUSTER_HEADER + CLUSTER_PAD + rows * MAP_NODE_H + (rows - 1) * CLUSTER_GAP_Y,
    cells,
  };
}

/** A box's size on the map: one card when closed. */
export function clusterSize(cluster: MapCluster): Size {
  if (!cluster.open) return { w: MAP_NODE_W, h: MAP_NODE_H };
  const { w, h } = clusterGrid(cluster.members.length);
  return { w, h };
}

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------

export const MAP_NODE_W = 208;
export const MAP_NODE_H = 72;
const COL_GAP = 120;
const ROW_GAP = 32;
const PAD = 40;
const LANE_LABEL_W = 152;
const LANE_PAD = 24;
const GROUP_PAD = 24;
const GROUP_HEADER = 44;
const GROUP_GAP = 64;

export type Point = { x: number; y: number };
export type Size = { w: number; h: number };
export type LaneBox = { name: string; y: number; h: number };
export type GroupBox = { id: string; name: string; color: string | null; x: number; y: number; w: number; h: number };

export type MapLayout = {
  positions: Record<string, Point>;
  /** Sizes other than a card's (open boxes). */
  sizes: Record<string, Size>;
  width: number;
  height: number;
  lanes: LaneBox[];
  groups: GroupBox[];
};

export type LayoutNode = { key: string; lane?: string; group?: string | null; w?: number; h?: number };
type LayoutEdge = { from: string; to: string };

const sizeOf = (n: LayoutNode): Size => ({ w: n.w ?? MAP_NODE_W, h: n.h ?? MAP_NODE_H });

function sizesOf(nodes: LayoutNode[]): Record<string, Size> {
  return Object.fromEntries(nodes.filter((n) => n.w || n.h).map((n) => [n.key, sizeOf(n)]));
}

/** Each node's column: the longest chain of lines leading to it. Cycles are cut where found. */
function ranks(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, number> {
  const keys = new Set(nodes.map((n) => n.key));
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!keys.has(e.from) || !keys.has(e.to) || e.from === e.to) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  // Drop back edges with a depth-first walk, then rank the rest in topological order.
  const state = new Map<string, 1 | 2>();
  const order: string[] = [];
  const forward = new Map<string, string[]>();
  const visit = (k: string) => {
    state.set(k, 1);
    for (const next of out.get(k) ?? []) {
      const s = state.get(next);
      if (s === 1) continue;
      forward.set(k, [...(forward.get(k) ?? []), next]);
      if (!s) visit(next);
    }
    state.set(k, 2);
    order.push(k);
  };
  for (const n of nodes) if (!state.has(n.key)) visit(n.key);
  order.reverse();
  const rank = new Map<string, number>(nodes.map((n) => [n.key, 0]));
  for (const k of order) {
    for (const next of forward.get(k) ?? []) {
      rank.set(next, Math.max(rank.get(next)!, rank.get(k)! + 1));
    }
  }
  // Pull sources right next to what they feed, so a helper sits beside its caller.
  for (const k of [...order].reverse()) {
    const nexts = forward.get(k) ?? [];
    if (!nexts.length) continue;
    const hasIncoming = edges.some((e) => e.to === k && rank.has(e.from));
    if (!hasIncoming) rank.set(k, Math.min(...nexts.map((n) => rank.get(n)!)) - 1);
  }
  const min = Math.min(0, ...rank.values());
  for (const [k, r] of rank) rank.set(k, r - min);
  return rank;
}

/** Order nodes within each column by the average row of their neighbours (a few sweeps). */
function orderColumns(columns: string[][], edges: LayoutEdge[]): string[][] {
  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    neighbours.set(e.from, [...(neighbours.get(e.from) ?? []), e.to]);
    neighbours.set(e.to, [...(neighbours.get(e.to) ?? []), e.from]);
  }
  let cols = columns.map((c) => [...c]);
  for (let sweep = 0; sweep < 4; sweep++) {
    const row = new Map<string, number>();
    cols.forEach((c) => c.forEach((k, i) => row.set(k, i / Math.max(1, c.length - 1))));
    cols = cols.map((c) =>
      [...c].sort((a, b) => {
        const avg = (k: string) => {
          const rows = (neighbours.get(k) ?? []).map((n) => row.get(n)).filter((r): r is number => r !== undefined);
          return rows.length ? rows.reduce((s, r) => s + r, 0) / rows.length : row.get(k)!;
        };
        return avg(a) - avg(b);
      })
    );
  }
  return cols;
}

function columnsOf(nodes: LayoutNode[], edges: LayoutEdge[], rank = ranks(nodes, edges)): string[][] {
  const columns: string[][] = [];
  for (const n of nodes) (columns[rank.get(n.key) ?? 0] ??= []).push(n.key);
  // Array.from, not map: map skips the holes an empty column leaves.
  return orderColumns(Array.from(columns, (c) => c ?? []), edges);
}

/** Each column's width: its widest node. */
function columnXs(cols: string[][], size: Map<string, Size>, x0: number): number[] {
  const xs: number[] = [];
  let x = x0;
  for (const col of cols) {
    xs.push(x);
    x += Math.max(MAP_NODE_W, ...col.map((k) => size.get(k)!.w)) + COL_GAP;
  }
  return xs;
}

const columnHeight = (col: string[], size: Map<string, Size>) =>
  col.reduce((h, k) => h + size.get(k)!.h, 0) + Math.max(0, col.length - 1) * ROW_GAP;

/**
 * Stacks each column from `y0`, centred on the tallest one, so a node sits level with
 * the middle of what feeds it rather than at the top of a long column.
 */
function stack(cols: string[][], size: Map<string, Size>, xs: number[], y0: number, height: number, positions: Record<string, Point>) {
  cols.forEach((col, c) => {
    let y = y0 + Math.round((height - columnHeight(col, size)) / 2);
    for (const k of col) {
      const s = size.get(k)!;
      // Narrow nodes in a wide column are centred in it.
      const colW = Math.max(MAP_NODE_W, ...col.map((x) => size.get(x)!.w));
      positions[k] = { x: xs[c] + Math.round((colW - s.w) / 2), y };
      y += s.h + ROW_GAP;
    }
  });
}

/** Columns left to right, in the direction things flow. */
export function layoutFlow(nodes: LayoutNode[], edges: LayoutEdge[]): MapLayout {
  const size = new Map(nodes.map((n) => [n.key, sizeOf(n)]));
  const cols = columnsOf(nodes, edges);
  const positions: Record<string, Point> = {};
  const height = Math.max(0, ...cols.map((c) => columnHeight(c, size)));
  stack(cols, size, columnXs(cols, size, PAD), PAD, height, positions);
  const sizes = sizesOf(nodes);
  return { positions, sizes, ...bounds(positions, sizes), lanes: [], groups: [] };
}

export const UNASSIGNED_LANE = '';

export const LANE_BY = ['owner', 'status', 'kind', 'custom'] as const;
export type LaneBy = (typeof LANE_BY)[number];

const LANE_KINDS: MapNodeKind[] = ['workflow', 'helper', 'app', 'global', 'schedule'];

/** What the Lanes layout groups by: the plan's choice, else custom lanes if any, else owner. */
export function laneByOf(plan: Pick<ProjectMapPlan, 'lanes' | 'laneBy'>): LaneBy {
  return plan.laneBy ?? (plan.lanes.length ? 'custom' : 'owner');
}

/** The lane a node goes in when grouping by `by` (`undefined`: the unnamed last lane). */
export function laneOfNode(
  node: Pick<MapNode, 'owner' | 'lane' | 'status' | 'kind'>,
  by: LaneBy
): string | undefined {
  if (by === 'owner') return node.owner?.trim() || undefined;
  if (by === 'status') return node.status;
  if (by === 'kind') return node.kind;
  return node.lane || undefined;
}

/**
 * The lanes top to bottom when grouping by `by`. Custom lanes all show (even empty ones,
 * so there's somewhere to drop); the others only show the lanes something is in.
 */
export function laneOrder(
  nodes: Pick<MapNode, 'owner' | 'lane' | 'status' | 'kind'>[],
  by: LaneBy,
  custom: string[]
): string[] {
  if (by === 'custom') return [...custom];
  const used = new Set(nodes.map((n) => laneOfNode(n, by)).filter((l): l is string => !!l));
  if (by === 'status') return PLAN_STATUSES.filter((s) => used.has(s));
  if (by === 'kind') return LANE_KINDS.filter((k) => used.has(k));
  return [...used].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * The same columns, split into horizontal lanes (by audience, say). `lanes` gives the
 * order; nodes with no lane go in a last, unnamed one.
 */
export function layoutLanes(nodes: LayoutNode[], edges: LayoutEdge[], lanes: string[]): MapLayout {
  const size = new Map(nodes.map((n) => [n.key, sizeOf(n)]));
  const rank = ranks(nodes, edges);
  const names = [...lanes];
  for (const n of nodes) if (n.lane && !names.includes(n.lane)) names.push(n.lane);
  if (nodes.some((n) => !n.lane || !names.includes(n.lane))) names.push(UNASSIGNED_LANE);
  const laneOf = (n: LayoutNode) => (n.lane && names.includes(n.lane) ? n.lane : UNASSIGNED_LANE);

  // Columns line up across lanes: each as wide as its widest node in any lane.
  const xs = columnXs(columnsOf(nodes, edges, rank), size, PAD + LANE_LABEL_W);

  const positions: Record<string, Point> = {};
  const boxes: LaneBox[] = [];
  let y = PAD;
  for (const name of names) {
    const members = nodes.filter((n) => laneOf(n) === name);
    if (!members.length && name === UNASSIGNED_LANE) continue;
    const columns: string[][] = [];
    for (const n of members) (columns[rank.get(n.key) ?? 0] ??= []).push(n.key);
    const ordered = orderColumns(Array.from(columns, (c) => c ?? []), edges);
    const inner = Math.max(MAP_NODE_H, ...ordered.map((c) => columnHeight(c, size)));
    stack(ordered, size, xs, y + LANE_PAD, inner, positions);
    const h = LANE_PAD * 2 + inner;
    boxes.push({ name, y, h });
    y += h + 16;
  }
  const sizes = sizesOf(nodes);
  const b = bounds(positions, sizes);
  return {
    positions,
    sizes,
    width: Math.max(b.width, PAD * 2 + LANE_LABEL_W + MAP_NODE_W),
    height: Math.max(b.height, y + PAD - 16),
    lanes: boxes,
    groups: [],
  };
}

/**
 * One box per project, laid out in a grid, with everything used by more than one
 * project (or by none) in a last box below them: the "every idea" map.
 */
export function layoutGroups(
  nodes: (LayoutNode & { group: string | null })[],
  edges: LayoutEdge[],
  groups: { id: string; name: string; color: string | null }[],
  sharedName: string,
  perRow = 2
): MapLayout {
  const positions: Record<string, Point> = {};
  const boxes: GroupBox[] = [];
  const all = [...groups];
  if (nodes.some((n) => !n.group || !groups.some((g) => g.id === n.group))) {
    all.push({ id: '', name: sharedName, color: null });
  }
  const sized = all
    .map((g) => {
      const members = nodes.filter((n) => (n.group && groups.some((x) => x.id === n.group) ? n.group : '') === g.id);
      const keys = new Set(members.map((m) => m.key));
      const inner = layoutFlow(
        members,
        edges.filter((e) => keys.has(e.from) && keys.has(e.to))
      );
      return { g, members, inner };
    })
    .filter((s) => s.members.length);

  let y = PAD;
  let rowH = 0;
  let x = PAD;
  let inRow = 0;
  for (const { g, inner } of sized) {
    const w = Math.max(inner.width - PAD * 2 + GROUP_PAD * 2, MAP_NODE_W + GROUP_PAD * 2, 320);
    const h = inner.height - PAD * 2 + GROUP_PAD * 2 + GROUP_HEADER;
    const shared = g.id === '';
    if (inRow >= perRow || (shared && inRow > 0)) {
      y += rowH + GROUP_GAP;
      x = PAD;
      rowH = 0;
      inRow = 0;
    }
    for (const [k, p] of Object.entries(inner.positions)) {
      positions[k] = { x: x + GROUP_PAD + (p.x - PAD), y: y + GROUP_HEADER + GROUP_PAD + (p.y - PAD) };
    }
    boxes.push({ id: g.id, name: g.name, color: g.color, x, y, w, h });
    x += w + GROUP_GAP;
    rowH = Math.max(rowH, h);
    inRow++;
  }
  const width = Math.max(PAD * 2, ...boxes.map((b) => b.x + b.w + PAD));
  const height = Math.max(PAD * 2, ...boxes.map((b) => b.y + b.h + PAD));
  return { positions, sizes: sizesOf(nodes), width, height, lanes: [], groups: boxes };
}

function bounds(positions: Record<string, Point>, sizes: Record<string, Size> = {}) {
  const ends = Object.entries(positions).map(([k, p]) => ({
    x: p.x + (sizes[k]?.w ?? MAP_NODE_W),
    y: p.y + (sizes[k]?.h ?? MAP_NODE_H),
  }));
  return {
    width: Math.max(PAD * 2 + MAP_NODE_W, ...ends.map((e) => e.x + PAD)),
    height: Math.max(PAD * 2 + MAP_NODE_H, ...ends.map((e) => e.y + PAD)),
  };
}

/**
 * Where everything goes after a card is dropped at `point`. A drop to the right or below
 * just moves that card. A drop above or to the left of the map's corner moves everything
 * else the other way instead, so the dropped card stays where it was let go and the map
 * keeps a margin: `positions` then holds every node (all now placed by hand) and `shift`
 * says how far they moved, for notes and the view to follow.
 */
export function placeNode(
  current: Record<string, Point>,
  key: string,
  point: Point
): { positions: Record<string, Point>; shift: Point | null } {
  if (point.x >= 0 && point.y >= 0) return { positions: { [key]: point }, shift: null };
  const all = { ...current, [key]: point };
  const points = Object.values(all);
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const shift = { x: minX < 0 ? PAD - minX : 0, y: minY < 0 ? PAD - minY : 0 };
  const positions = Object.fromEntries(
    Object.entries(all).map(([k, p]) => [k, { x: p.x + shift.x, y: p.y + shift.y }])
  );
  return { positions, shift };
}

/** Saved positions win over the automatic ones; the canvas grows to fit them. */
export function applyPositions(layout: MapLayout, saved: Record<string, Point>): MapLayout {
  const positions = { ...layout.positions };
  for (const [k, p] of Object.entries(saved)) if (positions[k]) positions[k] = { x: Math.max(0, p.x), y: Math.max(0, p.y) };
  const b = bounds(positions, layout.sizes);
  return { ...layout, positions, width: Math.max(layout.width, b.width), height: Math.max(layout.height, b.height) };
}

/**
 * The brief the assistant drafts a planned workflow from: what it should do, and what the
 * map says about its inputs, outputs, globals and neighbours.
 */
export function draftBrief(map: MergedMap, nodeKey: string): { text: string; reuse: { identifier: string; name: string }[] } {
  const node = map.nodes.find((n) => n.key === nodeKey);
  if (!node) return { text: '', reuse: [] };
  const byKey = new Map(map.nodes.map((n) => [n.key, n]));
  const lines: string[] = [];
  lines.push(`Build a workflow named "${node.name}".`);
  if (node.description) lines.push(node.description.trim());
  if (node.plannedInputs.length) lines.push(`Inputs: ${node.plannedInputs.join(', ')}.`);
  if (node.plannedOutputs.length) lines.push(`Outputs: ${node.plannedOutputs.join(', ')}.`);
  const reuse: { identifier: string; name: string }[] = [];
  const reads: string[] = [];
  const writes: string[] = [];
  const runBy: string[] = [];
  const calledBy: string[] = [];
  for (const e of map.edges) {
    if (e.from === nodeKey) {
      const to = byKey.get(e.to);
      if (!to) continue;
      if (e.kind === 'reads') reads.push(`_global.${to.ref ?? to.name}`);
      if (e.kind === 'writes') writes.push(`_global.${to.ref ?? to.name}`);
      if (e.kind === 'calls' && !to.planned && to.ref) reuse.push({ identifier: to.ref, name: to.name });
    }
    if (e.to === nodeKey) {
      const from = byKey.get(e.from);
      if (!from) continue;
      if (e.kind === 'runs') runBy.push(from.name);
      if (e.kind === 'calls') calledBy.push(from.name);
    }
  }
  if (reuse.length) lines.push(`Run these existing workflows as steps: ${reuse.map((r) => r.name).join(', ')}.`);
  if (reads.length) lines.push(`Read these global variables: ${reads.join(', ')}.`);
  if (writes.length) lines.push(`Save results to these global variables: ${writes.join(', ')}.`);
  if (runBy.length) lines.push(`It will be run from the app${runBy.length > 1 ? 's' : ''} ${runBy.join(', ')}.`);
  if (calledBy.length) lines.push(`Its outputs are used by: ${calledBy.join(', ')}.`);
  return { text: lines.join('\n'), reuse };
}
