<script setup lang="ts">
import type { FieldProps } from './interface';
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { computed, watch } from 'vue';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { useColorMode } from '@vueuse/core';
import { useFormValues } from 'vee-validate';
import { Liquid } from 'liquidjs';
import { useLastRunVariables } from '@/composables/useLastRunVariables';
import AutoFormLabel from './AutoFormLabel.vue';
import AutoFormCodeMirrorEditor from './AutoFormCodeMirrorEditor.vue';
import { beautifyObjectName } from './utils';
import { unknownVariableHighlighter, unknownVariableTheme } from '@/utils/codemirrorVariableHighlight';

const props = defineProps<FieldProps>();

const colorMode = useColorMode();
const formValues = useFormValues();
const lastRun = useLastRunVariables();
const taskVariables = lastRun.taskVariables;

const format = computed(() => (formValues.value as any)?.format ?? 'plain');

const extensions = computed(() => {
  const exts: any[] = [EditorView.lineWrapping, unknownVariableTheme];
  if (format.value === 'html') exts.push(html());
  else if (format.value === 'markdown') exts.push(markdown());
  else if (format.value === 'css') exts.push(css());
  if (colorMode.value === 'dark') exts.push(oneDark);
  if (taskVariables) {
    // Reading `.value` here makes this computed re-run — and rebuild the
    // plugin with a fresh Set — whenever the task's variable list changes,
    // not just when the doc itself changes.
    const names = new Set(taskVariables.value.map((v) => v.name));
    exts.push(unknownVariableHighlighter(() => names));
  }
  return exts;
});

// Same engine/config as apps/core's parseParams.ts, so `{{ }}`/`{% %}` behave
// identically here as they will when the task actually runs.
const liquid = new Liquid({ strictVariables: false });

function setPath(target: Record<string, any>, path: string, value: unknown) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Fetched once, the first time this field shows an HTML preview.
watch(
  format,
  (f) => {
    if (f === 'html') lastRun.load();
  },
  { immediate: true }
);

const previewContext = computed(() => {
  const context: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(lastRun.values.value)) setPath(context, name, value);
  return context;
});

const previewHtml = computed(() => {
  const content = (formValues.value as any)?.[props.fieldName] ?? '';
  try {
    return liquid.parseAndRenderSync(content, previewContext.value);
  } catch (e: any) {
    return `<pre style="white-space:pre-wrap;color:#b91c1c;font-family:ui-monospace,monospace;">Template error: ${escapeHtml(String(e?.message ?? e))}</pre>`;
  }
});

const previewLabel = lastRun.label;
</script>

<template>
  <FormField v-slot="slotProps" :name="fieldName">
    <FormItem v-bind="$attrs">
      <AutoFormLabel v-if="!config?.hideLabel" :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <FormControl>
        <AutoFormCodeMirrorEditor
          :model-value="slotProps.componentField.modelValue"
          height="300px"
          :extensions="extensions"
          :disabled="disabled"
          :label="config?.label || beautifyObjectName(label ?? fieldName)"
          allow-variable-insert
          :previewable="format === 'html'"
          :preview-html="previewHtml"
          :preview-label="previewLabel"
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
