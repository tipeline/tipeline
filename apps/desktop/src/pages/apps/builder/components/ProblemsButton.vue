<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CircleAlert,
  CircleCheck,
  RefreshCw,
  TriangleAlert,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { AppProblem } from '@/utils/appProblems';

// Toolbar badge with the app's problems; clicking one asks the builder to show it.
const props = defineProps<{
  problems: AppProblem[];
  pageNames: Record<string, string>;
}>();
const emit = defineEmits<{ select: [problem: AppProblem]; refresh: [] }>();
const { t } = useI18n();

const errors = computed(
  () => props.problems.filter((p) => p.severity === 'error').length
);
const warnings = computed(() => props.problems.length - errors.value);

function location(p: AppProblem): string {
  return [
    p.pageId ? (props.pageNames[p.pageId] ?? p.pageId) : null,
    p.componentId ?? p.runnable,
    p.prop ?? p.event,
  ]
    .filter(Boolean)
    .join(' › ');
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        size="sm"
        variant="ghost"
        class="h-8 gap-1.5"
        :title="t('builder.problems.title')"
      >
        <template v-if="problems.length">
          <span v-if="errors" class="flex items-center gap-1 text-destructive"
            ><CircleAlert class="size-4" />{{ errors }}</span
          >
          <span
            v-if="warnings"
            class="flex items-center gap-1 text-amber-600 dark:text-amber-400"
            ><TriangleAlert class="size-4" />{{ warnings }}</span
          >
        </template>
        <CircleCheck v-else class="size-4 text-green-600" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-96 p-0">
      <div class="flex items-center justify-between border-b px-3 py-2">
        <span class="text-sm font-medium">{{
          t('builder.problems.title')
        }}</span>
        <Button
          size="icon"
          variant="ghost"
          class="h-6 w-6"
          :title="t('builder.problems.recheck')"
          @click="emit('refresh')"
        >
          <RefreshCw class="size-3.5" />
        </Button>
      </div>
      <p
        v-if="!problems.length"
        class="text-sm text-muted-foreground px-3 py-4 m-0"
      >
        {{ t('builder.problems.none') }}
      </p>
      <div v-else class="max-h-96 overflow-auto py-1">
        <button
          v-for="(p, i) in problems"
          :key="i"
          class="w-full text-left flex gap-2 px-3 py-2 hover:bg-accent"
          @click="emit('select', p)"
        >
          <component
            :is="p.severity === 'error' ? CircleAlert : TriangleAlert"
            class="size-4 shrink-0 mt-0.5"
            :class="
              p.severity === 'error'
                ? 'text-destructive'
                : 'text-amber-600 dark:text-amber-400'
            "
          />
          <span class="min-w-0">
            <span class="block text-xs">{{
              t(`builder.problems.codes.${p.code}`, p.params)
            }}</span>
            <span
              v-if="location(p)"
              class="block text-[11px] text-muted-foreground font-mono truncate"
              >{{ location(p) }}</span
            >
          </span>
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
