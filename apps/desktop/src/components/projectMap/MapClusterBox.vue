<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position } from '@vue-flow/core';
import { ChevronDown, ChevronRight, Layers } from 'lucide-vue-next';
import { MAP_NODE_H, MAP_NODE_W, type MapCluster } from '@tipeline/utils';
import { ENTITY_COLORS } from '@/config/entityColors';

/**
 * Workflows that only connect to one node, as one box: open, a grid (its cards are Vue
 * Flow child nodes drawn over it); closed, a single stacked card.
 */
const props = defineProps<{
  cluster: MapCluster;
  anchorName: string;
  width: number;
  height: number;
  dimmed?: boolean;
}>();

const emit = defineEmits<{ (e: 'toggle'): void }>();

const { t } = useI18n();

const count = computed(() => props.cluster.members.length);
// Workflows the one they're grouped by runs are its sub-workflows.
const iconTone = computed(() =>
  props.cluster.edgeKind === 'calls' && !props.cluster.toAnchor ? ENTITY_COLORS.subworkflow.text : ENTITY_COLORS.workflow.text
);
const why = computed(() => {
  const dir = props.cluster.toAnchor ? 'in' : 'out';
  const key = `projectMap.cluster.only.${props.cluster.edgeKind}.${dir}`;
  return t(key, { name: props.anchorName });
});
</script>

<template>
  <div class="relative h-full w-full transition-opacity" :class="dimmed ? 'opacity-40' : ''">
    <Handle type="target" :position="Position.Left" :connectable="false" class="map-handle map-handle--hidden" />
    <Handle type="source" :position="Position.Right" :connectable="false" class="map-handle map-handle--hidden" />

    <!-- Open: a frame the member cards sit in -->
    <div
      v-if="cluster.open"
      class="h-full w-full rounded-2xl border border-dashed border-border bg-muted/50"
      :style="{ width: `${width}px`, height: `${height}px` }"
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-t-2xl px-4 pt-2.5 pb-2 text-left text-xs hover:bg-accent/60"
        :aria-expanded="true"
        :title="t('projectMap.cluster.close')"
        @click.stop="emit('toggle')"
      >
        <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
        <span class="font-semibold text-foreground">{{ t('projectMap.cluster.title', { count }, count) }}</span>
        <span class="truncate text-muted-foreground">· {{ why }}</span>
      </button>
    </div>

    <!-- Closed: one card that looks like a stack -->
    <button
      v-else
      type="button"
      class="relative block text-left"
      :style="{ width: `${MAP_NODE_W}px`, height: `${MAP_NODE_H}px` }"
      :aria-expanded="false"
      :title="t('projectMap.cluster.open')"
      @click.stop="emit('toggle')"
    >
      <span class="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border bg-card" aria-hidden="true" />
      <span class="absolute inset-0 translate-x-1 translate-y-1 rounded-xl border bg-card" aria-hidden="true" />
      <span class="absolute inset-0 flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-sm shadow-xs hover:bg-accent">
        <Layers class="size-5 shrink-0" :class="iconTone" />
        <span class="min-w-0 leading-tight">
          <span class="block truncate font-semibold">{{ t('projectMap.cluster.title', { count }, count) }}</span>
          <span class="block truncate text-[11px] text-muted-foreground">{{ why }}</span>
        </span>
        <ChevronRight class="ml-auto size-4 shrink-0 text-muted-foreground" />
      </span>
    </button>
  </div>
</template>
