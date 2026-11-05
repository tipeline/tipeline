<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Braces, Maximize2 } from 'lucide-vue-next';
import ExpandedEditorDialog from '@/components/ExpandedEditorDialog.vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from 'vue-i18n';
import { Codemirror } from 'vue-codemirror';
import { json as jsonLang } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { useColorMode } from '@vueuse/core';
import { cn } from '@/lib/utils';
import { expressionHighlighter } from '@/utils/codemirrorExpressions';
import type { ExpressionAnalyzer, ExpressionSuggestion } from '@/utils/expressionField';
import { jsonError } from '@/utils/jsonError';

// A compact JSON editor for structured values (table columns, chart series, action
// params…): syntax highlighting, the parse error shown at its position and spelled out
// below, and `{{ }}` / `{= =}` bindings inside strings marked the same way the binding
// fields mark them (pass that field's analyzer as `analyze`). Empty is valid. `commit`
// fires on blur — when to save. With `allowBinding` the whole value may instead be one
// binding (`{= runnables.x.outputs.rows =}`): data written in, or bound. With
// `expandLabel` an expand button opens it full screen (the draft commits on close).
// With `allowBinding` and `suggestions`, the `{}` button picks what to bind to and sets
// the value to that one binding (`{= path =}`, as an undoable edit).
const props = withDefaults(
  defineProps<{
    modelValue: string;
    analyze?: ExpressionAnalyzer;
    placeholder?: string;
    /** Height in lines before it scrolls. */
    minLines?: number;
    maxLines?: number;
    /** Show the parse error below the editor (off when the caller words it itself). */
    showError?: boolean;
    /** The whole value may be a single binding instead of JSON. */
    allowBinding?: boolean;
    /** Title of the full-screen editor; shows the expand button when set. */
    expandLabel?: string;
    /** Fill the parent's height (the full-screen editor). */
    fill?: boolean;
    /** What a binding can refer to: with `allowBinding`, shows the `{}` insert menu. */
    suggestions?: ExpressionSuggestion[];
  }>(),
  {
    analyze: undefined,
    placeholder: '',
    minLines: 3,
    maxLines: 14,
    showError: true,
    allowBinding: false,
    expandLabel: '',
    fill: false,
    suggestions: undefined,
  }
);
const emit = defineEmits<{
  'update:modelValue': [value: string];
  commit: [value: string];
}>();

const { t } = useI18n();
const colorMode = useColorMode();

const text = ref(props.modelValue ?? '');
watch(
  () => props.modelValue,
  (v) => {
    if ((v ?? '') !== text.value) text.value = v ?? '';
  }
);

/** One `{= … =}` or `{{ … }}` and nothing else. */
const WHOLE_BINDING = /^\s*(\{=[\s\S]*=\}|\{\{[\s\S]*\}\})\s*$/;
const isBinding = (value: string) => props.allowBinding && WHOLE_BINDING.test(value);
const errorOf = (value: string) => (isBinding(value) ? null : jsonError(value));

const parseError = computed(() => errorOf(text.value));

// The editor's marks: the bindings, plus the spot where the JSON stops parsing.
function marks(value: string) {
  const refs = props.analyze ? props.analyze(value) : [];
  const error = errorOf(value);
  if (error) {
    const from = Math.min(error.at, Math.max(0, value.length - 1));
    refs.push({
      from,
      to: Math.min(value.length, from + 1),
      issue: { severity: 'error' as const, message: error.message },
    });
  }
  return refs;
}

const hasInsertMenu = computed(() => props.allowBinding && props.suggestions !== undefined);
const buttonCount = computed(() => (hasInsertMenu.value ? 1 : 0) + (props.expandLabel ? 1 : 0));

const lineHeight = 18;
const extensions = computed(() => {
  // Reading the analyzer here re-marks an unchanged document when it changes (e.g. a
  // component the JSON refers to gets added).
  void props.analyze;
  return [
    jsonLang(),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': { fontSize: '12px' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        lineHeight: `${lineHeight}px`,
        ...(props.fill
          ? { height: '100%' }
          : {
              minHeight: `${props.minLines * lineHeight + 8}px`,
              maxHeight: `${props.maxLines * lineHeight + 8}px`,
            }),
        overflow: 'auto',
      },
      // Room for the buttons on the first line.
      '.cm-content': { padding: `4px ${buttonCount.value ? buttonCount.value * 22 : 0}px 4px 0` },
      '.cm-gutters': { display: 'none' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      // A binding's own color wins over the string color around it.
      '.cm-expression span': { color: 'inherit' },
    }),
    expressionHighlighter(() => marks),
    ...(colorMode.value === 'dark' ? [oneDark] : []),
  ];
});

function onChange(value: string) {
  text.value = value;
  emit('update:modelValue', value);
}

// ---- the `{}` menu: the whole value becomes the picked binding
let view: EditorView | null = null;
const onReady = (payload: { view: EditorView }) => (view = payload.view);
const menuOpen = ref(false);
// Picked in the menu, applied once it has closed: while it's open it traps focus.
let pendingPath: string | null = null;

function onMenuCloseAutoFocus(e: Event) {
  e.preventDefault();
  const path = pendingPath;
  pendingPath = null;
  if (path === null || !view) return;
  const binding = `{= ${path} =}`;
  // Through the editor, so Undo brings the previous value back.
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: binding },
    selection: { anchor: binding.length },
  });
  view.focus();
  emit('commit', binding);
}

// ---- full screen: edits a draft, committed when the dialog closes
const expanded = ref(false);
const draft = ref('');
function expand() {
  draft.value = text.value;
  expanded.value = true;
}
function onExpandedChange(open: boolean) {
  expanded.value = open;
  if (!open && draft.value !== text.value) {
    onChange(draft.value);
    emit('commit', draft.value);
  }
}
</script>

<template>
  <div :class="cn('flex flex-col gap-1 min-w-0', fill && 'h-full')">
    <div
      :class="
        cn(
          'json-editor relative rounded-md border bg-white dark:bg-input/30 shadow-xs overflow-hidden transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
          parseError ? 'border-destructive' : 'border-input',
          fill && 'flex-1 min-h-0 [&_.cm-editor]:h-full'
        )
      "
      :aria-invalid="!!parseError"
    >
      <DropdownMenu v-if="hasInsertMenu" v-model:open="menuOpen">
        <DropdownMenuTrigger
          type="button"
          :class="
            cn(
              'absolute top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              expandLabel ? 'right-6' : 'right-1'
            )
          "
          :title="t('expressionInput.insert')"
          :aria-label="t('expressionInput.insert')"
        >
          <Braces :size="12" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="max-h-72" @close-auto-focus="onMenuCloseAutoFocus">
          <template v-if="suggestions && suggestions.length > 0">
            <DropdownMenuItem
              v-for="s in suggestions"
              :key="s.path"
              class="cursor-pointer gap-3 text-xs"
              @select="pendingPath = s.path"
            >
              <span class="flex-1 truncate font-mono">{{ s.path }}</span>
              <span v-if="s.detail" class="shrink-0 text-muted-foreground">{{ s.detail }}</span>
            </DropdownMenuItem>
          </template>
          <p v-else class="px-2 py-1.5 text-xs text-muted-foreground">{{ t('expressionInput.empty') }}</p>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        v-if="expandLabel"
        type="button"
        class="absolute top-1 right-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        :title="t('builder.expand.title')"
        :aria-label="t('builder.expand.title')"
        @click="expand"
      >
        <Maximize2 :size="12" />
      </button>
      <Codemirror
        :model-value="text"
        :placeholder="placeholder"
        :extensions="extensions"
        :indent-with-tab="true"
        :tab-size="2"
        @update:model-value="onChange"
        @ready="onReady"
        @blur="emit('commit', text)"
      />
    </div>
    <p v-if="showError && parseError" class="text-xs text-destructive m-0">
      {{ t('jsonEditor.invalid', { line: parseError.line, detail: parseError.message }) }}
    </p>

    <ExpandedEditorDialog v-if="expandLabel" :open="expanded" :title="expandLabel" @update:open="onExpandedChange">
      <template #editor>
        <JsonEditor
          v-model="draft"
          :analyze="analyze"
          :placeholder="placeholder"
          :allow-binding="allowBinding"
          :suggestions="suggestions"
          fill
        />
      </template>
      <template #footer>
        <Button @click="onExpandedChange(false)">{{ t('builder.expand.done') }}</Button>
      </template>
    </ExpandedEditorDialog>
  </div>
</template>
