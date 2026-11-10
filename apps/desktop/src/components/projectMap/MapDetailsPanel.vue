<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ArrowLeftRight, BadgeCheck, ExternalLink, Link2, Link2Off, Loader2, Sparkles, StickyNote, Trash2, X } from 'lucide-vue-next';
import {
  descriptionSummary,
  linkableKinds,
  otherGlobalKind,
  type MapEdge,
  type MapEdgeKind,
  type MapNode,
  type MergedMap,
  type PlanNode,
  type PlanStatus,
} from '@tipeline/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ScheduleDetails from '@/components/schedule/ScheduleDetails.vue';

const props = defineProps<{
  node: MapNode;
  map: MergedMap;
  /** The plan node behind it, if any. */
  planNode?: PlanNode;
  /** The project's own map (the all-projects map only looks). */
  editable: boolean;
  lanes: string[];
  /** Creating the real thing from this planned node. */
  creating?: boolean;
  /** Inside a sidebar whose header has its own close button. */
  hideHeaderClose?: boolean;
  /** What it can be linked to (everything in Tipeline); without it, what's on this map. */
  linkTargets?: { key: string; name: string; project: string | null; linked?: boolean }[];
}>();

const emit = defineEmits<{
  (e: 'select', key: string): void;
  (e: 'close'): void;
  /** A change to the node's notes: on its plan node when it has one, else on the live node. */
  (e: 'update', patch: Partial<Pick<PlanNode, 'name' | 'description' | 'owner' | 'lane' | 'inputs' | 'outputs' | 'note'>>): void;
  /** Sign it off as ready, or take that back. */
  (e: 'ready', on: boolean): void;
  (e: 'remove'): void;
  (e: 'link', key: string): void;
  (e: 'unlink'): void;
  (e: 'remove-edge', planEdgeId: string): void;
  /** A planned workflow–global line switched between reads and writes. */
  (e: 'set-edge-kind', planEdgeId: string, kind: MapEdgeKind): void;
  (e: 'build'): void;
  /** Make the planned app, global or schedule for real (`type` for a global, `when` for a schedule). */
  (e: 'create', options: { type?: string; when?: string }): void;
  /** Move a workflow or app that's in no project into this one. */
  (e: 'adopt'): void;
  /** A planned schedule drawn to several workflows: one schedule each. */
  (e: 'split-schedule'): void;
  /** A real schedule was edited or switched on/off here: the map should reload. */
  (e: 'changed'): void;
}>();

const { t } = useI18n();
const router = useRouter();

const byKey = computed(() => new Map(props.map.nodes.map((n) => [n.key, n])));

const NONE = '__none__';

type Connection = { edge: MapEdge; other: MapNode; outgoing: boolean; /** The kind a planned line can switch to. */ switchTo: MapEdgeKind | null };

/** Lines in and out, grouped under a heading per kind and direction ("Read by", "Writes"…). */
const groups = computed(() => {
  const out = new Map<string, Connection[]>();
  for (const edge of props.map.edges) {
    const outgoing = edge.from === props.node.key;
    if (!outgoing && edge.to !== props.node.key) continue;
    const other = byKey.value.get(outgoing ? edge.to : edge.from);
    if (!other) continue;
    const heading = `${edge.kind}.${outgoing ? 'out' : 'in'}`;
    const [from, to] = outgoing ? [props.node, other] : [other, props.node];
    // Only a line that's on the plan alone: one that matches the definition is right as it is.
    const switchTo = edge.source === 'plan' && edge.planEdgeId ? otherGlobalKind(from.kind, to.kind, edge.kind) : null;
    out.set(heading, [...(out.get(heading) ?? []), { edge, other, outgoing, switchTo }]);
  }
  return [...out.entries()].map(([heading, items]) => ({ heading, items }));
});

const headingLabel = (heading: string) => {
  const [kind, dir] = heading.split('.') as [MapEdgeKind, 'in' | 'out'];
  return t(`projectMap.connections.${kind}.${dir}`);
};

const dynamicCount = computed(() => props.map.nodes.filter((n) => n.dynamicGlobals).length);

/** Live nodes a planned one could become: same kind, not taken by another plan node. */
const linkTargets = computed(
  () =>
    props.linkTargets ??
    props.map.nodes
      .filter((n) => !n.planned && !n.planId && linkableKinds(props.node.kind).includes(n.kind))
      .map((n) => ({ key: n.key, name: n.name, project: n.project?.name ?? null, linked: false }))
      .sort((a, b) => a.name.localeCompare(b.name))
);

const openTarget = computed(() => {
  const n = props.node;
  if (n.planned || !n.ref) return null;
  if (n.kind === 'workflow' || n.kind === 'helper') return `/tasks/${n.ref}`;
  if (n.kind === 'app') return `/apps/${n.ref}`;
  if (n.kind === 'global') return '/variables';
  return '/schedules';
});

const listOf = (text: string | number) =>
  [
    ...new Set(
      String(text)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];

function commitList(which: 'inputs' | 'outputs', text: string | number) {
  emit('update', { [which]: listOf(text) });
}

const plannedInputs = computed(() => (props.planNode?.inputs ?? []).join(', '));
const plannedOutputs = computed(() => (props.planNode?.outputs ?? []).join(', '));
const isWorkflow = computed(() => props.node.kind === 'workflow' || props.node.kind === 'helper');

const STATUS_BADGE: Record<PlanStatus, string> = {
  idea: 'bg-muted text-muted-foreground',
  drafting: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  built: 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
  tested: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300',
  ready: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-300',
};

const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const GLOBAL_TYPES = ['string', 'number', 'boolean', 'object', 'array'];
const globalType = ref('string');
const globalNameOk = computed(() => /^[a-zA-Z0-9][a-zA-Z0-9_]*$/.test(props.node.name));

const when = ref('');
/** The workflow a planned schedule starts: from its line. */
/** A schedule starts one workflow, so more than one line from a planned one needs splitting. */
const scheduleTargets = computed(() =>
  props.map.edges.filter((e) => e.from === props.node.key && e.kind === 'triggers').length
);
const scheduleTarget = computed(() => {
  const edge = props.map.edges.find((e) => e.from === props.node.key && e.kind === 'triggers');
  return edge ? byKey.value.get(edge.to) : undefined;
});
</script>

<template>
  <aside class="flex h-full w-full flex-col gap-4 overflow-y-auto scroll-fade p-4 text-sm">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {{ node.planned ? t('projectMap.details.planned', { kind: t(`projectMap.kind.${node.kind}`) }) : t(`projectMap.kind.${node.kind}`) }}
        </div>
        <h3 class="mt-0.5 break-words text-base font-semibold" :class="node.kind === 'global' ? 'font-mono' : ''">
          <!-- A built workflow or app: its name opens it. -->
          <RouterLink
            v-if="openTarget && (isWorkflow || node.kind === 'app')"
            :to="openTarget"
            class="hover:underline"
            :title="t('projectMap.details.open')"
          >
            {{ node.name }}<ExternalLink class="ml-1 inline size-3.5 align-[-1px] text-muted-foreground" />
          </RouterLink>
          <template v-else>{{ node.kind === 'global' && !node.planned ? `_global.${node.name}` : node.name }}</template>
        </h3>
        <p v-if="node.external" class="text-xs text-muted-foreground">
          {{ node.project ? t('projectMap.details.fromProject', { name: node.project.name }) : t('projectMap.details.noProject') }}
        </p>
        <!-- One in no project can join this one; one owned by another project stays there. -->
        <template v-if="editable && node.external && !node.project && (node.kind === 'workflow' || node.kind === 'helper' || node.kind === 'app')">
          <p class="mt-1 text-xs text-muted-foreground">{{ t('projectMap.details.adoptHint') }}</p>
          <Button size="sm" variant="outline" class="mt-2" @click="emit('adopt')">{{ t('projectMap.details.adopt') }}</Button>
        </template>
      </div>
      <button
        v-if="!hideHeaderClose"
        type="button"
        class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>
    </div>

    <p v-if="node.description && !(editable && node.planned)" class="text-muted-foreground">
      {{ descriptionSummary(node.description) }}
    </p>

    <p v-if="node.missing" class="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {{ t('projectMap.details.missingGlobal') }}
    </p>
    <p v-if="node.linkMissing" class="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {{ t('projectMap.details.linkMissing') }}
    </p>

    <!-- Planned node: everything about it is editable -->
    <template v-if="editable && node.planned && planNode">
      <label class="flex flex-col gap-1.5 text-xs font-semibold">
        {{ t('projectMap.details.name') }}
        <Input :model-value="planNode.name" @change="emit('update', { name: ($event.target as HTMLInputElement).value.trim() || planNode.name })" />
      </label>
      <label class="flex flex-col gap-1.5 text-xs font-semibold">
        {{ t('projectMap.details.description') }}
        <Textarea
          :model-value="planNode.description ?? ''"
          rows="4"
          :placeholder="t('projectMap.details.descriptionPlaceholder')"
          @change="emit('update', { description: ($event.target as HTMLTextAreaElement).value })"
        />
      </label>
    </template>

    <!-- Status: worked out from facts; only Ready is given by a person -->
    <div v-if="!node.external" class="flex flex-col gap-2 rounded-lg border p-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold">{{ t('projectMap.details.status') }}</span>
        <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="STATUS_BADGE[node.status]">
          {{ t(`projectMap.status.${node.status}`) }}
        </span>
      </div>
      <p class="text-xs text-muted-foreground">{{ t(`projectMap.statusWhy.${node.statusWhy}`) }}</p>
      <p v-if="node.status === 'ready' && node.readyAt" class="text-xs text-muted-foreground">
        {{ node.readyBy ? t('projectMap.ready.byOn', { name: node.readyBy, date: dateOf(node.readyAt) }) : t('projectMap.ready.on', { date: dateOf(node.readyAt) }) }}
      </p>
      <p v-if="node.readyStale" class="text-xs text-amber-700 dark:text-amber-400">{{ t('projectMap.ready.stale') }}</p>
      <dl v-if="isWorkflow && !node.planned" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt class="text-muted-foreground">{{ t('projectMap.details.lastChange') }}</dt>
        <dd>{{ node.changedAt ? dateOf(node.changedAt) : '—' }}</dd>
        <dt class="text-muted-foreground">{{ t('projectMap.details.lastSuccess') }}</dt>
        <dd>{{ node.lastSuccessAt ? dateOf(node.lastSuccessAt) : t('projectMap.details.never') }}</dd>
      </dl>
      <div v-if="node.status === 'ready' || node.canBeReady" class="flex gap-2">
        <Button v-if="node.status === 'ready'" size="sm" variant="outline" @click="emit('ready', false)">
          {{ t('projectMap.ready.unmark') }}
        </Button>
        <Button v-else size="sm" @click="emit('ready', true)">
          <BadgeCheck class="size-4" /> {{ t('projectMap.ready.mark') }}
        </Button>
      </div>
    </div>

    <!-- A real schedule: when it runs, on or off, and editing it right here -->
    <ScheduleDetails
      v-if="node.kind === 'schedule' && !node.planned && node.ref"
      :schedule-identifier="node.ref"
      @changed="emit('changed')"
    />

    <!-- A note pinned to the node, in either mode: for the team, not the definition -->
    <label class="flex flex-col gap-1.5 text-xs font-semibold">
      <span class="flex items-center gap-1.5"><StickyNote class="size-3.5" /> {{ t('projectMap.notes.nodeLabel') }}</span>
      <Textarea
        :model-value="node.note ?? ''"
        rows="3"
        :placeholder="t('projectMap.notes.nodePlaceholder')"
        @change="emit('update', { note: ($event.target as HTMLTextAreaElement).value.trim() || undefined })"
      />
    </label>

    <!-- Notes every node can have on its project's map -->
    <div v-if="editable && !node.external" class="grid grid-cols-1 gap-3">
      <label class="flex flex-col gap-1.5 text-xs font-semibold">
        {{ t('projectMap.details.owner') }}
        <Input
          :model-value="node.owner ?? ''"
          :placeholder="t('projectMap.details.ownerPlaceholder')"
          @change="emit('update', { owner: ($event.target as HTMLInputElement).value.trim() || undefined })"
        />
      </label>
      <label v-if="lanes.length" class="flex flex-col gap-1.5 text-xs font-semibold">
        {{ t('projectMap.details.lane') }}
        <Select
          :model-value="node.lane && lanes.includes(node.lane) ? node.lane : NONE"
          @update:model-value="emit('update', { lane: $event === NONE ? undefined : String($event) })"
        >
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="NONE">{{ t('projectMap.lanes.unassigned') }}</SelectItem>
            <SelectItem v-for="lane in lanes" :key="lane" :value="lane">{{ lane }}</SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>

    <!-- Planned inputs and outputs: what the plan expects; checked once linked -->
    <div v-if="editable && isWorkflow && planNode" class="flex flex-col gap-3">
      <label class="flex flex-col gap-1.5 text-xs font-semibold">
        {{ t('projectMap.details.plannedInputs') }}
        <Input :model-value="plannedInputs" :placeholder="t('projectMap.details.listPlaceholder')" @change="commitList('inputs', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="flex flex-col gap-1.5 text-xs font-semibold">
        {{ t('projectMap.details.plannedOutputs') }}
        <Input :model-value="plannedOutputs" :placeholder="t('projectMap.details.listPlaceholder')" @change="commitList('outputs', ($event.target as HTMLInputElement).value)" />
      </label>
    </div>

    <!-- What the definition says -->
    <div v-if="!node.planned && isWorkflow && (node.inputs.length || node.outputs.length)" class="flex flex-col gap-1.5">
      <div class="text-xs font-semibold">{{ t('projectMap.details.inputsOutputs') }}</div>
      <div class="flex flex-wrap gap-1.5 text-xs">
        <span v-for="i in node.inputs" :key="`in-${i}`" class="rounded-md bg-muted px-2 py-0.5">{{ t('projectMap.details.in', { name: i }) }}</span>
        <span v-for="o in node.outputs" :key="`out-${o}`" class="rounded-md bg-muted px-2 py-0.5">{{ t('projectMap.details.out', { name: o }) }}</span>
      </div>
    </div>

    <div v-if="groups.length" class="flex flex-col gap-3">
      <div v-for="group in groups" :key="group.heading" class="flex flex-col gap-1">
        <div class="text-xs font-semibold">{{ headingLabel(group.heading) }} ({{ group.items.length }})</div>
        <div v-for="item in group.items" :key="item.edge.key" class="group flex items-center justify-between gap-2">
          <button type="button" class="min-w-0 truncate text-left text-primary hover:underline" @click="emit('select', item.other.key)">
            {{ item.other.kind === 'global' ? `_global.${item.other.name}` : item.other.name }}
            <span v-if="item.edge.source === 'plan'" class="text-xs text-muted-foreground"> · {{ t('projectMap.details.plannedLine') }}</span>
          </button>
          <button
            v-if="editable && item.switchTo"
            type="button"
            class="ml-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 focus:opacity-100"
            :aria-label="t(`projectMap.differences.makeKind.${item.switchTo}`)"
            :title="t(`projectMap.differences.makeKind.${item.switchTo}`)"
            @click="emit('set-edge-kind', item.edge.planEdgeId!, item.switchTo)"
          >
            <ArrowLeftRight class="size-3.5" />
          </button>
          <button
            v-if="editable && item.edge.planEdgeId"
            type="button"
            class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
            :aria-label="t(item.edge.source === 'both' ? 'projectMap.details.removeLineFromPlan' : 'projectMap.details.removeLine')"
            :title="t(item.edge.source === 'both' ? 'projectMap.details.removeLineFromPlan' : 'projectMap.details.removeLine')"
            @click="emit('remove-edge', item.edge.planEdgeId!)"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </div>
    </div>
    <p v-else class="text-muted-foreground">
      {{ editable ? t('projectMap.details.noLinesPlan') : t('projectMap.details.noLines') }}
    </p>

    <p v-if="node.kind === 'global' && dynamicCount" class="border-t pt-3 text-xs text-muted-foreground">
      {{ t('projectMap.details.dynamic', { count: dynamicCount }, dynamicCount) }}
    </p>
    <p v-if="node.dynamicGlobals" class="border-t pt-3 text-xs text-muted-foreground">
      {{ t('projectMap.details.dynamicSelf') }}
    </p>

    <!-- Turning a planned node into the real thing -->
    <div v-if="editable && node.planned" class="flex flex-col gap-2 border-t pt-3">
      <Button v-if="isWorkflow" @click="emit('build')">
        <Sparkles class="size-4" /> {{ t('projectMap.details.build') }}
      </Button>
      <Button v-else-if="node.kind === 'app'" :disabled="creating" @click="emit('create', {})">
        <Loader2 v-if="creating" class="size-4 animate-spin" /> {{ t('projectMap.details.createApp') }}
      </Button>

      <template v-else-if="node.kind === 'global'">
        <p class="text-xs text-muted-foreground">
          {{ globalNameOk ? t('projectMap.details.createGlobalHint', { name: node.name }) : t('projectMap.details.globalNameInvalid') }}
        </p>
        <div class="flex gap-2">
          <Select v-model="globalType">
            <SelectTrigger class="w-32" :aria-label="t('projectMap.details.globalType')"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="type in GLOBAL_TYPES" :key="type" :value="type">{{ type }}</SelectItem>
            </SelectContent>
          </Select>
          <Button class="flex-1" :disabled="creating || !globalNameOk" @click="emit('create', { type: globalType })">
            <Loader2 v-if="creating" class="size-4 animate-spin" /> {{ t('projectMap.details.createGlobal') }}
          </Button>
        </div>
      </template>

      <template v-else-if="node.kind === 'schedule'">
        <template v-if="scheduleTargets > 1">
          <p class="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {{ t('projectMap.schedule.tooMany', { count: scheduleTargets }) }}
          </p>
          <Button size="sm" variant="outline" @click="emit('split-schedule')">{{ t('projectMap.schedule.split') }}</Button>
        </template>
        <p v-else-if="!scheduleTarget" class="text-xs text-muted-foreground">{{ t('projectMap.details.scheduleNeedsLine') }}</p>
        <p v-else-if="scheduleTarget.planned" class="text-xs text-muted-foreground">
          {{ t('projectMap.details.scheduleTargetPlanned', { name: scheduleTarget.name }) }}
        </p>
        <form v-else class="flex flex-col gap-2" @submit.prevent="when.trim() && emit('create', { when: when.trim() })">
          <label class="flex flex-col gap-1.5 text-xs font-semibold">
            {{ t('projectMap.details.scheduleWhen', { name: scheduleTarget.name }) }}
            <Input v-model="when" :placeholder="t('projectMap.details.scheduleWhenPlaceholder')" />
          </label>
          <Button type="submit" :disabled="creating || !when.trim()">
            <Loader2 v-if="creating" class="size-4 animate-spin" /> {{ t('projectMap.details.createSchedule') }}
          </Button>
        </form>
      </template>
      <!-- Nothing to link to: no section, rather than a dropdown that can't open. -->
      <label v-if="linkTargets.length" class="mt-1 flex flex-col gap-1.5 text-xs font-semibold">
        <span class="flex items-center gap-1.5"><Link2 class="size-3.5" /> {{ t('projectMap.details.linkExisting') }}</span>
        <Select :model-value="undefined" @update:model-value="emit('link', String($event))">
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="t('projectMap.details.linkPick')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="n in linkTargets" :key="n.key" :value="n.key" :disabled="n.linked">
              {{ n.name }}<template v-if="n.project"> · {{ n.project }}</template>
              <span v-if="n.linked" class="ml-1 text-muted-foreground">· {{ t('projectMap.details.linkTaken') }}</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Button variant="ghost" class="justify-start text-destructive hover:text-destructive" @click="emit('remove')">
        <Trash2 class="size-4" /> {{ t('projectMap.details.removePlanned') }}
      </Button>
    </div>

    <div v-if="!node.planned" class="mt-auto flex flex-wrap gap-2 border-t pt-3">
      <Button v-if="openTarget" variant="outline" size="sm" @click="router.push(openTarget)">
        <ExternalLink class="size-3.5" /> {{ t('projectMap.details.open') }}
      </Button>
      <Button v-if="editable && node.planId" variant="ghost" size="sm" @click="emit('unlink')">
        <Link2Off class="size-3.5" /> {{ t('projectMap.details.unlink') }}
      </Button>
    </div>
  </aside>
</template>
