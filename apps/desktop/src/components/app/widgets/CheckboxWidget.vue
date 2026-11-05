<script setup lang="ts">
import AppField from './AppField.vue';

// Standalone on/off value — a switch, or a tick box with `display: checkbox`. Its value
// is `<componentId>.value` (true/false).
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();

function update(value: unknown) {
  emit('state', { value });
  emit('event', 'change', { value });
}
</script>

<template>
  <div class="h-full overflow-auto px-(--app-pad) py-2 flex items-center">
    <AppField
      :id="`app-${componentId}`"
      type="checkbox"
      :label="props.props.label"
      :description="props.props.description"
      :display="props.props.display === 'checkbox' ? 'checkbox' : 'switch'"
      :model-value="state?.value === true"
      :editable="editable"
      @update:model-value="update"
    />
  </div>
</template>
