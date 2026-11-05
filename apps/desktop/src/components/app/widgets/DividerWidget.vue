<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { cn } from '@/lib/utils';
import { BADGE_HEX, BADGE_COLORS, type BadgeColor } from '@/utils/appBadge';
import { isShown } from './visibility';

// A line between parts of a page — across (default) or up and down — with an optional
// label in it ("Billing", "Advanced"). `lineStyle: none` makes it a spacer: empty room,
// drawn only in the builder (a faint outline, so it can be found and moved).
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const { t } = useI18n();

const visible = computed(() => isShown(props.props.visible, props.editable));
const vertical = computed(() => props.props.orientation === 'vertical');
const spacer = computed(() => props.props.lineStyle === 'none');
const style = computed(() => (['dashed', 'dotted'].includes(props.props.lineStyle) ? props.props.lineStyle : 'solid'));
const thickness = computed(() => {
  const n = Number(props.props.thickness);
  return Number.isFinite(n) ? Math.min(8, Math.max(1, Math.round(n))) : 1;
});
const color = computed(() =>
  (BADGE_COLORS as readonly string[]).includes(props.props.color) ? BADGE_HEX[props.props.color as BadgeColor] : 'var(--border)'
);
const label = computed(() => (typeof props.props.label === 'string' ? props.props.label.trim() : ''));
const align = computed(() => (['start', 'end'].includes(props.props.align) ? props.props.align : 'center'));

// One line segment: as long as it can be, in the line's style.
// (Width, style and color set one by one: a shorthand with var() isn't read the same everywhere.)
const line = computed(() => {
  const side = vertical.value ? 'borderLeft' : 'borderTop';
  return { [`${side}Width`]: `${thickness.value}px`, [`${side}Style`]: style.value, [`${side}Color`]: color.value };
});
</script>

<template>
  <div v-if="!visible" class="app-widget-hidden" />
  <!-- spacer: nothing at run time; in the builder a faint outline to find it by -->
  <div
    v-else-if="spacer"
    :class="cn('h-full w-full', editable && 'rounded border border-dashed border-muted-foreground/30 flex items-center justify-center')"
    data-testid="spacer"
  >
    <span v-if="editable" class="text-[11px] text-muted-foreground/70">{{ t('apps.divider.spacer') }}</span>
  </div>
  <div
    v-else
    :class="cn('h-full w-full flex items-center', vertical ? 'flex-col justify-center py-(--app-pad)' : 'px-(--app-pad)')"
    role="separator"
    :aria-orientation="vertical ? 'vertical' : 'horizontal'"
    :aria-label="label || undefined"
    data-testid="divider"
  >
    <span v-if="!label || align !== 'start'" :class="vertical ? 'flex-1 min-h-2' : 'flex-1 min-w-2'" :style="line" />
    <span
      v-if="label"
      :class="
        cn(
          'shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap',
          vertical ? 'py-2 [writing-mode:vertical-rl] rotate-180' : 'px-3',
          align === 'start' && (vertical ? 'pt-0' : 'pl-0'),
          align === 'end' && (vertical ? 'pb-0' : 'pr-0')
        )
      "
      data-testid="divider-label"
    >{{ label }}</span>
    <span v-if="label && align !== 'end'" :class="vertical ? 'flex-1 min-h-2' : 'flex-1 min-w-2'" :style="line" />
  </div>
</template>
