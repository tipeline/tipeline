<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CircleCheck, CircleDashed, PencilRuler, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

/**
 * A built workflow next to its plan, the same as a built app: every planned input, output
 * and line, ticked when the workflow has it, amber when it doesn't, under a line saying
 * whether everything is there. Read-only: the workflow changes in its builder.
 */
const props = defineProps<{
  plannedInputs: string[];
  plannedOutputs: string[];
  inputs: string[];
  outputs: string[];
  /** Planned lines from it ("writes _global.total"), and whether the workflow has each. */
  lines: { text: string; ok: boolean; planEdgeId?: string }[];
  /** The workflow builder. */
  builderTo: string;
  /** Planned items the workflow doesn't have can be taken off the plan (never added). */
  editable?: boolean;
}>();

const emit = defineEmits<{
  (e: 'remove-field', which: 'inputs' | 'outputs', name: string): void;
  (e: 'remove-line', planEdgeId: string): void;
}>();

function remove(group: string, item: { text: string; planEdgeId?: string }) {
  if (group === 'lines') {
    if (item.planEdgeId) emit('remove-line', item.planEdgeId);
  } else emit('remove-field', group as 'inputs' | 'outputs', item.text);
}

const { t } = useI18n();
const router = useRouter();

const groups = computed(() =>
  [
    {
      key: 'inputs',
      title: t('projectMap.details.plannedInputs'),
      items: props.plannedInputs.map((name) => ({
        text: name,
        ok: props.inputs.includes(name),
        mono: true,
        planEdgeId: undefined as string | undefined,
      })),
    },
    {
      key: 'outputs',
      title: t('projectMap.details.plannedOutputs'),
      items: props.plannedOutputs.map((name) => ({
        text: name,
        ok: props.outputs.includes(name),
        mono: true,
        planEdgeId: undefined as string | undefined,
      })),
    },
    {
      key: 'lines',
      title: t('projectMap.contents.missingLines'),
      items: props.lines.map((l) => ({ ...l, mono: false })),
    },
  ].filter((g) => g.items.length)
);

const missingCount = computed(() =>
  groups.value.reduce((n, g) => n + g.items.filter((i) => !i.ok).length, 0)
);
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="text-xs font-semibold">
      {{ t('projectMap.details.planTitleWorkflow') }}
    </div>
    <p
      v-if="!missingCount"
      class="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <CircleCheck class="size-3.5 shrink-0 text-green-600" />
      {{ t('projectMap.details.allBuiltWorkflow') }}
    </p>
    <p v-else class="text-xs text-amber-700 dark:text-amber-400">
      {{
        t(
          'projectMap.details.notAllBuiltWorkflow',
          { count: missingCount },
          missingCount
        )
      }}
    </p>
    <div
      v-for="g in groups"
      :key="g.key"
      class="flex flex-col gap-1 rounded-lg border p-2.5 text-xs"
    >
      <div class="font-semibold">{{ g.title }}</div>
      <div
        v-for="item in g.items"
        :key="item.text"
        class="flex items-center gap-1.5"
      >
        <CircleCheck v-if="item.ok" class="size-3.5 shrink-0 text-green-600" />
        <CircleDashed v-else class="size-3.5 shrink-0 text-amber-600" />
        <span :class="item.mono ? 'font-mono' : ''">{{ item.text }}</span>
        <button
          v-if="editable && !item.ok && (g.key !== 'lines' || item.planEdgeId)"
          type="button"
          class="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
          :aria-label="t('projectMap.contents.removeFromPlan')"
          :title="t('projectMap.contents.removeFromPlan')"
          @click="remove(g.key, item)"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>
    <Button
      size="sm"
      variant="outline"
      class="self-start"
      @click="router.push(builderTo)"
    >
      <PencilRuler class="size-3.5" />
      {{ t('projectMap.details.openWorkflowBuilder') }}
    </Button>
  </div>
</template>
