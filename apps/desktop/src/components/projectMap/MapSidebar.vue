<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Clock,
  Database,
  Globe,
  Search,
  StickyNote,
  Workflow,
  X,
} from 'lucide-vue-next';
import type { LaneBy, MapDifference, MapNode, MapNodeKind, PlanStatus } from '@tipeline/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAP_DRAG_TYPE, type MapDropKind } from './mapDrag';
import { ENTITY_COLORS } from '@/config/entityColors';

/**
 * The map editor's left sidebar: what to add (click, or drag onto the map), the lanes,
 * what needs attention, and everything on the map by kind.
 */
const props = defineProps<{
  nodes: MapNode[];
  differences: MapDifference[];
  lanesLayout: boolean;
  laneBy: LaneBy;
  lanes: string[];
  selected: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', key: string): void;
  (e: 'add', kind: MapDropKind): void;
  (e: 'lane-add', name: string): void;
  (e: 'lane-remove', name: string): void;
  (e: 'lane-move', name: string, by: -1 | 1): void;
}>();

const { t } = useI18n();
const search = ref('');
const newLane = ref('');

const TILES: { kind: MapDropKind; icon: any; tone: string }[] = [
  { kind: 'workflow', icon: Workflow, tone: ENTITY_COLORS.workflow.text },
  { kind: 'helper', icon: Database, tone: ENTITY_COLORS.subworkflow.text },
  { kind: 'app', icon: AppWindow, tone: ENTITY_COLORS.app.text },
  { kind: 'global', icon: Globe, tone: ENTITY_COLORS.global.text },
  { kind: 'schedule', icon: Clock, tone: ENTITY_COLORS.schedule.text },
];

function onDragStart(event: DragEvent, kind: MapDropKind) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(MAP_DRAG_TYPE, kind);
  event.dataTransfer.effectAllowed = 'copy';
}

const DOT: Record<PlanStatus, string> = {
  ready: 'bg-green-600',
  tested: 'bg-blue-500',
  built: 'bg-zinc-400 dark:bg-zinc-500',
  drafting: 'bg-amber-400',
  idea: 'border-[1.5px] border-dashed border-muted-foreground bg-transparent',
};

const matches = (n: MapNode) =>
  !search.value.trim() || n.name.toLowerCase().includes(search.value.trim().toLowerCase());
const own = computed(() => props.nodes.filter((n) => !n.external));

const GROUPS: { id: string; kinds: MapNodeKind[] }[] = [
  { id: 'workflows', kinds: ['workflow', 'helper'] },
  { id: 'apps', kinds: ['app'] },
  { id: 'globals', kinds: ['global'] },
  { id: 'schedules', kinds: ['schedule'] },
];

const groups = computed(() =>
  GROUPS.map((g) => ({
    id: g.id,
    total: own.value.filter((n) => g.kinds.includes(n.kind)).length,
    items: own.value
      .filter((n) => g.kinds.includes(n.kind) && matches(n))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.total)
);

const borrowed = computed(() => props.nodes.filter((n) => n.external && matches(n)));

/** One line per node that needs something: a difference first, then why it isn't tested. */
const attention = computed(() => {
  const out = new Map<string, { node: MapNode; reason: string }>();
  const byKey = new Map(props.nodes.map((n) => [n.key, n]));
  for (const d of props.differences) {
    const key = d.kind === 'missing-link' || d.kind === 'not-on-plan' ? d.to : d.nodeKey;
    const node = byKey.get(key);
    if (node && !out.has(key))
      out.set(key, {
        node,
        reason: t(`projectMap.differences.title.${d.kind}`),
      });
  }
  for (const n of own.value) {
    if (out.has(n.key) || n.planned) continue;
    if (n.readyStale)
      out.set(n.key, {
        node: n,
        reason: t('projectMap.editor.attention.readyStale'),
      });
    else if (['draft', 'neverRun', 'changedSinceRun', 'missingGlobal'].includes(n.statusWhy)) {
      out.set(n.key, {
        node: n,
        reason: t(`projectMap.editor.attention.${n.statusWhy}`),
      });
    }
  }
  return [...out.values()].filter((a) => matches(a.node));
});

const nameOf = (n: MapNode) => (n.kind === 'global' && !n.planned ? `_global.${n.name}` : n.name);
const laneCount = (lane: string) => own.value.filter((n) => n.lane === lane).length;

function addLane() {
  const name = newLane.value.trim();
  newLane.value = '';
  if (name) emit('lane-add', name);
}
</script>

<template>
  <div class="flex h-full flex-col gap-5 overflow-y-auto scroll-fade p-3 text-sm">
    <div class="relative">
      <Search
        class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="search"
        class="h-8 pl-8"
        :placeholder="t('projectMap.editor.search')"
        :aria-label="t('projectMap.editor.search')"
      />
    </div>

    <section class="flex flex-col gap-2">
      <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t('projectMap.editor.add') }}
      </h3>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="tile in TILES"
          :key="tile.kind"
          type="button"
          draggable="true"
          class="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/50 bg-background px-2.5 py-2 text-left hover:bg-accent"
          @click="emit('add', tile.kind)"
          @dragstart="onDragStart($event, tile.kind)"
        >
          <component :is="tile.icon" class="size-4 shrink-0" :class="tile.tone" />
          {{ t(`projectMap.kind.${tile.kind}`) }}
        </button>
        <button
          type="button"
          draggable="true"
          class="flex items-center gap-2 rounded-lg border border-dashed border-yellow-400 bg-yellow-50 px-2.5 py-2 text-left hover:bg-yellow-100 dark:bg-yellow-950/40 dark:hover:bg-yellow-950"
          @click="emit('add', 'note')"
          @dragstart="onDragStart($event, 'note')"
        >
          <StickyNote class="size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
          {{ t('projectMap.notes.tile') }}
        </button>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ t('projectMap.editor.addHint') }}
      </p>
    </section>

    <section v-if="lanesLayout" class="flex flex-col gap-2">
      <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t('projectMap.layout.lanes') }}
      </h3>
      <p v-if="laneBy !== 'custom'" class="text-xs text-muted-foreground">
        {{ t(`projectMap.lanes.from.${laneBy}`) }}
      </p>
      <template v-else>
        <p class="text-xs text-muted-foreground">
          {{ t('projectMap.editor.lanesHint') }}
        </p>
        <div
          v-for="(lane, i) in lanes"
          :key="lane"
          class="flex items-center gap-1 rounded-lg border bg-background px-2 py-1"
        >
          <span class="min-w-0 flex-1 truncate font-medium">{{ lane }}</span>
          <span class="text-xs text-muted-foreground">{{ laneCount(lane) }}</span>
          <button
            type="button"
            class="rounded p-1 hover:bg-accent disabled:opacity-30"
            :disabled="i === 0"
            :aria-label="t('projectMap.editor.laneUp', { name: lane })"
            @click="emit('lane-move', lane, -1)"
          >
            <ArrowUp class="size-3" />
          </button>
          <button
            type="button"
            class="rounded p-1 hover:bg-accent disabled:opacity-30"
            :disabled="i === lanes.length - 1"
            :aria-label="t('projectMap.editor.laneDown', { name: lane })"
            @click="emit('lane-move', lane, 1)"
          >
            <ArrowDown class="size-3" />
          </button>
          <button
            type="button"
            class="rounded p-1 text-muted-foreground hover:text-destructive"
            :aria-label="t('projectMap.lanes.remove', { name: lane })"
            @click="emit('lane-remove', lane)"
          >
            <X class="size-3" />
          </button>
        </div>
        <form class="flex gap-1.5" @submit.prevent="addLane">
          <Input
            v-model="newLane"
            class="h-8"
            :placeholder="t('projectMap.lanes.placeholder')"
            :aria-label="t('projectMap.editor.newLane')"
          />
          <Button type="submit" size="sm" variant="outline" :disabled="!newLane.trim()">{{
            t('projectMap.lanes.add')
          }}</Button>
        </form>
      </template>
    </section>

    <section v-if="attention.length" class="flex flex-col gap-0.5">
      <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t('projectMap.editor.attentionTitle') }} · {{ attention.length }}
      </h3>
      <button
        v-for="a in attention"
        :key="a.node.key"
        type="button"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
        :class="selected === a.node.key ? 'bg-accent font-medium' : ''"
        @click="emit('select', a.node.key)"
      >
        <span class="size-2 shrink-0 rounded-full bg-amber-500" />
        <span class="min-w-0 truncate">{{ nameOf(a.node) }}</span>
        <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ a.reason }}</span>
      </button>
    </section>

    <section class="flex flex-col gap-0.5">
      <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t('projectMap.editor.onMap') }}
      </h3>
      <template v-for="group in groups" :key="group.id">
        <div class="px-2 pb-0.5 pt-2 text-xs font-semibold">
          {{ t(`projectMap.editor.groups.${group.id}`) }} · {{ group.total }}
        </div>
        <button
          v-for="n in group.items"
          :key="n.key"
          type="button"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
          :class="selected === n.key ? 'bg-accent font-medium' : ''"
          :title="t(`projectMap.status.${n.status}`)"
          @click="emit('select', n.key)"
        >
          <span class="size-2 shrink-0 rounded-full" :class="DOT[n.status]" />
          <span class="min-w-0 truncate" :class="n.kind === 'global' ? 'font-mono text-xs' : ''">{{
            nameOf(n)
          }}</span>
          <StickyNote v-if="n.note" class="ml-auto size-3 shrink-0 text-yellow-600" />
        </button>
      </template>
      <template v-if="borrowed.length">
        <div class="px-2 pb-0.5 pt-2 text-xs font-semibold">
          {{ t('projectMap.editor.groups.borrowed') }} · {{ borrowed.length }}
        </div>
        <button
          v-for="n in borrowed"
          :key="n.key"
          type="button"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-accent"
          @click="emit('select', n.key)"
        >
          <span class="size-2 shrink-0 rounded-full" :class="DOT[n.status]" />
          <span class="min-w-0 truncate">{{ n.name }}</span>
          <span v-if="n.projects.length" class="ml-auto shrink-0 truncate text-xs">{{ n.projects.map((p) => p.name).join(", ") }}</span>
        </button>
      </template>
      <p v-if="!groups.length && !borrowed.length" class="px-2 text-xs text-muted-foreground">
        {{ t('projectMap.editor.nothing') }}
      </p>
    </section>
  </div>
</template>
