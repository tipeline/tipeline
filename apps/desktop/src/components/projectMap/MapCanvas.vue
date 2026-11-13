<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  MarkerType,
  VueFlow,
  useVueFlow,
  type Connection,
  type Edge,
  type HandleType,
  type Node,
  type NodeDragEvent,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import {
  clusterGrid,
  generateIdentifier,
  MAP_NODE_H,
  MAP_NODE_W,
  type MapCluster,
  type MapEdge,
  type MapLayout,
  type MapNode,
  type Point,
  type StickyNote,
} from '@tipeline/utils';
import MapNodeCard from './MapNodeCard.vue';
import { ENTITY_COLORS } from '@/config/entityColors';
import MapClusterBox from './MapClusterBox.vue';
import MapStickyNote from './MapStickyNote.vue';
import { MAP_DRAG_TYPE, type MapDropKind } from './mapDrag';

/**
 * The map, drawn with Vue Flow: pan by dragging the background, zoom with the wheel or
 * the controls. Where nodes go comes from our own layout (`layout`); dragging one tells
 * the parent, which saves it. When editable, lines are drawn from a node's right handle.
 * Workflows that only feed one node come in boxes (`clusters`); an open box shows its
 * members as cards inside it.
 */
const props = defineProps<{
  /** The cards laid out on their own (not in a box). */
  nodes: MapNode[];
  edges: MapEdge[];
  layout: MapLayout;
  clusters?: MapCluster[];
  /** Every node by key, members of boxes included. */
  byKey: Map<string, MapNode>;
  selected: string | null;
  /** The project's own map: lines can be drawn and differences show (not the all-projects map). */
  editable: boolean;
  /** Nodes can be dragged to a new place. */
  draggable: boolean;
  /** Changing it fits the whole map in view again (a new layout, say). */
  fitKey?: string;
  /** Lane names as shown, by lane name (the unnamed lane is ''). */
  laneLabels?: Record<string, string>;
  notes?: StickyNote[];
  /** Bumped to put dragged cards back where the layout says (Lanes: a drop in the same lane). */
  nudge?: number;
}>();

const emit = defineEmits<{
  (e: 'select', key: string | null): void;
  (e: 'move', key: string, point: Point): void;
  (e: 'connect', from: string, to: string): void;
  (e: 'toggle-cluster', key: string): void;
  /** A tile from the left sidebar dropped on the map, at map coordinates. */
  (e: 'drop', kind: MapDropKind, point: Point): void;
  (e: 'note-move', id: string, point: Point): void;
  (e: 'note-update', id: string, patch: Partial<Pick<StickyNote, 'text' | 'color' | 'w' | 'h'>>): void;
  (e: 'note-remove', id: string): void;
}>();

const { t } = useI18n();
const flowId = `project-map-${generateIdentifier()}`;
const { fitView, setCenter, setViewport, findNode, getViewport, screenToFlowCoordinate } = useVueFlow(flowId);
const container = ref<HTMLElement | null>(null);

/** Brings a node into view (picked from a list, say). */
function focus(key: string) {
  const node = findNode(key);
  if (!node) return;
  const w = (node.dimensions?.width || MAP_NODE_W) / 2;
  const h = (node.dimensions?.height || MAP_NODE_H) / 2;
  const at = node.computedPosition ?? node.position;
  setCenter(at.x + w, at.y + h, { zoom: Math.max(getViewport().zoom, 0.9), duration: 300 });
}

/** The map coordinates at the middle of what's on screen: where a new note goes. */
function center(): Point {
  const rect = container.value?.getBoundingClientRect();
  if (!rect) return { x: 40, y: 40 };
  const p = screenToFlowCoordinate({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  return { x: Math.round(p.x - 110), y: Math.round(p.y - 40) };
}

/** Everything moved by `shift` in map coordinates: move the view with it, so nothing jumps. */
function panBy(shift: Point) {
  const { x, y, zoom } = getViewport();
  setViewport({ x: x - shift.x * zoom, y: y - shift.y * zoom, zoom });
}

defineExpose({ focus, center, panBy });

function onDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes(MAP_DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

function onDrop(event: DragEvent) {
  const kind = event.dataTransfer?.getData(MAP_DRAG_TYPE) as MapDropKind | undefined;
  if (!kind) return;
  event.preventDefault();
  const p = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  // The tile is held near its middle: centre the new card on the pointer.
  emit('drop', kind, { x: Math.round(p.x - MAP_NODE_W / 2), y: Math.round(p.y - MAP_NODE_H / 2) });
}

const clusterOf = computed(() => {
  const out = new Map<string, MapCluster>();
  for (const c of props.clusters ?? []) for (const m of c.members) out.set(m, c);
  return out;
});

/** What the selected node touches (through its box, if it's in one), so the rest can fade. */
const related = computed(() => {
  const key = props.selected;
  if (!key || !props.byKey.has(key)) return null;
  const box = clusterOf.value.get(key);
  const end = box?.key ?? key;
  const set = new Set([key, end]);
  for (const e of props.edges) {
    if (e.from === end) set.add(e.to);
    if (e.to === end) set.add(e.from);
  }
  return set;
});

// A line takes the color of what it's about: a sub-workflow run, a global, a schedule.
const EDGE_COLOR: Record<string, string> = {
  calls: ENTITY_COLORS.subworkflow.hex,
  runs: '#71717a',
  writes: ENTITY_COLORS.global.hex,
  reads: ENTITY_COLORS.global.hex,
  triggers: ENTITY_COLORS.schedule.hex,
  missing: '#d97706',
  unplanned: '#ea580c',
};

const kindColor: Record<string, string> = {
  workflow: ENTITY_COLORS.workflow.hex,
  subworkflow: ENTITY_COLORS.subworkflow.hex,
  helper: ENTITY_COLORS.subworkflow.hex,
  app: ENTITY_COLORS.app.hex,
  global: ENTITY_COLORS.global.hex,
  schedule: ENTITY_COLORS.schedule.hex,
};

/** Workflows another workflow on the map runs (a `calls` line points at the one run). */
const subworkflows = computed(() => {
  const set = new Set<string>();
  for (const e of props.edges) if (e.kind === 'calls') set.add(e.to);
  return set;
});

const flowNodes = computed<Node[]>(() => {
  void props.nudge;
  // Lanes and project boxes first, behind the cards; they can't be picked or moved.
  const bands: Node[] = [
    ...props.layout.lanes.map((lane) => ({
      id: `band:lane:${lane.name}`,
      type: 'band',
      position: { x: 16, y: lane.y },
      data: { label: props.laneLabels?.[lane.name] ?? (lane.name || t('projectMap.lanes.unassigned')), color: null, dashed: false },
      style: { width: `${props.layout.width - 32}px`, height: `${lane.h}px` },
    })),
    ...props.layout.groups.map((group) => ({
      id: `band:group:${group.id}`,
      type: 'band',
      position: { x: group.x, y: group.y },
      data: { label: group.name, color: group.color, dashed: !group.id },
      style: { width: `${group.w}px`, height: `${group.h}px` },
    })),
  ].map((band) => ({ ...band, draggable: false, selectable: false, connectable: false, focusable: false, zIndex: -1 }));

  const cards: Node[] = props.nodes.map((node) => ({
    id: node.key,
    type: 'map',
    position: props.layout.positions[node.key] ?? { x: 0, y: 0 },
    data: { node },
    draggable: props.draggable,
    connectable: props.editable,
    selectable: false,
  }));

  // A box, then its members (Vue Flow wants parents before children).
  const boxes: Node[] = [];
  for (const c of props.clusters ?? []) {
    const size = props.layout.sizes[c.key] ?? { w: MAP_NODE_W, h: MAP_NODE_H };
    boxes.push({
      id: c.key,
      type: 'cluster',
      position: props.layout.positions[c.key] ?? { x: 0, y: 0 },
      data: { cluster: c, w: size.w, h: size.h },
      style: { width: `${size.w}px`, height: `${size.h}px` },
      draggable: props.draggable,
      connectable: false,
      selectable: false,
    });
    if (!c.open) continue;
    const { cells } = clusterGrid(c.members.length);
    c.members.forEach((key, i) => {
      const node = props.byKey.get(key);
      if (!node) return;
      boxes.push({
        id: key,
        type: 'map',
        parentNode: c.key,
        extent: 'parent',
        position: cells[i],
        data: { node },
        draggable: false,
        connectable: props.editable,
        selectable: false,
      });
    });
  }
  const notes: Node[] = (props.notes ?? []).map((note) => ({
    id: `note:${note.id}`,
    type: 'note',
    position: { x: note.x, y: note.y },
    data: { note },
    draggable: true,
    connectable: false,
    selectable: false,
    zIndex: 1,
  }));
  return [...bands, ...cards, ...boxes, ...notes];
});

function edgeLabel(edge: MapEdge) {
  if (props.editable && edge.difference === 'missing') {
    return edge.actualKind
      ? t('projectMap.edge.wrongKind', { planned: t(`projectMap.edge.${edge.kind}`), actual: t(`projectMap.edge.${edge.actualKind}`) })
      : t('projectMap.edge.missing');
  }
  if (props.editable && edge.difference === 'unplanned') return t('projectMap.edge.unplanned');
  const label = usesLabel(edge) ?? t(`projectMap.edge.${edge.kind}`);
  if (edge.count) return t('projectMap.edge.many', { label, count: edge.count });
  return edge.source === 'plan' ? t('projectMap.edge.planned', { label }) : label;
}

/**
 * An app's line names what in the app uses the workflow: the component when it's one
 * (and how many ways it runs it), else how many components. The full list is in the
 * app's details, which a click on the line opens.
 */
function usesLabel(edge: MapEdge): string | null {
  const components = (edge.uses ?? []).filter((u) => u.component);
  if (!components.length) return null;
  if (components.length > 1) return t('projectMap.edge.components', { count: components.length });
  const [only] = components;
  const ways = only.ways.length;
  return ways > 1 ? t('projectMap.edge.componentWays', { name: only.component, count: ways }) : (only.component ?? null);
}

function onEdgeClick({ edge }: { edge: Edge }) {
  const mapEdge = props.edges.find((e) => e.key === edge.id);
  if (mapEdge?.uses?.length) emit('select', mapEdge.from);
}

const flowEdges = computed<Edge[]>(() =>
  props.edges.map((edge) => {
    const color = EDGE_COLOR[edge.difference && props.editable ? edge.difference : edge.kind];
    const dashed = edge.source === 'plan' || (props.editable && edge.difference === 'missing');
    const faded = !!related.value && !(related.value.has(edge.from) && related.value.has(edge.to));
    return {
      id: edge.key,
      source: edge.from,
      target: edge.to,
      type: 'default',
      label: edgeLabel(edge),
      class: edge.uses?.length ? 'map-edge--uses' : undefined,
      selectable: false,
      focusable: false,
      // A read points at the global like a write; the open arrowhead tells them apart.
      markerEnd: { type: edge.kind === 'reads' ? MarkerType.Arrow : MarkerType.ArrowClosed, color, width: 18, height: 18 },
      style: {
        stroke: color,
        strokeWidth: edge.count ? 3 : 2,
        strokeDasharray: dashed ? '6 6' : undefined,
        opacity: faded ? 0.2 : 1,
      },
      labelStyle: { fill: color, fontSize: '11px', opacity: faded ? 0.3 : 1 },
      labelBgStyle: { fill: 'var(--card)' },
      labelBgPadding: [4, 2] as [number, number],
    };
  })
);

const nodeColor = (node: Node) => {
  if (node.type === 'map') {
    const n = node.data?.node;
    return kindColor[n?.kind === 'workflow' && subworkflows.value.has(n.key) ? 'subworkflow' : n?.kind] ?? '#a1a1aa';
  }
  if (node.type === 'cluster') return '#93c5fd';
  if (node.type === 'note') return '#fde047';
  return 'transparent';
};

function onNodeClick({ node }: { node: Node }) {
  if (node.type === 'map') emit('select', node.id);
}

function onDragStop(event: NodeDragEvent) {
  const node = event.node;
  if (node.type === 'note') {
    emit('note-move', node.data.note.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) });
    return;
  }
  if (node.type !== 'map' && node.type !== 'cluster') return;
  if (node.parentNode) return;
  emit('move', node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) });
}

/** The line being drawn: which node it started from, and from which side. */
const drawing = ref<{ nodeId: string; handleType: HandleType } | null>(null);
let connected = false;

function onConnectStart({ nodeId, handleType }: { nodeId?: string; handleType?: HandleType }) {
  connected = false;
  drawing.value = nodeId && handleType ? { nodeId, handleType } : null;
}

function onConnect(connection: Connection) {
  if (connection.source && connection.target && connection.source !== connection.target) {
    connected = true;
    emit('connect', connection.source, connection.target);
  }
}

/**
 * Vue Flow only connects when the line ends near a dot. Dropped anywhere else on a card,
 * it connects to that card too: from the start node if the line left a right-hand dot,
 * into it if it left a left-hand one.
 */
function onConnectEnd(event?: MouseEvent | TouchEvent) {
  const start = drawing.value;
  drawing.value = null;
  if (connected || !start || !event) return;
  const point = 'changedTouches' in event ? event.changedTouches[0] : event;
  if (!point) return;
  const el = document.elementFromPoint(point.clientX, point.clientY)?.closest('.vue-flow__node-map');
  const id = el?.getAttribute('data-id');
  if (!id || id === start.nodeId) return;
  if (start.handleType === 'source') emit('connect', start.nodeId, id);
  else emit('connect', id, start.nodeId);
}

// Fit once the first nodes arrive, and again when asked (another layout).
let fitted = false;
watch(
  () => [props.nodes.length + (props.clusters?.length ?? 0) > 0, props.fitKey] as const,
  async ([hasNodes], previous) => {
    if (!hasNodes) return;
    if (fitted && previous && previous[1] === props.fitKey) return;
    fitted = true;
    await nextTick();
    setTimeout(() => fitView({ padding: 0.15, maxZoom: 1 }), 0);
  },
  { immediate: true }
);
</script>

<template>
  <div
    ref="container"
    class="project-map h-full w-full overflow-hidden bg-card"
    :class="drawing ? 'project-map--connecting' : ''"
    @dragover="onDragOver" @drop="onDrop">
    <VueFlow
      :id="flowId"
      :nodes="flowNodes"
      :edges="flowEdges"
      :min-zoom="0.2"
      :max-zoom="1.75"
      :nodes-connectable="editable"
      :connection-radius="40"
      :elements-selectable="false"
      :zoom-on-double-click="false"
      :delete-key-code="null"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @pane-click="emit('select', null)"
      @node-drag-stop="onDragStop"
      @connect-start="onConnectStart"
      @connect="onConnect"
      @connect-end="onConnectEnd"
    >
      <template #node-map="{ data }">
        <MapNodeCard
          :node="data.node"
          :subworkflow="subworkflows.has(data.node.key)"
          :editable="editable"
          :selected="selected === data.node.key"
          :dimmed="!!related && !related.has(data.node.key)"
          :class="draggable && !clusterOf.has(data.node.key) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'"
        />
      </template>
      <template #node-cluster="{ data }">
        <MapClusterBox
          :cluster="data.cluster"
          :anchor-name="byKey.get(data.cluster.anchor)?.name ?? ''"
          :width="data.w"
          :height="data.h"
          :dimmed="!!related && !related.has(data.cluster.key)"
          @toggle="emit('toggle-cluster', data.cluster.key)"
        />
      </template>
      <template #node-note="{ data }">
        <MapStickyNote
          :note="data.note"
          @update="emit('note-update', data.note.id, $event)"
          @remove="emit('note-remove', data.note.id)"
        />
      </template>
      <template #node-band="{ data }">
        <div
          class="pointer-events-none h-full w-full rounded-2xl border bg-muted/40"
          :class="data.dashed ? 'border-dashed' : ''"
        >
          <div class="flex items-center gap-2 px-5 pt-3 text-sm font-semibold text-foreground">
            <span v-if="data.color" class="size-2.5 rounded-full" :style="{ backgroundColor: data.color }" />
            {{ data.label }}
          </div>
        </div>
      </template>
      <Background :gap="16" :size="1.2" pattern-color="var(--border)" />
      <Controls :show-interactive="false" position="bottom-left" />
      <MiniMap pannable zoomable :node-color="nodeColor" mask-color="color-mix(in oklch, var(--muted) 70%, transparent)" />
    </VueFlow>
  </div>
</template>

<style>
/* Vue Flow in Tipeline's colours, light and dark. */
.project-map .vue-flow__node-map,
.project-map .vue-flow__node-band,
.project-map .vue-flow__node-cluster,
.project-map .vue-flow__node-note {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.project-map .vue-flow__node-band {
  pointer-events: none;
}
.project-map .map-handle {
  width: 12px;
  height: 12px;
  border: 2px solid var(--primary);
  background: var(--background);
}
.project-map .map-handle:hover {
  background: var(--primary);
}
/* Dots show on the card under the pointer, and on every card while a line is drawn. */
.project-map .map-handle {
  opacity: 0;
  transition: opacity 120ms;
}
.project-map .vue-flow__node-map:hover .map-handle,
.project-map--connecting .map-handle {
  opacity: 1;
}
/* The card a line would land on. */
.project-map--connecting .vue-flow__node-map:hover .map-card {
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 40%, transparent);
}
.project-map .map-handle.map-handle--hidden {
  opacity: 0;
  pointer-events: none;
}
/* A line that opens its app's component list. */
.project-map .vue-flow__edge.map-edge--uses {
  cursor: pointer;
}
.project-map .vue-flow__connection-path {
  stroke: var(--primary);
  stroke-width: 2;
  stroke-dasharray: 4 4;
}
.project-map .vue-flow__controls {
  box-shadow: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.project-map .vue-flow__controls-button {
  background: var(--card);
  color: var(--foreground);
  border-bottom: 1px solid var(--border);
}
.project-map .vue-flow__controls-button:hover {
  background: var(--accent);
}
.project-map .vue-flow__controls-button svg {
  fill: currentColor;
}
.project-map .vue-flow__minimap {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.project-map .vue-flow__edge-textbg {
  fill: var(--card);
}
</style>
