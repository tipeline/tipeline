<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Maximize2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import ExpandedEditorDialog from '@/components/ExpandedEditorDialog.vue';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import TextWidget from '@/components/app/widgets/TextWidget.vue';
import BindingInput from './BindingInput.vue';

// A multi-line builder field with an expand button (⌘⇧E while it has focus, like the
// workflow editor's code fields): the shared full-screen editor with the same field —
// autocomplete and binding marks included. With `markdownPreview` (a Markdown text's
// props) it previews the text, live: Editor | Split | Preview, like the workflow
// editor. The dialog edits a draft and commits it when it closes, as the field commits
// on blur.
const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    rows?: number;
    /** A text component's props: preview the draft rendered as that text. */
    markdownPreview?: Record<string, unknown> | null;
  }>(),
  { rows: 3, markdownPreview: null }
);
const emit = defineEmits<{ commit: [value: string] }>();
const { t } = useI18n();

const open = ref(false);
const draft = ref('');
const hasFocus = ref(false);

function expand() {
  draft.value = props.modelValue ?? '';
  open.value = true;
}

function onOpenChange(isOpen: boolean) {
  open.value = isOpen;
  if (!isOpen && draft.value !== (props.modelValue ?? '')) emit('commit', draft.value);
}

useKeyboardShortcuts([
  {
    key: 'e',
    meta: true,
    shift: true,
    enabled: () => hasFocus.value || open.value,
    handler: () => (open.value ? onOpenChange(false) : expand()),
  },
]);
</script>

<template>
  <div class="relative" @focusin="hasFocus = true" @focusout="hasFocus = false">
    <!-- Room for two corner buttons: the field's own {} menu (right) and expand. -->
    <BindingInput
      :model-value="modelValue"
      multiline
      :rows="rows"
      input-class="pr-12"
      @commit="(v) => emit('commit', v)"
    />
    <!-- Just left of the {} button, same size and look (ExpressionInput, size sm). -->
    <button
      type="button"
      class="absolute top-1 right-[1.625rem] inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      :title="t('builder.expand.title')"
      :aria-label="t('builder.expand.title')"
      @click="expand"
    >
      <Maximize2 :size="12" />
    </button>

    <ExpandedEditorDialog
      :open="open"
      :title="label"
      :description="t('builder.expand.description')"
      :previewable="!!markdownPreview"
      @update:open="onOpenChange"
    >
      <template #editor>
        <div class="expand-editor h-full">
          <BindingInput v-model="draft" multiline :rows="8" size="default" input-class="font-mono" />
        </div>
      </template>
      <!-- Padded like the editor (py-2 px-3), so the first lines start level. -->
      <template #preview>
        <div class="h-full" style="--app-pad: 0.5rem 0.75rem">
          <TextWidget :props="{ ...markdownPreview, content: draft }" editable />
        </div>
      </template>
      <template #footer>
        <Button @click="onOpenChange(false)">{{ t('builder.expand.done') }}</Button>
      </template>
    </ExpandedEditorDialog>
  </div>
</template>

<style scoped>
/* The big editor fills its column (and scrolls inside) instead of growing by rows. */
.expand-editor :deep(> div) {
  height: 100%;
}
.expand-editor :deep([role='textbox']) {
  height: 100%;
  overflow: auto;
}
</style>
