<script setup lang="ts">
import type { FieldProps } from './interface';
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { computed, ref } from 'vue';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { useColorMode } from '@vueuse/core';
import { useFormValues } from 'vee-validate';
import { Loader2, Play } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useLastRunVariables } from '@/composables/useLastRunVariables';
import AutoFormLabel from './AutoFormLabel.vue';
import AutoFormCodeMirrorEditor from './AutoFormCodeMirrorEditor.vue';
import ScriptPreviewOutput, { type ScriptPreviewResult } from './ScriptPreviewOutput.vue';
import { beautifyObjectName } from './utils';

const props = defineProps<FieldProps>();

const colorMode = useColorMode();
const extensions = computed(() => [
  props.config?.language === 'sql' ? sql() : javascript(),
  EditorView.lineWrapping,
  ...(colorMode.value === 'dark' ? [oneDark] : []),
]);

// ---- script preview (fields with `scriptPreview`, i.e. script.runScript's code)
// Runs on the Run button only — never per keystroke — in core's script sandbox,
// with the step's `context` resolved against the last run's variable values.
const scriptPreview = computed(() => !!props.config?.scriptPreview);
const formValues = useFormValues();
const lastRun = useLastRunVariables();
const tab = ref<'code' | 'preview'>('code');
const running = ref(false);
const output = ref<ScriptPreviewResult | null>(null);

const rawContext = computed(() => {
  const ctx = (formValues.value as any)?.context;
  return ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : {};
});

// Context keys whose expressions name a workflow variable that only has a
// sample value. Globals aren't checked: core reads their current values.
const sampleKeys = computed(() => {
  const names = [...lastRun.sampleNames.value].filter((n) => !n.startsWith('_global.'));
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(rawContext.value)) {
    const expressions = (JSON.stringify(value) ?? '').match(/\{\{.*?\}\}|\{%.*?%\}|\{=.*?=\}/g) ?? [];
    const text = expressions.join(' ');
    const used = names.some((n) => {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\w.])${escaped}\\b`).test(text);
    });
    if (used) keys.add(key);
  }
  return keys;
});

async function run() {
  if (running.value) return;
  tab.value = 'preview';
  running.value = true;
  try {
    await lastRun.load();
    const variables = Object.fromEntries(
      Object.entries(lastRun.values.value).filter(([name]) => !name.startsWith('_global.'))
    );
    // JSON round-trip: form values are reactive proxies, which IPC can't clone.
    const payload = JSON.parse(
      JSON.stringify({
        code: (formValues.value as any)?.[props.fieldName] ?? '',
        context: rawContext.value,
        variables,
      })
    );
    output.value = await invokeCore<ScriptPreviewResult>(SEND.SCRIPT_PREVIEW, payload);
  } catch (error: any) {
    output.value = {
      ok: false,
      hasResult: false,
      error: error?.message ?? String(error),
      logs: [],
      context: {},
      durationMs: 0,
    };
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <FormField v-slot="slotProps" :name="fieldName">
    <FormItem v-bind="$attrs">
      <AutoFormLabel v-if="!config?.hideLabel" :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <FormControl>
        <AutoFormCodeMirrorEditor
          v-if="scriptPreview"
          v-model:tab="tab"
          :model-value="slotProps.componentField.modelValue"
          :extensions="extensions"
          :disabled="disabled"
          :label="config?.label || beautifyObjectName(label ?? fieldName)"
          previewable
          preview-tab-label="Output"
          @update:model-value="slotProps.componentField['onUpdate:modelValue']"
        >
          <template #actions>
            <Button
              v-if="tab === 'code'"
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Run script"
              :disabled="disabled || running"
              @click="run"
            >
              <Loader2 v-if="running" class="h-4 w-4 animate-spin" />
              <Play v-else class="h-4 w-4" />
              <span class="sr-only">Run script</span>
            </Button>
          </template>
          <template #preview>
            <ScriptPreviewOutput
              :output="output"
              :running="running"
              :label="lastRun.label.value"
              :sample-keys="sampleKeys"
              :disabled="disabled"
              @run="run"
            />
          </template>
        </AutoFormCodeMirrorEditor>
        <AutoFormCodeMirrorEditor
          v-else
          :model-value="slotProps.componentField.modelValue"
          :extensions="extensions"
          :disabled="disabled"
          :label="config?.label || beautifyObjectName(label ?? fieldName)"
          @update:model-value="slotProps.componentField['onUpdate:modelValue']"
        />
      </FormControl>
      <FormDescription v-if="config?.description">
        {{ config.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
