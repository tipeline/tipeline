<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppAction } from '@tipeline/schemas';
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  ArrowRight,
  Variable,
  MessageSquare,
  AppWindow,
  X,
  RotateCcw,
  ExternalLink,
  FileDown,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import Dialog from '@/components/Dialog.vue';
import ActionEdit from './ActionEdit.vue';

// Edits one ordered list of actions (a component event, page load, or a runnable's
// onSuccess / onError). Emits the whole new list on every change.
const props = defineProps<{
  label: string;
  modelValue: AppAction[];
  pages: Array<{ id: string; name: string }>;
  runnables: string[];
  components?: Array<{ id: string; type: string }>;
  /** A runnable's On success / On error list (offers result.* and error.message). */
  handler?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [actions: AppAction[]] }>();
const { t } = useI18n();

const ICONS = {
  run: Play,
  navigate: ArrowRight,
  openModal: AppWindow,
  closeModal: X,
  reset: RotateCcw,
  setState: Variable,
  toast: MessageSquare,
  openUrl: ExternalLink,
  openFile: FileDown,
} as const;

const dialogOpen = ref(false);
const editingIndex = ref(-1);
const editRef = ref<InstanceType<typeof ActionEdit> | null>(null);

function summary(action: AppAction): string {
  switch (action.type) {
    case 'run':
      return action.refresh ? `${action.runnable} · ${t('builder.actionEdit.refreshShort')}` : action.runnable;
    case 'navigate':
      return props.pages.find((p) => p.id === action.page)?.name ?? action.page;
    case 'openModal': {
      const name = props.pages.find((p) => p.id === action.page)?.name ?? action.page;
      return action.display === 'drawer' ? `${name} · ${t('builder.actionEdit.displays.drawer')}` : name;
    }
    case 'closeModal':
      return '';
    case 'reset':
      return action.component;
    case 'setState':
      return `state.${action.key}`;
    case 'toast':
      return action.message;
    case 'openUrl':
      return action.url;
    case 'openFile':
      return `${t(`builder.actionEdit.fileModes.${action.mode ?? 'open'}`)} · ${action.path}`;
  }
}

function open(index: number) {
  editingIndex.value = index;
  dialogOpen.value = true;
}

function onSubmit(action: AppAction) {
  const next = [...props.modelValue];
  if (editingIndex.value < 0) next.push(action);
  else next[editingIndex.value] = action;
  emit('update:modelValue', next);
  dialogOpen.value = false;
}

function remove(index: number) {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index)
  );
}
</script>

<template>
  <Dialog
    v-model="dialogOpen"
    :title="editingIndex < 0 ? t('builder.addAction') : t('builder.editAction')"
    :description="t('builder.actionDialogDescription', { event: label })"
  >
    <ActionEdit
      v-if="dialogOpen"
      ref="editRef"
      :action="editingIndex < 0 ? null : modelValue[editingIndex]"
      :pages="pages"
      :runnables="runnables"
      :components="components"
      :handler="handler"
      @submit="onSubmit"
    />
    <template #footer>
      <Button variant="outline" @click="dialogOpen = false">{{
        t('common.cancel')
      }}</Button>
      <Button :disabled="!editRef?.canSubmit" @click="editRef?.submit()">{{
        t('common.save')
      }}</Button>
    </template>
  </Dialog>

  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium">{{ label }}</span>
      <Button
        size="icon"
        variant="ghost"
        class="h-6 w-6"
        :title="t('builder.addAction')"
        @click="open(-1)"
      >
        <Plus class="w-3.5 h-3.5" />
      </Button>
    </div>
    <p
      v-if="modelValue.length === 0"
      class="text-xs text-muted-foreground italic m-0"
    >
      {{ t('builder.noActionsYet') }}
    </p>
    <div
      v-for="(action, index) in modelValue"
      :key="index"
      class="group/action flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
    >
      <component
        :is="ICONS[action.type]"
        class="w-3 h-3 shrink-0 text-muted-foreground"
      />
      <span class="shrink-0 text-muted-foreground">{{
        t(`builder.actionEdit.actionTypes.${action.type}`)
      }}</span>
      <span class="truncate flex-1">{{ summary(action) }}</span>
      <button
        class="opacity-0 group-hover/action:opacity-100"
        :title="t('common.edit')"
        @click="open(index)"
      >
        <Pencil class="w-3 h-3" />
      </button>
      <button
        class="opacity-0 group-hover/action:opacity-100"
        :title="t('builder.deleteAction')"
        @click="remove(index)"
      >
        <Trash2 class="w-3 h-3 text-destructive" />
      </button>
    </div>
  </div>
</template>
