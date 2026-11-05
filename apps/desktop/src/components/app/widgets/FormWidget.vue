<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import AppField from './AppField.vue';
import RunStatusLine from '../RunStatusLine.vue';
import type { RunStatus } from '@/composables/useAppRuntime';
import { formFields, validateForm, type FormErrors } from '@/utils/appForm';

// A set of fields with Submit (and optional Reset). Values live in the runtime as
// `<formId>.values` (updated on every edit); Submit validates first and only fires
// the `submit` event when every required field is filled and numbers are numbers.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
  /** The workflow run Submit started, shown in the footer. */
  run?: RunStatus | null;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
  reset: [];
}>();
const { t } = useI18n();

// Written out, or bound to data (the page has resolved it): only valid fields are drawn.
const fields = computed<any[]>(() => formFields(props.props.fields));
const values = computed<Record<string, unknown>>(
  () => props.state?.values ?? {}
);
const errors = computed<FormErrors>(() => props.state?.errors ?? {});

function update(name: string, value: unknown) {
  const nextErrors = { ...errors.value };
  delete nextErrors[name];
  emit('state', {
    values: { ...values.value, [name]: value },
    errors: nextErrors,
  });
}

function submit() {
  if (props.editable || props.busy) return;
  const found = validateForm(fields.value, values.value);
  emit('state', { errors: found });
  if (Object.keys(found).length === 0)
    emit('event', 'submit', { values: values.value });
}
</script>

<template>
  <form
    class="h-full flex flex-col overflow-hidden"
    novalidate
    @submit.prevent="submit"
  >
    <div class="flex-1 overflow-auto p-(--app-pad) flex flex-col gap-4">
      <p v-if="props.props.title" class="text-base font-semibold m-0">
        {{ props.props.title }}
      </p>
      <p v-if="!fields.length" class="text-xs text-muted-foreground m-0">
        {{ t('apps.form.noFields') }}
      </p>
      <AppField
        v-for="field in fields"
        :id="`app-${componentId}-${field.name}`"
        :key="field.name"
        :type="field.type ?? 'text'"
        :label="field.label ?? field.name"
        :placeholder="field.placeholder"
        :description="field.description"
        :required="field.required"
        :options="field.options"
        :display="field.display"
        :currency="field.currency"
        :language="field.language"
        :format="field.format"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :range="field.range"
        :unit="field.unit"
        :alpha="field.alpha"
        :swatches="field.swatches"
        :model-value="editable ? field.default : values[field.name]"
        :error="
          errors[field.name]
            ? t(`apps.field.errors.${errors[field.name]}`)
            : null
        "
        :editable="editable"
        @update:model-value="(v) => update(field.name, v)"
      />
    </div>
    <div
      class="flex items-center justify-end gap-2 border-t px-(--app-pad) py-2.5 shrink-0"
    >
      <RunStatusLine
        v-if="!editable"
        :run="run"
        class="flex-1 mr-auto"
      />
      <Button
        v-if="props.props.resetLabel"
        type="button"
        variant="ghost"
        size="sm"
        :disabled="editable || busy"
        @click="emit('reset')"
      >
        {{ props.props.resetLabel }}
      </Button>
      <Button type="submit" size="sm" :disabled="editable || busy">
        <Loader2 v-if="busy" class="size-4 animate-spin" />
        {{ props.props.submitLabel || t('apps.form.submit') }}
      </Button>
    </div>
  </form>
</template>
