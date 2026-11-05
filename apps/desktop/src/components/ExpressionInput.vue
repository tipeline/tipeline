<script setup lang="ts">
import { computed, onMounted, ref, watch, type HTMLAttributes } from 'vue';
import { useI18n } from 'vue-i18n';
import { Braces } from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  bindingQueryAt,
  decorateExpression,
  insertBinding,
  matchSuggestions,
  readText,
  selectionOffsets,
  selectOffsets,
  textEdit,
  type ExpressionAnalyzer,
  type ExpressionSuggestion,
} from '@/utils/expressionField';
import { wholeTextReferencePath } from '@/utils/templateReferences';

// The one field for text that can reference data with `{{ path }}` / `{= path =}` —
// workflow action params (TemplateField) and app bindings (BindingInput) both render
// this, so referencing works the same everywhere: typing `{{` or `{=` lists what the
// field can refer to (↑/↓ choose, Enter/Tab insert, Esc closes), the `{}` button
// inserts one from a menu, and on blur every reference is colored — red/amber with the
// reason as a tooltip when `analyze` says it doesn't resolve.
//
// A `valueField` holds a value rather than text (a script's context entry, a sub-workflow
// prop): picking a reference as the whole value there gives `{= path =}`, which core
// hands over as the real value — `{{ path }}` would turn a list or number into text.
// Inside other text it stays `{{ path }}`, since `{= =}` must be the whole value.
//
// It's a contenteditable so references can be colored, but the value is always the
// plain string: tokens are plain styled spans (not atomic widgets — contenteditable
// handles those badly: the caret gets stuck around them and Backspace can't remove
// them), and the text is only re-decorated while the field isn't focused, since
// replacing the DOM mid-typing would reset the caret. Edits go through the browser's
// own editing commands, so undo keeps working.

const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** What the field can reference. Omitted: no autocomplete and no insert menu. */
    suggestions?: ExpressionSuggestion[];
    /** Finds the references in the text and which ones don't resolve. */
    analyze?: ExpressionAnalyzer;
    multiline?: boolean;
    rows?: number;
    disabled?: boolean;
    placeholder?: string;
    size?: 'default' | 'sm';
    /** Extra classes for the editable field itself (font, height). */
    fieldClass?: HTMLAttributes['class'];
    /** Holds a value, not text: a whole-value pick inserts `{= path =}`. */
    valueField?: boolean;
  }>(),
  {
    suggestions: undefined,
    analyze: undefined,
    multiline: false,
    rows: 3,
    disabled: false,
    placeholder: '',
    size: 'default',
    fieldClass: undefined,
    valueField: false,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** The value is final for now — on blur, after inserting a reference, and on Enter. */
  commit: [value: string];
}>();

const { t } = useI18n();

const fieldRef = ref<HTMLDivElement | null>(null);
const menuOpen = ref(false);
const query = ref<string | null>(null);
const active = ref(0);
let composing = false;
// Where the insert menu puts its reference, saved when the menu opens — as text
// offsets, so it survives the field re-rendering while focus is in the menu.
let menuSelection: { start: number; end: number } | null = null;

const hasSuggestions = computed(() => props.suggestions !== undefined);
const matches = computed(() =>
  query.value === null || !props.suggestions ? [] : matchSuggestions(props.suggestions, query.value)
);
const decorated = computed(() => decorateExpression(props.modelValue ?? '', props.analyze));

const isFocused = () => !!fieldRef.value && document.activeElement === fieldRef.value;

function render() {
  if (fieldRef.value) fieldRef.value.innerHTML = decorated.value;
}

// The field's value — trailing newlines dropped (Chromium keeps one in the DOM to hold
// an empty last line open).
function value(): string {
  return fieldRef.value ? readText(fieldRef.value).replace(/\n+$/, '') : (props.modelValue ?? '');
}

function sync() {
  emit('update:modelValue', value());
}

function refreshQuery() {
  if (!hasSuggestions.value || !fieldRef.value || composing) return;
  const sel = selectionOffsets(fieldRef.value);
  const q = sel && sel.start === sel.end ? bindingQueryAt(readText(fieldRef.value), sel.start) : null;
  query.value = q ? q.query : null;
  active.value = 0;
}

/** Replaces the field's text with `next` as one undoable edit, then puts the caret at `caret`. */
function applyText(next: string, caret: number) {
  const el = fieldRef.value;
  if (!el) return;
  const edit = textEdit(readText(el), next);
  selectOffsets(el, edit.from, edit.to);
  if (edit.insert) document.execCommand('insertText', false, edit.insert);
  else if (edit.from !== edit.to) document.execCommand('delete');
  selectOffsets(el, caret);
}

function choose(s: ExpressionSuggestion) {
  const el = fieldRef.value;
  const sel = el && selectionOffsets(el);
  if (!el || !sel) return;
  let { text, caret } = insertBinding(readText(el), sel.start, s.path);
  // `{{` typed into an empty value field: the pick is the whole value.
  if (props.valueField && wholeTextReferencePath(text) === s.path) {
    text = `{= ${s.path} =}`;
    caret = text.length;
  }
  applyText(text, caret);
  query.value = null;
  sync();
  emit('commit', value());
}

/** Inserts plain text at the caret; newlines become line breaks (or spaces on one line). */
function insertPlain(text: string) {
  const lines = text.split(/\r\n|\r|\n/);
  if (!props.multiline) {
    document.execCommand('insertText', false, lines.join(' '));
    return;
  }
  lines.forEach((line, i) => {
    // insertText with a "\n" would split the field into <div> lines.
    if (i > 0) document.execCommand('insertLineBreak');
    if (line) document.execCommand('insertText', false, line);
  });
}

function onInput() {
  sync();
  refreshQuery();
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (matches.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active.value = (active.value + 1) % matches.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      active.value = (active.value - 1 + matches.value.length) % matches.value.length;
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(matches.value[active.value]);
      return;
    }
    if (e.key === 'Escape') {
      // Close the list only, not a dialog the field sits in.
      e.stopPropagation();
      query.value = null;
      return;
    }
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (props.multiline) document.execCommand('insertLineBreak');
    else emit('commit', value());
  }
}

function onPaste(e: ClipboardEvent) {
  // Plain text only — a rich paste would bring the source's own markup and styles.
  e.preventDefault();
  insertPlain(e.clipboardData?.getData('text/plain') ?? '');
  sync();
}

function onDrop(e: DragEvent) {
  const text = e.dataTransfer?.getData('text/plain');
  if (!text) return;
  e.preventDefault();
  const at = document.caretRangeFromPoint?.(e.clientX, e.clientY);
  if (at) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(at);
  }
  fieldRef.value?.focus();
  insertPlain(text);
  sync();
}

function onCompositionEnd() {
  composing = false;
  onInput();
}

function onBlur() {
  query.value = null;
  sync();
  emit('commit', value());
  render();
}

function onMenuTriggerMouseDown() {
  menuSelection = fieldRef.value ? selectionOffsets(fieldRef.value) : null;
}

/** Focus back in the field, with the selection it had when the menu opened. */
function restoreFocus() {
  const el = fieldRef.value;
  if (!el) return;
  el.focus();
  const end = value().length;
  const { start, end: selEnd } = menuSelection ?? { start: end, end };
  selectOffsets(el, start, selEnd);
}

// Picked in the menu, inserted once it has closed: while it's open it traps focus, so
// the field can't take focus back to insert into.
let pendingPath: string | null = null;

function pickFromMenu(path: string) {
  pendingPath = path;
}

// The menu would hand focus back to its trigger on close — send it to the field
// instead (inserting the picked reference), unless the user already moved on.
function onMenuCloseAutoFocus(e: Event) {
  e.preventDefault();
  const path = pendingPath;
  pendingPath = null;
  // Still in the closing menu, on its trigger, or nowhere: the user hasn't moved on.
  const active = document.activeElement;
  const movedOn =
    !!active &&
    active !== document.body &&
    !active.closest('[role="menu"]') &&
    !fieldRef.value?.parentElement?.contains(active);
  if (path === null && movedOn) return;
  restoreFocus();
  if (path === null) return;
  const current = value();
  const sel = fieldRef.value ? selectionOffsets(fieldRef.value) : null;
  const whole =
    current.trim() === '' || (!!sel && sel.start === 0 && sel.end >= current.length);
  if (props.valueField && whole) {
    const next = `{= ${path} =}`;
    applyText(next, next.length);
  } else document.execCommand('insertText', false, `{{ ${path} }}`);
  sync();
  emit('commit', value());
}

// Re-decorate when the value changes from outside (a form reset, undo in the store) or
// a reference starts or stops resolving (e.g. the variable it names gets added) — but
// never under the caret.
watch(decorated, () => {
  if (!isFocused()) render();
});
watch(menuOpen, (open) => {
  if (!open && !isFocused()) render();
});

onMounted(render);

const fieldClasses = computed(() =>
  cn(
    // No `flex` on purpose: `display: flex` on a contenteditable breaks the browser's
    // caret hit-testing, so clicks stop landing where you click.
    'expression-field block w-full min-w-0 rounded-md border border-input bg-white dark:bg-input/30 text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
    props.size === 'sm' ? 'px-2.5 text-xs leading-4' : 'px-3 text-sm leading-5',
    props.multiline
      ? cn('py-2 whitespace-pre-wrap break-words')
      : cn(
          'overflow-x-auto overflow-y-hidden whitespace-nowrap',
          props.size === 'sm' ? 'h-7 py-[5px]' : 'h-9 py-[7px]'
        ),
    hasSuggestions.value && (props.size === 'sm' ? 'pr-7' : 'pr-9'),
    props.disabled && 'pointer-events-none cursor-not-allowed opacity-50',
    props.fieldClass
  )
);

// A multi-line field is at least `rows` lines tall, like a textarea.
const fieldStyle = computed(() =>
  props.multiline
    ? { minHeight: `calc(${props.rows} * ${props.size === 'sm' ? '1rem' : '1.25rem'} + 1rem + 2px)` }
    : undefined
);
</script>

<template>
  <div class="relative min-w-0">
    <div
      ref="fieldRef"
      :class="fieldClasses"
      :style="fieldStyle"
      :contenteditable="disabled ? 'false' : 'plaintext-only'"
      role="textbox"
      :aria-multiline="multiline"
      :aria-disabled="disabled"
      :data-placeholder="placeholder"
      spellcheck="false"
      @input="onInput"
      @keydown="onKeydown"
      @keyup.left="refreshQuery"
      @keyup.right="refreshQuery"
      @click="refreshQuery"
      @paste="onPaste"
      @drop="onDrop"
      @compositionstart="composing = true"
      @compositionend="onCompositionEnd"
      @blur="onBlur"
    />
    <DropdownMenu v-if="hasSuggestions" v-model:open="menuOpen">
      <DropdownMenuTrigger
        type="button"
        :class="
          cn(
            'absolute inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
            size === 'sm' ? 'top-1 right-1 h-5 w-5' : 'top-1.5 right-1.5 h-6 w-6'
          )
        "
        :disabled="disabled"
        :title="t('expressionInput.insert')"
        :aria-label="t('expressionInput.insert')"
        @mousedown="onMenuTriggerMouseDown"
      >
        <Braces :size="size === 'sm' ? 12 : 14" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="max-h-72" @close-auto-focus="onMenuCloseAutoFocus">
        <template v-if="suggestions && suggestions.length > 0">
          <DropdownMenuItem
            v-for="s in suggestions"
            :key="s.path"
            class="cursor-pointer gap-3 text-xs"
            @select="pickFromMenu(s.path)"
          >
            <span class="flex-1 truncate font-mono">{{ s.path }}</span>
            <span v-if="s.detail" class="shrink-0 text-muted-foreground">{{ s.detail }}</span>
          </DropdownMenuItem>
        </template>
        <p v-else class="px-2 py-1.5 text-xs text-muted-foreground">{{ t('expressionInput.empty') }}</p>
      </DropdownMenuContent>
    </DropdownMenu>
    <ul
      v-if="matches.length"
      role="listbox"
      class="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <li
        v-for="(s, i) in matches"
        :key="s.path"
        role="option"
        :aria-selected="i === active"
        class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs"
        :class="i === active ? 'bg-accent text-accent-foreground' : ''"
        @mousedown.prevent="choose(s)"
        @mouseenter="active = i"
      >
        <span class="flex-1 truncate font-mono">{{ s.path }}</span>
        <span v-if="s.detail" class="shrink-0 text-muted-foreground">{{ s.detail }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.expression-field {
  scrollbar-width: none;
}
.expression-field:empty::before {
  content: attr(data-placeholder);
  color: var(--muted-foreground);
  pointer-events: none;
}
</style>
