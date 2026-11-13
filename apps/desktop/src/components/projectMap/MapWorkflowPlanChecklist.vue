<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CircleCheck, CircleDashed, PencilRuler } from 'lucide-vue-next';
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
  lines: { text: string; ok: boolean }[];
  /** The workflow builder. */
  builderTo: string;
}>();

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
      })),
    },
    {
      key: 'outputs',
      title: t('projectMap.details.plannedOutputs'),
      items: props.plannedOutputs.map((name) => ({
        text: name,
        ok: props.outputs.includes(name),
        mono: true,
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
