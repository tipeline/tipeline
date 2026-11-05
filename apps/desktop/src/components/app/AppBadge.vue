<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';
import { badgeColor, badgeValues, type BadgeColor } from '@/utils/appBadge';

// Colored pills for a status (or several, for a list of tags) — used by the Badge
// component, table columns and Details fields with `format: badge`.
const props = defineProps<{
  value: unknown;
  colors?: Record<string, unknown> | null;
  defaultColor?: unknown;
  size?: 'sm' | 'md';
}>();

const STYLES: Record<BadgeColor, string> = {
  gray: 'bg-muted text-muted-foreground border-border',
  blue: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300',
  green: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-800 border-amber-500/40 dark:text-amber-300',
  red: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300',
  purple: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300',
};

const badges = computed(() =>
  badgeValues(props.value).map((text) => ({ text, color: badgeColor(text, props.colors, props.defaultColor) }))
);
</script>

<template>
  <span v-if="badges.length" class="inline-flex flex-wrap gap-1 align-middle">
    <span
      v-for="(b, i) in badges"
      :key="i"
      :data-color="b.color"
      :class="
        cn(
          'inline-flex items-center rounded-full border font-medium whitespace-nowrap',
          size === 'md' ? 'px-2.5 py-0.5 text-sm' : 'px-2 py-px text-xs',
          STYLES[b.color]
        )
      "
    >
      {{ b.text }}
    </span>
  </span>
</template>
