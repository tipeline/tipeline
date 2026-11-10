<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position } from '@vue-flow/core';
import { AppWindow, Clock, Database, Globe, CornerDownRight, Lock, StickyNote, TriangleAlert, Workflow } from 'lucide-vue-next';
import { MAP_NODE_H, MAP_NODE_W, type MapNode } from '@tipeline/utils';
import { ENTITY_COLORS, type Entity } from '@/config/entityColors';

/** One node of the map, drawn inside Vue Flow. Lines leave on the right and arrive on the left. */
const props = defineProps<{
  node: MapNode;
  selected: boolean;
  /** Faded: not related to what's selected. */
  dimmed?: boolean;
  /** Another workflow on the map runs this one: drawn as a sub-workflow. */
  subworkflow?: boolean;
  /** Lines can be drawn from the handle, and differences show. */
  editable: boolean;
}>();

const { t } = useI18n();

const icon = computed(() =>
  props.node.hidden ? Lock : { workflow: Workflow, helper: Database, app: AppWindow, global: Globe, schedule: Clock }[props.node.kind]
);

const flagged = computed(() => props.editable && props.node.differences > 0);

/** Helpers are sub-workflows by design; a workflow another one runs is drawn as one too. */
const entity = computed<Entity>(() => {
  const kind = props.node.kind;
  if (kind === 'helper' || (kind === 'workflow' && props.subworkflow)) return 'subworkflow';
  return kind;
});

const kindLabel = computed(() =>
  entity.value === 'subworkflow' && props.node.kind === 'workflow'
    ? t('projectMap.kind.subworkflow')
    : t(`projectMap.kind.${props.node.kind}`)
);

// A flagged card keeps its kind's fill; the thick amber border and alert icon say why.
const tone = computed(() => {
  const colors = ENTITY_COLORS[entity.value];
  if (flagged.value) return `border-2 border-amber-500 ${colors.fill}`;
  const planned = props.node.planned || props.node.missing;
  return planned ? `border-2 border-dashed ${colors.border} bg-background` : `border ${colors.card}`;
});

/** From outside the project and not on the plan: here only because it's connected to something that is. */
const dependency = computed(() => props.node.external && !props.node.planId);

const iconTone = computed(() =>
  flagged.value ? 'text-amber-600 dark:text-amber-400' : ENTITY_COLORS[entity.value].text
);

const statusTone = computed(
  () =>
    ({
      idea: 'text-muted-foreground',
      drafting: 'text-amber-700 dark:text-amber-400',
      built: 'text-foreground',
      tested: 'text-blue-700 dark:text-blue-400',
      ready: 'text-green-700 dark:text-green-400',
    })[props.node.status]
);

/**
 * The small line under the name: why it's flagged, which projects a borrowed node is in, or
 * when a planned schedule should run.
 */
const subline = computed(() => {
  const n = props.node;
  if (n.hidden) return t('projectMap.node.hiddenHint');
  if (flagged.value) return t('projectMap.node.differences', { count: n.differences }, n.differences);
  if (n.missing) return t('projectMap.node.missingGlobal');
  if (n.external && n.projects.length) return n.projects.map((p) => p.name).join(', ');
  if (n.external) return t('projectMap.node.noProject');
  if (n.planned && n.kind === 'schedule' && n.when) return n.when;
  return '';
});

/** A workflow the viewer may not see: a locked card, no name. */
const title = computed(() => (props.node.hidden ? t('projectMap.node.hidden') : props.node.name));
</script>

<template>
  <div
    class="map-card relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground shadow-xs transition-[opacity,box-shadow]"
    :class="[
      tone,
      node.kind === 'global' ? 'rounded-full' : '',
      node.hidden ? 'border-dashed !bg-muted' : '',
      selected ? 'ring-3 ring-primary/40' : '',
      dimmed ? 'opacity-40' : node.external ? 'opacity-80' : '',
    ]"
    :style="{ width: `${MAP_NODE_W}px`, height: `${MAP_NODE_H}px` }"
  >
    <Handle
      type="target"
      :position="Position.Left"
      :connectable="editable"
      class="map-handle"
      :class="editable ? '' : 'map-handle--hidden'"
    />
    <TriangleAlert v-if="flagged" class="size-5 shrink-0" :class="iconTone" />
    <component :is="icon" v-else class="size-5 shrink-0" :class="iconTone" />
    <div class="min-w-0 leading-tight">
      <div class="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {{ kindLabel }}
        <template v-if="editable && !flagged && !node.hidden">
          · <span :class="statusTone" :title="t(`projectMap.statusWhy.${node.statusWhy}`)">{{ t(`projectMap.status.${node.status}`) }}</span>
        </template>
      </div>
      <div
        class="line-clamp-2 font-semibold break-words"
        :class="[node.kind === 'global' ? 'font-mono text-[13px] font-medium' : '', node.hidden ? 'text-muted-foreground' : '']"
        :title="title"
      >
        {{ title }}
      </div>
      <div v-if="subline" class="truncate text-[11px] text-muted-foreground">{{ subline }}</div>
    </div>
    <span
      v-if="dependency"
      class="absolute -top-2 -left-2 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground"
      :title="t('projectMap.node.dependency')"
      :aria-label="t('projectMap.node.dependency')"
    >
      <CornerDownRight class="size-3" />
    </span>
    <span
      v-if="node.note"
      class="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
      :title="node.note"
      :aria-label="t('projectMap.notes.hasNote')"
    >
      <StickyNote class="size-3" />
    </span>
    <Handle
      type="source"
      :position="Position.Right"
      :connectable="editable"
      class="map-handle"
      :class="editable ? '' : 'map-handle--hidden'"
      :title="t('projectMap.connectHint')"
    />
  </div>
</template>
