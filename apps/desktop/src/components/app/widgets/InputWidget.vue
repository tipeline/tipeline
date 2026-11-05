<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppField from './AppField.vue';

// Standalone input — text, number, textarea, date, file, slider, color…. Its value is
// `<componentId>.value`; it fires `change` on every edit. A code input with `preview`
// also fires `preview` when its Preview opens (and after edits while it shows), so a
// workflow can make the HTML shown there (`previewHtml`).
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

// `error` is set when a stepper's Next finds this required input empty; editing clears it.
const fills = computed(() => props.props.inputType === 'code' || props.props.inputType === 'richtext');

// A slider's (or a color's) value follows the drag, but `change` fires once it's let
// go (or a key moved it, a swatch was picked): a runnable on change then runs once, not
// for every step on the way.
const settles = computed(() => props.props.inputType === 'slider' || props.props.inputType === 'color');

function update(value: unknown) {
  emit('state', { value, error: null });
  if (!settles.value) emit('event', 'change', { value });
}
function commit(value: unknown) {
  emit('event', 'change', { value });
}
</script>

<template>
  <!-- A code or rich text input fills its card; the others scroll inside it. -->
  <div :class="['h-full p-(--app-pad)', fills ? 'flex flex-col min-h-0' : 'overflow-auto']">
    <AppField
      :id="`app-${componentId}`"
      :type="props.props.inputType ?? 'text'"
      :currency="props.props.currency"
      :language="props.props.language"
      :format="props.props.format"
      :min="props.props.min"
      :max="props.props.max"
      :step="props.props.step"
      :range="props.props.range"
      :unit="props.props.unit"
      :alpha="props.props.alpha"
      :swatches="props.props.swatches"
      :preview="props.props.preview === true"
      :preview-html="typeof props.props.previewHtml === 'string' ? props.props.previewHtml : ''"
      :variables="Array.isArray(props.props.variables) ? props.props.variables.map(String) : []"
      :fill="fills"
      :label="props.props.label"
      :placeholder="props.props.placeholder"
      :description="props.props.description"
      :required="props.props.required"
      :error="state?.error ? t(`apps.field.errors.${state.error}`) : null"
      :model-value="editable ? props.props.default : state?.value"
      :editable="editable"
      @update:model-value="update"
      @commit="commit"
      @preview="(text: string) => emit('event', 'preview', { value: text })"
    />
  </div>
</template>
