<script setup lang="ts">
import { computed } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { useIcon } from '@/composables/useIcon';

const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
}>();

const { getIconComponent } = useIcon();
// A Lucide icon by name (e.g. Download); an unknown name shows none.
const icon = computed(() => (props.props.icon ? getIconComponent(String(props.props.icon)) : null));

const disabled = computed(
  () => props.props.disabled === true || props.props.disabled === 'true'
);
</script>

<template>
  <div class="h-full flex items-center px-(--app-pad) py-2">
    <Button
      class="w-full"
      :variant="props.props.variant ?? 'default'"
      :disabled="!editable && (disabled || busy)"
      @click="!editable && emit('event', 'click')"
    >
      <Loader2 v-if="busy" class="size-4 animate-spin" />
      <component :is="icon" v-else-if="icon" class="size-4" data-testid="button-icon" />
      {{ props.props.label ?? '' }}
    </Button>
  </div>
</template>
