<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { Braces, Maximize2 } from 'lucide-vue-next';
import { Codemirror } from 'vue-codemirror';
import type { Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { useColorMode } from '@vueuse/core';
import ExpandedEditorDialog from '@/components/ExpandedEditorDialog.vue';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Code typed or pasted by the person using an app (Input / form field type `code`):
// highlighted for `language`, with line numbers, Tab to indent and a full-screen
// editor. The value is the plain text. `fill`: as tall as its box (a standalone
// input); otherwise between `minLines` and `maxLines` (a form field).
const props = withDefaults(
  defineProps<{
    id: string;
    modelValue: unknown;
    language?: string;
    placeholder?: string;
    editable?: boolean;
    fill?: boolean;
    minLines?: number;
    maxLines?: number;
    /** The full-screen editor's title. */
    label?: string;
    /** The full-screen editor shows a live preview (the `preview` slot, given the text). */
    previewable?: boolean;
    /**
     * A Code | Preview switch (and a preview in the full-screen editor) showing
     * `previewHtml` — HTML made by someone else, e.g. a workflow run on `preview`.
     */
    preview?: boolean;
    previewHtml?: string | null;
    /** Names the { } menu inserts at the cursor, as `{{ name }}`. */
    variables?: string[];
  }>(),
  { minLines: 4, maxLines: 12 }
);
const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [];
  /** The preview is shown for this text (asked when it opens, and again after edits while it shows). */
  preview: [text: string];
}>();
const { t } = useI18n();
const colorMode = useColorMode();

const text = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : props.modelValue == null ? '' : String(props.modelValue)));

const LANGUAGES: Record<string, () => Extension> = {
  json: () => json(),
  javascript: () => javascript(),
  sql: () => sql(),
  python: () => python(),
  yaml: () => yaml(),
  html: () => html(),
  css: () => css(),
  markdown: () => markdown(),
};

const lineHeight = 19;
const extensionsFor = (fill: boolean) => [
  ...(LANGUAGES[props.language ?? ''] ? [LANGUAGES[props.language!]()] : []),
  lineNumbers(),
  EditorView.lineWrapping,
  EditorView.editable.of(!props.editable),
  EditorView.theme({
    '&': { fontSize: '12.5px', height: fill ? '100%' : 'auto' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      lineHeight: `${lineHeight}px`,
      overflow: 'auto',
      ...(fill
        ? {}
        : { minHeight: `${props.minLines * lineHeight + 8}px`, maxHeight: `${props.maxLines * lineHeight + 8}px` }),
    },
    '.cm-gutters': { border: 'none', background: 'transparent', color: 'var(--muted-foreground)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
  }),
  ...(colorMode.value === 'dark' ? [oneDark] : []),
];
const extensions = computed(() => extensionsFor(!!props.fill));
const bigExtensions = computed(() => extensionsFor(true));

// Full screen: edits a draft, kept when the dialog closes.
const expanded = ref(false);
const draft = ref('');
function expand() {
  draft.value = text.value;
  previewText.value = text.value;
  expanded.value = true;
}
// The preview follows the text a moment after typing stops (a running preview reloads on
// each change).
const previewText = ref('');
let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch(draft, (value) => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => (previewText.value = value), 400);
});
onBeforeUnmount(() => clearTimeout(previewTimer));
function onExpanded(open: boolean) {
  expanded.value = open;
  if (!open && draft.value !== text.value) emit('update:modelValue', draft.value);
  if (open && props.preview) emit('preview', draft.value);
}

// ---- Code | Preview: the preview's HTML comes from outside (a workflow), asked for with
// `preview` when it opens (in full screen: again once typing stops).
const tab = ref<'code' | 'preview'>('code');
function showTab(next: 'code' | 'preview') {
  tab.value = next;
  if (next === 'preview') emit('preview', text.value);
}
// In full screen the text is a draft; with a preview it's kept as it's typed, so what's
// previewed (and the input's value) follows the editor.
watch(previewText, (value) => {
  if (!props.preview || !expanded.value) return;
  if (value !== text.value) emit('update:modelValue', value);
  emit('preview', value);
});
const previewDoc = computed(() => props.previewHtml ?? '');

// ---- { }: insert a variable at the cursor of whichever editor is showing.
const views: { main: EditorView | null; big: EditorView | null } = { main: null, big: null };
function insertVariable(name: string) {
  const view = expanded.value ? views.big : views.main;
  if (!view) return;
  const token = `{{ ${name} }}`;
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: token }, selection: { anchor: from + token.length } });
  view.focus();
}
const onMainReady = (payload: { view: EditorView }) => (views.main = payload.view);
const onBigReady = (payload: { view: EditorView }) => (views.big = payload.view);
const hasVariables = computed(() => (props.variables ?? []).length > 0 && !props.editable);
</script>

<template>
  <div
    :id="id"
    :class="cn('relative rounded-md border bg-background overflow-hidden focus-within:ring-[3px] focus-within:ring-ring/50', fill && 'flex-1 min-h-0', (preview || hasVariables) && 'flex flex-col')"
    data-testid="code-editor"
    :data-language="language || 'text'"
  >
    <!-- With a preview or variables: a bar with Code | Preview, { } and full screen -->
    <div v-if="preview || hasVariables" class="flex items-center gap-1 border-b px-1.5 py-1 bg-muted/30">
      <div v-if="preview" class="inline-flex rounded-md border overflow-hidden text-xs" role="tablist">
        <button
          v-for="id in (['code', 'preview'] as const)"
          :key="id"
          type="button"
          role="tab"
          :aria-selected="tab === id"
          :class="cn('px-2.5 py-0.5', tab === id ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground')"
          @click="showTab(id)"
        >
          {{ id === 'code' ? t('apps.field.codeTab') : t('apps.field.previewTab') }}
        </button>
      </div>
      <span class="flex-1" />
      <DropdownMenu v-if="hasVariables && tab === 'code'">
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            :title="t('apps.field.insertVariable')"
            :aria-label="t('apps.field.insertVariable')"
          >
            <Braces class="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="max-h-72 overflow-y-auto">
          <DropdownMenuItem
            v-for="name in variables"
            :key="name"
            class="cursor-pointer font-mono text-xs"
            @click="insertVariable(name)"
          >
            {{ name }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        v-if="!editable"
        type="button"
        class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
        :title="t('apps.field.expandCode')"
        :aria-label="t('apps.field.expandCode')"
        @click="expand"
      >
        <Maximize2 class="size-3.5" />
      </button>
    </div>
    <iframe
      v-if="preview && tab === 'preview'"
      :srcdoc="previewDoc"
      sandbox=""
      :title="t('apps.field.previewTab')"
      class="block w-full bg-white"
      :class="fill ? 'flex-1 min-h-0 h-full' : 'h-80'"
      data-testid="code-preview"
    />
    <Codemirror
      v-show="!(preview && tab === 'preview')"
      :model-value="text"
      :placeholder="placeholder"
      :extensions="extensions"
      :indent-with-tab="true"
      :tab-size="2"
      :style="fill ? { height: '100%' } : undefined"
      :class="(preview || hasVariables) && fill ? 'flex-1 min-h-0' : undefined"
      @update:model-value="(v: string) => emit('update:modelValue', v)"
      @blur="emit('blur')"
      @ready="onMainReady"
    />
    <button
      v-if="!editable && !(preview || hasVariables)"
      type="button"
      class="absolute right-1.5 top-1.5 z-10 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent bg-background/80"
      :title="t('apps.field.expandCode')"
      :aria-label="t('apps.field.expandCode')"
      @click="expand"
    >
      <Maximize2 class="size-3.5" />
    </button>

    <ExpandedEditorDialog
      :open="expanded"
      :title="label || t('apps.field.code')"
      :previewable="previewable || preview"
      @update:open="onExpanded"
    >
      <template #editor>
        <div class="h-full flex flex-col gap-1.5 min-h-0">
          <div v-if="hasVariables" class="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                  :title="t('apps.field.insertVariable')"
                >
                  <Braces class="size-3.5" /> {{ t('apps.field.insertVariable') }}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="max-h-72 overflow-y-auto">
                <DropdownMenuItem
                  v-for="name in variables"
                  :key="name"
                  class="cursor-pointer font-mono text-xs"
                  @click="insertVariable(name)"
                >
                  {{ name }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Codemirror
            v-model="draft"
            :extensions="bigExtensions"
            :indent-with-tab="true"
            :tab-size="2"
            class="flex-1 min-h-0 border rounded-md overflow-hidden"
            :style="{ height: '100%' }"
            @ready="onBigReady"
          />
        </div>
      </template>
      <template v-if="preview" #preview>
        <iframe :srcdoc="previewDoc" sandbox="" :title="t('apps.field.previewTab')" class="w-full h-full bg-white border-0" />
      </template>
      <template v-else-if="previewable" #preview>
        <slot name="preview" :text="previewText" />
      </template>
    </ExpandedEditorDialog>
  </div>
</template>
