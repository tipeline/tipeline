<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppField from './AppField.vue';
import { chosenOptions, normalizeOptions, type AppOption } from '@/utils/appOptions';

// Standalone select (single or multiple). Options may be bound to workflow outputs.
// Its value is `<componentId>.value` and the options it stands for
// `<componentId>.selectedOptions` ({ label, value } each); it fires `change` on every
// edit.
//
// With `search: remote` typing fires `search` (state `search`) — its handler runs a
// workflow and `options` binds to what it returns. A search typed while one is still
// running (the runtime ignores a second trigger) is sent once it ends, so the last
// text typed is always the one searched.
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
const { t } = useI18n();

const known = computed<AppOption[]>(() => props.state?.selectedOptions ?? []);

// `error` is set when a stepper's Next finds this required input empty; editing clears it.
function update(value: unknown, chosen?: AppOption[]) {
  const selectedOptions = chosen ?? chosenOptions(value, normalizeOptions(props.props.options), known.value);
  emit('state', { value, selectedOptions, error: null });
  emit('event', 'change', { value });
}

// ---- remote search
let sent: string | null = null;
let waiting = false;

function send(text: string) {
  sent = text;
  waiting = false;
  emit('event', 'search', { search: text });
}

function onSearch(text: string) {
  emit('state', { search: text });
  if (props.busy) waiting = true;
  else send(text);
}

watch(
  () => props.busy,
  (busy) => {
    const latest = String(props.state?.search ?? '');
    if (!busy && waiting && latest !== sent) send(latest);
    else if (!busy) waiting = false;
  }
);
</script>

<template>
  <div class="h-full overflow-auto p-(--app-pad)">
    <AppField
      :id="`app-${componentId}`"
      :type="props.props.multiple ? 'multiselect' : 'select'"
      :label="props.props.label"
      :placeholder="props.props.placeholder"
      :description="props.props.description"
      :required="props.props.required"
      :error="state?.error ? t(`apps.field.errors.${state.error}`) : null"
      :options="props.props.options"
      :display="props.props.display"
      :search="props.props.search"
      :known="known"
      :busy="busy"
      :model-value="state?.value"
      :editable="editable"
      @update:model-value="update"
      @search="onSearch"
    />
  </div>
</template>
