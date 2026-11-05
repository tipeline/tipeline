<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import { computed } from 'vue';
import AppBadge from '../AppBadge.vue';
import { badgeValues } from '@/utils/appBadge';

// A status as a colored pill — or a list of them as tags — with an optional caption.
// Colors: `colors` per value, else `defaultColor`, else picked from the value (see
// appBadge: common status words get the expected color).
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();

// In the builder the value is usually a binding: show a sample pill instead of it.
const isBinding = computed(() => typeof props.props.value === 'string' && /\{[{=%]/.test(props.props.value));
const empty = computed(() => !isBinding.value && badgeValues(props.props.value).length === 0);
</script>

<template>
  <div class="h-full flex flex-col justify-center gap-1 px-(--app-pad) py-2 min-w-0">
    <p v-if="props.props.label" class="m-0 text-xs text-muted-foreground uppercase tracking-wide truncate">
      {{ props.props.label }}
    </p>
    <span v-if="editable && isBinding" class="text-xs font-mono text-muted-foreground truncate" :title="props.props.value">
      {{ props.props.value }}
    </span>
    <Skeleton v-else-if="empty && busy" class="h-5 w-16 rounded-full" data-testid="app-skeleton" />
    <span v-else-if="empty" class="text-sm text-muted-foreground">—</span>
    <AppBadge
      v-else
      :value="props.props.value"
      :colors="props.props.colors"
      :default-color="props.props.defaultColor"
      :size="props.props.size === 'md' ? 'md' : 'sm'"
    />
  </div>
</template>
