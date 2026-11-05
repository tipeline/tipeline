<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { CircleAlert, TriangleAlert } from 'lucide-vue-next';
import type { AppProblem } from '@/utils/appProblems';

// The problems list's entries for one field, event or runnable, shown right where they
// are — same wording as the list.
defineProps<{ problems: AppProblem[] }>();
const { t } = useI18n();
</script>

<template>
  <ul v-if="problems.length" class="flex flex-col gap-1 m-0 p-0 list-none">
    <li
      v-for="(p, i) in problems"
      :key="i"
      class="flex gap-1.5 text-xs leading-4"
      :class="p.severity === 'error' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'"
    >
      <component :is="p.severity === 'error' ? CircleAlert : TriangleAlert" class="size-3.5 shrink-0 mt-px" />
      <span class="min-w-0 break-words">{{ t(`builder.problems.codes.${p.code}`, p.params) }}</span>
    </li>
  </ul>
</template>
