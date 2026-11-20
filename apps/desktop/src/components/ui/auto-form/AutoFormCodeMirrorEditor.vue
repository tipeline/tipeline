<script setup lang="ts">
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { computed, ref } from 'vue';
import { Maximize2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import ExpandedEditorDialog from '@/components/ExpandedEditorDialog.vue';
import VariableInsertMenu from '@/components/VariableInsertMenu.vue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useVariableSuggestions } from '@/composables/useVariableSuggestions';
import { expressionCompletion } from '@/utils/codemirrorCompletion';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    extensions: Extension[];
    disabled?: boolean;
    label?: string;
    height?: string;
    // Off by default: a bare `{{ name }}` only makes sense in a template body
    // (HTML/Markdown/CSS). The script action's JS body isn't template text —
    // variables reach it through `context`, so inserting a token there would
    // just be invalid JS. Only AutoFormFieldCodeMirrorTemplate opts in. Also turns on
    // `{{` autocomplete, with the same suggestions as the other step fields.
    allowVariableInsert?: boolean;
    // Shows a Code/Preview tab switcher (both here and in the expand dialog)
    // rendering `previewHtml` in a sandboxed iframe. Only meaningful for HTML
    // content — AutoFormFieldCodeMirrorTemplate opts in when format === 'html'.
    previewable?: boolean;
    // Pre-rendered preview HTML (or an error message formatted as HTML) —
    // computed by the caller, which knows about task variables/real run data
    // and the Liquid engine. This component only displays it.
    previewHtml?: string;
    // e.g. "Real data from last run — 2 hours ago" or "Sample placeholder data".
    previewLabel?: string;
    // Tab name for the preview side ("Output" for the script field).
    previewTabLabel?: string;
  }>(),
  {
    height: '240px',
    allowVariableInsert: false,
    previewable: false,
    previewHtml: '',
    previewLabel: '',
    previewTabLabel: 'Preview',
  }
);

// A caller can replace the HTML iframe with its own `#preview` content (both
// inline and in the expand dialog), and add buttons next to the inline tabs
// via `#actions`. `v-model:tab` lets it switch tabs itself (e.g. Run → Output).
defineSlots<{ preview?: () => any; actions?: () => any }>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const isExpanded = ref(false);
const activeTab = defineModel<'code' | 'preview'>('tab', { default: 'code' });

// Every variable type: a template prints text but also loops over lists and reads
// objects in `{% %}` tags. Undefined outside the action editor (nothing to offer).
const suggestions = useVariableSuggestions();
const showVariableMenu = computed(() => props.allowVariableInsert && suggestions.value !== undefined);

// One extension for the editor's lifetime, reading the current suggestions each time:
// a new one would make vue-codemirror reconfigure the editor on every variable change.
const completion = expressionCompletion(() => suggestions.value);
const editorExtensions = computed(() =>
  showVariableMenu.value ? [...props.extensions, completion] : props.extensions
);

let mainView: EditorView | null = null;
let expandedView: EditorView | null = null;

function onMainReady(payload: { view: EditorView }) {
  mainView = payload.view;
}

function onExpandedReady(payload: { view: EditorView }) {
  expandedView = payload.view;
}

// The `{}` menu closed: insert the pick (focus back in the editor either way, unless
// the user already clicked somewhere else).
function onMenuClosed(name: string | null) {
  const view = isExpanded.value ? expandedView : mainView;
  if (!view) return;
  if (name === null) {
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('[role="menu"]')) view.focus();
    return;
  }
  const { from, to } = view.state.selection.main;
  const text = `{{ ${name} }}`;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

// This shortcut is a window-level listener registered by every mounted
// instance (useKeyboardShortcuts has no per-component scoping), and a single
// action can now have more than one codemirror/codemirror-template field at
// once (e.g. a plugin with two component: 'textarea' params) — without a
// focus check, Cmd+Shift+E would toggle every instance's dialog at once,
// stacking N expand dialogs on top of each other. Gate on this instance's
// own editor actually having focus, so only the one the user is in reacts —
// checking both views covers toggling closed again from inside the expanded
// editor, which is where focus moves to once it's open.
useKeyboardShortcuts([
  {
    key: 'e',
    meta: true,
    shift: true,
    enabled: () => !!mainView?.hasFocus || !!expandedView?.hasFocus,
    handler: () => {
      isExpanded.value = !isExpanded.value;
    },
  },
]);
</script>

<template>
  <div class="relative">
    <Tabs v-if="previewable" v-model="activeTab">
      <div class="mb-1.5 flex items-center justify-between">
        <TabsList class="h-8">
          <TabsTrigger value="code" class="text-xs">Code</TabsTrigger>
          <TabsTrigger value="preview" class="text-xs">{{ props.previewTabLabel }}</TabsTrigger>
        </TabsList>
        <div class="flex items-center gap-0.5">
          <slot name="actions" />
          <VariableInsertMenu
            v-if="showVariableMenu && activeTab === 'code'"
            :suggestions="suggestions ?? []"
            :disabled="props.disabled"
            trigger-class="h-8 w-8"
            :icon-size="16"
            @closed="onMenuClosed"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Expand editor (⌘⇧E)"
            :disabled="props.disabled"
            @click="isExpanded = true"
          >
            <Maximize2 class="h-4 w-4" />
            <span class="sr-only">Expand editor (⌘⇧E)</span>
          </Button>
        </div>
      </div>
      <TabsContent value="code">
        <codemirror
          :model-value="props.modelValue"
          :style="{ height: props.height, width: '100%' }"
          :autofocus="false"
          :indent-with-tab="true"
          :tab-size="2"
          :extensions="editorExtensions"
          :disabled="props.disabled"
          @update:model-value="emit('update:modelValue', $event)"
          @ready="onMainReady"
        />
      </TabsContent>
      <TabsContent value="preview">
        <p v-if="props.previewLabel" class="mb-1 text-[11px] text-muted-foreground">{{ props.previewLabel }}</p>
        <div v-if="$slots.preview" class="overflow-auto rounded-md border" :style="{ height: props.height }">
          <slot name="preview" />
        </div>
        <iframe
          v-else
          :srcdoc="props.previewHtml"
          sandbox=""
          title="Preview"
          class="w-full rounded-md border bg-white"
          :style="{ height: props.height }"
        />
      </TabsContent>
    </Tabs>

    <template v-else>
      <codemirror
        :model-value="props.modelValue"
        :style="{ height: props.height, width: '100%' }"
        :autofocus="false"
        :indent-with-tab="true"
        :tab-size="2"
        :extensions="editorExtensions"
        :disabled="props.disabled"
        @update:model-value="emit('update:modelValue', $event)"
        @ready="onMainReady"
      />
      <VariableInsertMenu
        v-if="showVariableMenu"
        :suggestions="suggestions ?? []"
        :disabled="props.disabled"
        trigger-class="absolute top-1.5 right-10 h-8 w-8"
        :icon-size="16"
        @closed="onMenuClosed"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="absolute top-1.5 right-1.5"
        title="Expand editor (⌘⇧E)"
        :disabled="props.disabled"
        @click="isExpanded = true"
      >
        <Maximize2 class="h-4 w-4" />
        <span class="sr-only">Expand editor (⌘⇧E)</span>
      </Button>
    </template>

    <!-- Full screen: Editor | Split | Preview, with a resizable preview (shared with the app builder). -->
    <ExpandedEditorDialog
      v-model:open="isExpanded"
      :title="props.label ?? ''"
      :previewable="previewable"
      :preview-label="props.previewLabel"
    >
      <template #actions>
        <VariableInsertMenu
          v-if="showVariableMenu"
          :suggestions="suggestions ?? []"
          :disabled="props.disabled"
          trigger-class="h-8 w-8"
          :icon-size="16"
          @closed="onMenuClosed"
        />
      </template>
      <template #editor>
        <codemirror
          :model-value="props.modelValue"
          :style="{ height: '100%', width: '100%' }"
          :autofocus="true"
          :indent-with-tab="true"
          :tab-size="2"
          :extensions="editorExtensions"
          :disabled="props.disabled"
          @update:model-value="emit('update:modelValue', $event)"
          @ready="onExpandedReady"
        />
      </template>
      <template #preview>
        <div v-if="$slots.preview" class="h-full w-full overflow-auto">
          <slot name="preview" />
        </div>
        <iframe v-else :srcdoc="props.previewHtml" sandbox="" title="Preview" class="h-full w-full bg-white" />
      </template>
    </ExpandedEditorDialog>
  </div>
</template>
