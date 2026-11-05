<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { cn } from '@/lib/utils';
import { BADGE_COLORS, type BadgeColor } from '@/utils/appBadge';
import { highlightColor } from '@/utils/appHighlight';
import { progressOf } from '@/utils/appProgress';

// A value out of a maximum, as a bar or a ring — a quota, a step count, a score.
// `colorRules` (as a table column's highlight rules) are checked against the
// percentage, which goes past 100 over max (the bar just stays full), so { when: ">=", value: 90, color: red } turns it red near the top.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const { t, locale } = useI18n();

const p = computed(() => progressOf(props.props.value, props.props.max));
const circle = computed(() => props.props.display === 'circle');

const color = computed<BadgeColor | 'primary'>(() => {
  if (p.value.percent !== null) {
    const hit = highlightColor(p.value.percent, props.props.colorRules);
    if (hit) return hit;
  }
  return (BADGE_COLORS as readonly string[]).includes(props.props.color) ? props.props.color : 'primary';
});
// Literal classes per color (bar fill / ring stroke), so Tailwind finds them.
const FILL: Record<string, string> = {
  primary: 'bg-primary',
  gray: 'bg-muted-foreground/60',
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  purple: 'bg-violet-500',
};
const STROKE: Record<string, string> = {
  primary: 'stroke-primary',
  gray: 'stroke-muted-foreground/60',
  blue: 'stroke-blue-500',
  green: 'stroke-emerald-500',
  amber: 'stroke-amber-500',
  red: 'stroke-red-500',
  purple: 'stroke-violet-500',
};

const number = (n: number) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(n);
const text = computed(() => {
  const show = props.props.showValue ?? 'percent';
  if (show === 'none') return '';
  if (p.value.percent === null) return '—';
  return show === 'value'
    ? t('apps.progress.of', { value: number(p.value.value!), max: number(p.value.max) })
    : `${Math.round(p.value.percent)}%`;
});

// Loading (its workflow runs and there's no value yet): an indeterminate bar.
const waiting = computed(() => !props.editable && props.busy && p.value.percent === null);

// The ring: r = 42 in a 100×100 box.
const CIRCUMFERENCE = 2 * Math.PI * 42;
const dash = computed(() => CIRCUMFERENCE * (1 - p.value.fill / 100));
</script>

<template>
  <div
    class="h-full flex flex-col justify-center gap-1.5 p-(--app-pad) min-w-0"
    role="progressbar"
    :aria-label="props.props.label || undefined"
    aria-valuemin="0"
    :aria-valuemax="p.max"
    :aria-valuenow="p.value === null ? undefined : Math.min(p.value, p.max)"
    :data-color="color"
  >
    <template v-if="!circle">
      <div v-if="props.props.label || text" class="flex items-baseline gap-2 text-sm min-w-0 shrink-0">
        <span class="font-medium truncate">{{ props.props.label }}</span>
        <span class="ml-auto tabular-nums text-muted-foreground shrink-0" data-testid="progress-text">{{ text }}</span>
      </div>
      <!-- shrink-0: in a short cell the flex column would squeeze the bar away. -->
      <div class="relative h-2.5 w-full shrink-0 overflow-hidden rounded-full bg-muted">
        <div
          v-if="waiting"
          class="absolute inset-y-0 w-1/3 rounded-full bg-primary/60 animate-[app-progress-slide_1.2s_ease-in-out_infinite]"
        />
        <div
          v-else
          :class="cn('h-full rounded-full transition-[width] duration-500', FILL[color])"
          :style="{ width: `${p.fill}%` }"
          data-testid="progress-fill"
        />
      </div>
    </template>

    <div v-else class="flex-1 min-h-0 flex flex-col items-center justify-center gap-1">
      <div class="relative h-full max-h-40 aspect-square min-h-12 [container-type:size]">
        <svg viewBox="0 0 100 100" class="size-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke-width="9" class="stroke-muted" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke-width="9"
            stroke-linecap="round"
            :class="cn('transition-[stroke-dashoffset] duration-500', STROKE[color], waiting && 'animate-pulse')"
            :stroke-dasharray="CIRCUMFERENCE"
            :stroke-dashoffset="dash"
            data-testid="progress-ring"
          />
        </svg>
        <span
          class="absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-[clamp(0.7rem,20cqmin,1.75rem)]"
          data-testid="progress-text"
        >
          {{ text }}
        </span>
      </div>
      <span v-if="props.props.label" class="text-sm font-medium truncate max-w-full">{{ props.props.label }}</span>
    </div>

    <p v-if="props.props.description" class="m-0 text-xs text-muted-foreground truncate shrink-0">{{ props.props.description }}</p>
  </div>
</template>

<!-- Not scoped: Vue renames keyframes in scoped styles, and the class names this one. -->
<style>
@keyframes app-progress-slide {
  from {
    left: -33%;
  }
  to {
    left: 100%;
  }
}
</style>
