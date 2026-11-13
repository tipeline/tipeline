<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CircleCheck, CircleDashed, PencilRuler } from 'lucide-vue-next';
import type { AppComponentRef, PlanPage } from '@tipeline/utils';
import { Button } from '@/components/ui/button';

/**
 * A built app next to its plan: every planned component and line, ticked when the app has
 * it, amber when it doesn't, under a line saying whether everything is there. Read-only:
 * the app changes in its builder.
 */
const props = defineProps<{
  pages: PlanPage[];
  /** The app's components. */
  built: AppComponentRef[];
  /** Planned lines from it ("runs Data: Alerts"), and whether the app has each. */
  lines: { text: string; ok: boolean }[];
  /** The workflow a planned component uses, by name (built or planned). */
  workflowName: (ref: string) => string | undefined;
  /** The app builder. */
  builderTo: string;
}>();

const { t } = useI18n();
const router = useRouter();

const loose = (text: string) => text.trim().toLocaleLowerCase();
const inApp = (page: string, name: string) =>
  props.built.some(
    (b) => loose(b.page) === loose(page) && loose(b.name) === loose(name)
  );

const missingCount = computed(
  () =>
    props.pages.reduce(
      (n, p) => n + p.components.filter((c) => !inApp(p.name, c.name)).length,
      0
    ) + props.lines.filter((l) => !l.ok).length
);
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="text-xs font-semibold">
      {{ t('projectMap.contents.planTitle') }}
    </div>
    <p
      v-if="!missingCount"
      class="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <CircleCheck class="size-3.5 shrink-0 text-green-600" />
      {{ t('projectMap.contents.allBuilt') }}
    </p>
    <p v-else class="text-xs text-amber-700 dark:text-amber-400">
      {{
        t(
          'projectMap.contents.notAllBuilt',
          { count: missingCount },
          missingCount
        )
      }}
    </p>
    <div
      v-for="page in pages"
      :key="page.id"
      class="flex flex-col gap-1 rounded-lg border p-2.5 text-xs"
    >
      <div class="font-semibold">{{ page.name }}</div>
      <div
        v-for="c in page.components"
        :key="c.id"
        class="flex items-start gap-1.5"
      >
        <CircleCheck
          v-if="inApp(page.name, c.name)"
          class="mt-0.5 size-3.5 shrink-0 text-green-600"
        />
        <CircleDashed v-else class="mt-0.5 size-3.5 shrink-0 text-amber-600" />
        <div class="min-w-0">
          <span class="font-medium">{{ c.name }}</span>
          <span class="text-muted-foreground">
            · {{ t(`builder.components.${c.type}`) }}</span
          >
          <div
            v-if="c.workflow && workflowName(c.workflow)"
            class="text-muted-foreground"
          >
            {{ workflowName(c.workflow) }}
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="lines.length"
      class="flex flex-col gap-1 rounded-lg border p-2.5 text-xs"
    >
      <div class="font-semibold">
        {{ t('projectMap.contents.missingLines') }}
      </div>
      <div
        v-for="line in lines"
        :key="line.text"
        class="flex items-center gap-1.5"
      >
        <CircleCheck v-if="line.ok" class="size-3.5 shrink-0 text-green-600" />
        <CircleDashed v-else class="size-3.5 shrink-0 text-amber-600" />
        <span>{{ line.text }}</span>
      </div>
    </div>
    <Button
      size="sm"
      variant="outline"
      class="self-start"
      @click="router.push(builderTo)"
    >
      <PencilRuler class="size-3.5" />
      {{ t('projectMap.contents.openBuilder') }}
    </Button>
  </div>
</template>
