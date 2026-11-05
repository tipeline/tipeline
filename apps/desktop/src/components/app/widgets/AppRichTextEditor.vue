<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { fromEditorHtml, toEditorHtml, type RichTextFormat } from '@/utils/appRichText';

// Formatted text written by the person using an app (Input / form field type
// `richtext`): headings, bold / italic / underline / strike, lists, quotes, code and
// links, with a toolbar. Its value is HTML, or Markdown with `format: markdown` — e.g.
// an email body or a document for a workflow. `fill`: as tall as its box.
const props = defineProps<{
  id: string;
  modelValue: unknown;
  format?: RichTextFormat;
  placeholder?: string;
  editable?: boolean;
  fill?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();
const { t } = useI18n();

const format = computed<RichTextFormat>(() => (props.format === 'markdown' ? 'markdown' : 'html'));
// Values sent out but not yet seen coming back. The app's update for one can arrive
// after the next was sent (fast typing): such a late echo is not a change from
// outside — reloading it would undo keystrokes and move the cursor to the start. Only
// a value that is neither (a reset, a binding) replaces the editor's content.
const pending: string[] = [];

const editor = useEditor({
  content: toEditorHtml(props.modelValue, format.value),
  editable: !props.editable,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: { openOnClick: false, autolink: true, protocols: ['mailto'], HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
    }),
    Placeholder.configure({ placeholder: () => props.placeholder || t('apps.field.richTextPlaceholder') }),
  ],
  editorProps: { attributes: { class: 'app-markdown outline-none min-h-full px-3 py-2 text-sm' } },
  onUpdate: ({ editor: e }) => {
    const value = fromEditorHtml(e.getHTML(), e.isEmpty, format.value);
    pending.push(value);
    if (pending.length > 50) pending.shift();
    emit('update:modelValue', value);
  },
  onBlur: () => emit('blur'),
});
onBeforeUnmount(() => editor.value?.destroy());

watch(
  () => props.modelValue,
  (value) => {
    const e = editor.value;
    const text = typeof value === 'string' ? value : '';
    if (!e) return;
    const echo = pending.indexOf(text);
    if (echo >= 0) {
      pending.splice(0, echo + 1); // that one and any older ones have come back
      return;
    }
    if (text === fromEditorHtml(e.getHTML(), e.isEmpty, format.value)) return;
    pending.length = 0;
    e.commands.setContent(toEditorHtml(text, format.value), { emitUpdate: false });
  }
);
watch(
  () => props.editable,
  (builder) => editor.value?.setEditable(!builder)
);

// ---- toolbar (its buttons don't take the focus on mouse-down: the editor keeps its
// cursor / selection, so a style applies where the person was typing)
type Tool = { key: string; icon: any; label: string; active?: () => boolean; run: () => void };
const chain = () => editor.value!.chain().focus();
const tools = computed<Tool[][]>(() => [
  [
    { key: 'h2', icon: Heading2, label: t('apps.richText.heading'), active: () => !!editor.value?.isActive('heading', { level: 2 }), run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: 'h3', icon: Heading3, label: t('apps.richText.subheading'), active: () => !!editor.value?.isActive('heading', { level: 3 }), run: () => chain().toggleHeading({ level: 3 }).run() },
  ],
  [
    { key: 'bold', icon: Bold, label: t('apps.richText.bold'), active: () => !!editor.value?.isActive('bold'), run: () => chain().toggleBold().run() },
    { key: 'italic', icon: Italic, label: t('apps.richText.italic'), active: () => !!editor.value?.isActive('italic'), run: () => chain().toggleItalic().run() },
    { key: 'underline', icon: UnderlineIcon, label: t('apps.richText.underline'), active: () => !!editor.value?.isActive('underline'), run: () => chain().toggleUnderline().run() },
    { key: 'strike', icon: Strikethrough, label: t('apps.richText.strike'), active: () => !!editor.value?.isActive('strike'), run: () => chain().toggleStrike().run() },
    { key: 'code', icon: Code, label: t('apps.richText.code'), active: () => !!editor.value?.isActive('code'), run: () => chain().toggleCode().run() },
  ],
  [
    { key: 'bullets', icon: List, label: t('apps.richText.bullets'), active: () => !!editor.value?.isActive('bulletList'), run: () => chain().toggleBulletList().run() },
    { key: 'numbers', icon: ListOrdered, label: t('apps.richText.numbers'), active: () => !!editor.value?.isActive('orderedList'), run: () => chain().toggleOrderedList().run() },
    { key: 'quote', icon: Quote, label: t('apps.richText.quote'), active: () => !!editor.value?.isActive('blockquote'), run: () => chain().toggleBlockquote().run() },
  ],
]);
const extra = computed<Tool[]>(() => [
  { key: 'clear', icon: RemoveFormatting, label: t('apps.richText.clear'), run: () => chain().unsetAllMarks().clearNodes().run() },
  { key: 'undo', icon: Undo2, label: t('apps.richText.undo'), run: () => chain().undo().run() },
  { key: 'redo', icon: Redo2, label: t('apps.richText.redo'), run: () => chain().redo().run() },
]);

// Links: a small box for the address (no window.prompt in the app).
const linkOpen = ref(false);
const linkUrl = ref('');
function openLink(open: boolean) {
  linkOpen.value = open;
  if (open) linkUrl.value = (editor.value?.getAttributes('link').href as string) ?? '';
}
function applyLink() {
  const url = linkUrl.value.trim();
  if (!url) chain().extendMarkRange('link').unsetLink().run();
  else if (/^(https?:\/\/|mailto:)/i.test(url)) chain().extendMarkRange('link').setLink({ href: url }).run();
  else chain().extendMarkRange('link').setLink({ href: `https://${url}` }).run();
  linkOpen.value = false;
}
const toolClass = (on: boolean) =>
  cn('p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40', on && 'bg-accent text-foreground');
</script>

<template>
  <div
    :id="id"
    :class="cn('rounded-md border bg-background flex flex-col overflow-hidden focus-within:ring-[3px] focus-within:ring-ring/50', fill && 'flex-1 min-h-0')"
    data-testid="rich-text"
  >
    <div class="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1 shrink-0" role="toolbar">
      <template v-for="(group, g) in tools" :key="g">
        <button
          v-for="tool in group"
          :key="tool.key"
          type="button"
          :class="toolClass(!!tool.active?.())"
          :disabled="editable"
          :title="tool.label"
          :aria-label="tool.label"
          :aria-pressed="!!tool.active?.()"
          :data-tool="tool.key"
          @mousedown.prevent
          @click="tool.run"
        >
          <component :is="tool.icon" class="size-3.5" />
        </button>
        <span class="mx-0.5 h-4 w-px bg-border" />
      </template>
      <Popover :open="linkOpen" @update:open="openLink">
        <PopoverTrigger as-child>
          <button
            type="button"
            :class="toolClass(!!editor?.isActive('link'))"
            :disabled="editable"
            :title="t('apps.richText.link')"
            :aria-label="t('apps.richText.link')"
            data-tool="link"
          >
            <LinkIcon class="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent class="w-72 p-2 flex gap-1.5" align="start">
          <Input
            v-model="linkUrl"
            class="h-8 text-sm"
            placeholder="https://…"
            data-testid="link-url"
            @keydown.enter.prevent="applyLink"
          />
          <Button size="sm" class="h-8" @click="applyLink">{{ t('apps.richText.apply') }}</Button>
        </PopoverContent>
      </Popover>
      <span class="ml-auto" />
      <button
        v-for="tool in extra"
        :key="tool.key"
        type="button"
        :class="toolClass(false)"
        :disabled="editable"
        :title="tool.label"
        :aria-label="tool.label"
        :data-tool="tool.key"
        @mousedown.prevent
        @click="tool.run"
      >
        <component :is="tool.icon" class="size-3.5" />
      </button>
    </div>
    <EditorContent :editor="editor" :class="cn('flex-1 overflow-y-auto', fill ? 'min-h-0' : 'min-h-28 max-h-80')" />
  </div>
</template>

<style>
/* TipTap's placeholder: shown in the empty first paragraph. */
.tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--muted-foreground);
}
.tiptap {
  min-height: 100%;
}
</style>
