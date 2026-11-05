<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import AppCodeEditor from '@/components/app/widgets/AppCodeEditor.vue';
import CustomWidget from '@/components/app/widgets/CustomWidget.vue';

// A code prop (a custom component's HTML) in the Properties panel: highlighted, with
// the full-screen editor. It's committed a moment after typing stops and when the
// editor is left — not on every key, so the app isn't saved (nor an undo step made)
// per keystroke. A change from elsewhere (undo, YAML) replaces the text while it's not
// being edited.
//
// With `preview` (the custom component's props) the full-screen editor shows it running,
// as the code is typed: clickable, with its Data when that's written in (a binding has
// no value in the builder).
const props = defineProps<{
  id: string;
  modelValue: string;
  language?: string;
  label?: string;
  preview?: Record<string, unknown> | null;
}>();
const emit = defineEmits<{ commit: [value: string] }>();

const draft = ref(props.modelValue ?? '');
let timer: ReturnType<typeof setTimeout> | undefined;
let editing = false;

watch(
  () => props.modelValue,
  (value) => {
    if (!editing) draft.value = value ?? '';
  }
);

function commit() {
  clearTimeout(timer);
  editing = false;
  if (draft.value !== (props.modelValue ?? '')) emit('commit', draft.value);
}
function onInput(value: string) {
  editing = true;
  draft.value = value;
  clearTimeout(timer);
  timer = setTimeout(commit, 700);
}
onBeforeUnmount(commit);

const previewData = () => {
  const data = props.preview?.data;
  return typeof data === 'string' && /\{[{=%]/.test(data) ? null : data;
};
</script>

<template>
  <AppCodeEditor
    :id="id"
    :model-value="draft"
    :language="language"
    :label="label"
    :min-lines="8"
    :max-lines="18"
    :previewable="!!preview"
    @update:model-value="onInput"
    @blur="commit"
  >
    <template #preview="{ text }">
      <CustomWidget
        :props="{ ...preview, title: undefined, code: text, data: previewData() }"
        component-id="preview"
        data-testid="custom-preview"
      />
    </template>
  </AppCodeEditor>
</template>
