<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CircleCheck } from 'lucide-vue-next';
import type { MapDifference, MapEdgeKind, MergedMap, PlanStatus } from '@tipeline/utils';
import { Button } from '@/components/ui/button';
import { ENTITY_COLORS } from '@/config/entityColors';

const props = defineProps<{ map: MergedMap; /** Inside a sidebar that shows the title. */ hideTitle?: boolean }>();

const emit = defineEmits<{
  (e: 'select', key: string): void;
  (e: 'remove-edge', planEdgeId: string): void;
  /** A planned "starts" line moved onto a new planned schedule: a schedule starts one workflow. */
  (e: 'new-schedule', planEdgeId: string): void;
  (e: 'add-edge', from: string, to: string, kind: MapEdgeKind): void;
  (e: 'ignore', differenceKey: string): void;
  (e: 'accept-fields', nodeKey: string, which: 'inputs' | 'outputs', actual: string[]): void;
  (e: 'unlink', nodeKey: string): void;
}>();

const { t } = useI18n();

const nameOf = (key: string) => {
  const n = props.map.nodes.find((x) => x.key === key);
  if (!n) return key;
  return n.kind === 'global' && !n.planned ? `_global.${n.name}` : n.name;
};

const dynamicCount = computed(() => props.map.nodes.filter((n) => n.dynamicGlobals).length);
const externalCount = computed(() => props.map.nodes.filter((n) => n.external).length);

function sentence(d: MapDifference) {
  switch (d.kind) {
    case 'missing-link':
      return t(`projectMap.differences.missing.${d.edgeKind}`, { from: nameOf(d.from), to: nameOf(d.to) });
    case 'not-on-plan':
      return t(`projectMap.differences.unplanned.${d.edgeKind}`, { from: nameOf(d.from), to: nameOf(d.to) });
    case 'inputs':
    case 'outputs':
      return t(`projectMap.differences.${d.kind}`, {
        name: nameOf(d.nodeKey),
        planned: d.planned.join(', ') || '—',
        actual: d.actual.join(', ') || t('projectMap.differences.none'),
      });
    case 'link-missing':
      return t('projectMap.differences.linkMissing', { name: nameOf(d.nodeKey) });
  }
}

// Furthest along first, so the bar fills from the left as things get done.
const BAR: PlanStatus[] = ['ready', 'tested', 'built', 'drafting', 'idea'];
const SEGMENT: Record<PlanStatus, string> = {
  ready: 'bg-green-600',
  tested: 'bg-blue-500',
  built: 'bg-zinc-400 dark:bg-zinc-500',
  drafting: 'bg-amber-400',
  idea: 'bg-zinc-200 dark:bg-zinc-700',
};
const progressLabel = computed(() =>
  BAR.map((s) => `${t(`projectMap.status.${s}`)} ${props.map.progress[s]}`).join(', ')
);

/** Differences only mean something once something is planned or linked. */
const hasPlan = computed(() => props.map.nodes.some((n) => n.planned || n.planId));
const titleOf = (d: MapDifference) => t(`projectMap.differences.title.${d.kind}`);
const unplanned = (d: MapDifference) => d.kind === 'not-on-plan';
</script>

<template>
  <aside class="flex h-full w-full flex-col gap-4 overflow-y-auto scroll-fade p-4 text-sm">
    <div>
      <h3 v-if="!hideTitle" class="text-base font-semibold">{{ t('projectMap.overview.title') }}</h3>
      <p class="text-muted-foreground">{{ t('projectMap.overview.hint') }}</p>
    </div>

    <div v-if="map.progress.total" class="flex flex-col gap-2">
      <div class="text-xs font-semibold">
        {{ t('projectMap.progress', { ready: map.progress.ready, total: map.progress.total }) }}
      </div>
      <div class="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" :aria-label="progressLabel">
        <div
          v-for="s in BAR"
          :key="s"
          class="h-full transition-[width]"
          :class="SEGMENT[s]"
          :style="{ width: `${(map.progress[s] / map.progress.total) * 100}%` }"
        />
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span v-for="s in BAR" :key="s" class="inline-flex items-center gap-1.5">
          <span class="size-2 rounded-full" :class="SEGMENT[s]" />
          {{ t(`projectMap.status.${s}`) }} {{ map.progress[s] }}
        </span>
      </div>
    </div>

    <template v-if="map.differences.length || hasPlan">
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <h4 class="font-semibold">{{ t('projectMap.differences.heading') }}</h4>
          <span v-if="map.differences.length" class="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {{ t('projectMap.differences.count', { count: map.differences.length }, map.differences.length) }}
          </span>
        </div>
        <p class="text-xs text-muted-foreground">{{ t('projectMap.differences.hint') }}</p>
      </div>
      <p v-if="!map.differences.length" class="flex items-center gap-2 text-muted-foreground">
        <CircleCheck class="size-4 text-green-600" /> {{ t('projectMap.differences.empty') }}
      </p>
      <div
        v-for="d in map.differences"
        :key="d.key"
        class="flex flex-col gap-2 rounded-lg border p-3"
        :class="unplanned(d) ? 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'"
      >
        <div
          class="text-[11px] font-semibold uppercase tracking-wide"
          :class="unplanned(d) ? 'text-orange-800 dark:text-orange-300' : 'text-amber-800 dark:text-amber-300'"
        >
          {{ titleOf(d) }}
        </div>
        <p>{{ sentence(d) }}</p>
        <div class="flex flex-wrap gap-2">
          <template v-if="d.kind === 'missing-link'">
            <Button size="sm" @click="emit('select', d.to)">{{ t('projectMap.differences.show') }}</Button>
            <Button v-if="d.edgeKind === 'triggers'" size="sm" variant="outline" @click="emit('new-schedule', d.planEdgeId)">
              {{ t('projectMap.schedule.planSeparate') }}
            </Button>
            <Button size="sm" variant="outline" @click="emit('remove-edge', d.planEdgeId)">{{ t('projectMap.differences.removeFromPlan') }}</Button>
          </template>
          <template v-else-if="d.kind === 'not-on-plan'">
            <Button size="sm" @click="emit('add-edge', d.from, d.to, d.edgeKind)">{{ t('projectMap.differences.addToPlan') }}</Button>
            <Button size="sm" variant="outline" @click="emit('ignore', d.key)">{{ t('projectMap.differences.ignore') }}</Button>
          </template>
          <template v-else-if="d.kind === 'inputs' || d.kind === 'outputs'">
            <Button size="sm" @click="emit('accept-fields', d.nodeKey, d.kind, d.actual)">{{ t('projectMap.differences.updatePlan') }}</Button>
            <Button size="sm" variant="outline" @click="emit('select', d.nodeKey)">{{ t('projectMap.differences.show') }}</Button>
          </template>
          <template v-else>
            <Button size="sm" variant="outline" @click="emit('unlink', d.nodeKey)">{{ t('projectMap.details.unlink') }}</Button>
          </template>
        </div>
      </div>
    </template>

    <div class="mt-auto flex flex-col gap-1.5 border-t pt-3 text-xs text-muted-foreground">
      <div class="font-semibold text-foreground">{{ t('projectMap.legend.title') }}</div>
      <p>{{ t('projectMap.legend.direction') }}</p>
      <span><span class="mr-1.5 inline-block h-0.5 w-5 align-middle" :style="{ background: ENTITY_COLORS.subworkflow.hex }" />{{ t('projectMap.legend.subworkflows') }}</span>
      <span><span class="mr-1.5 inline-block h-0.5 w-5 align-middle" style="background: #71717a" />{{ t('projectMap.legend.apps') }}</span>
      <span class="flex items-center">
        <svg class="mr-1.5 shrink-0" width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" :style="{ color: ENTITY_COLORS.global.hex }">
          <path d="M0 4h15" stroke="currentColor" stroke-width="2" /><path d="M13 0.5 20 4l-7 3.5z" fill="currentColor" />
        </svg>
        {{ t('projectMap.legend.globalsWrite') }}
      </span>
      <span class="flex items-center">
        <svg class="mr-1.5 shrink-0" width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" :style="{ color: ENTITY_COLORS.global.hex }">
          <path d="M0 4h18.5M13 0.5 19 4l-6 3.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
        {{ t('projectMap.legend.globalsRead') }}
      </span>
      <span><span class="mr-1.5 inline-block h-0.5 w-5 align-middle" :style="{ background: ENTITY_COLORS.schedule.hex }" />{{ t('projectMap.legend.schedules') }}</span>
      <span>{{ t('projectMap.legend.readHint') }}</span>
      <span>{{ t('projectMap.legend.dashed') }}</span>
      <span class="text-amber-700 dark:text-amber-400">{{ t('projectMap.legend.amber') }}</span>
      <span class="text-orange-700 dark:text-orange-400">{{ t('projectMap.legend.unplanned') }}</span>
      <span v-if="externalCount">{{ t('projectMap.legend.external', { count: externalCount }, externalCount) }}</span>
      <span v-if="dynamicCount">{{ t('projectMap.details.dynamic', { count: dynamicCount }, dynamicCount) }}</span>
    </div>
  </aside>
</template>
