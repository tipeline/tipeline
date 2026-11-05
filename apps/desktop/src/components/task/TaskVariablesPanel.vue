<script setup lang="ts">
import { ref, computed, reactive, type PropType } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import Dialog from '@/components/Dialog.vue';
import NewVariableForm from '@/components/forms/NewVariableForm.vue';
import EditVariableForm from '@/components/forms/EditVariableForm.vue';
import { Button } from '@/components/ui/button';
import { useIcon } from '@/composables/useIcon';
const { getIconComponent } = useIcon();
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Braces, // object
  Brackets, // array
  Hash, // number
  Type, // string
  ToggleLeft, // boolean
  Circle, // null/undefined
  ChevronRight,
  Globe, // for global variables
  Code2, // for task variables
  Calendar, // date
  Monitor, // browser
  Server, // sshConnection
  Database, // dbConnection
  Sheet, // workbook
  KeyRound, // oauthToken
  Image, // image
  AudioLines, // audio
  Video, // video
  Link, // env/global-sourced
  ArrowRightFromLine, // output
  TriangleAlert, // private output
} from 'lucide-vue-next';
import { isExternallySourced } from '@tipeline/schemas';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buildVariableUsageIndex } from '@/utils/variableUsage';

type NewVariableFormInstance = InstanceType<typeof NewVariableForm>;
type EditVariableFormInstance = InstanceType<typeof EditVariableForm>;
const newVariableFormRef = ref<NewVariableFormInstance | null>(null);
const editVariableFormRef = ref<EditVariableFormInstance | null>(null);

const VARIABLE_TYPE_LABELS: Record<string, string> = {
  object: 'Object',
  array: 'Array',
  number: 'Number',
  string: 'String',
  boolean: 'Boolean',
  date: 'Date',
  browser: 'Browser',
  sshConnection: 'SSH Connection',
  dbConnection: 'Database Connection',
  workbook: 'Workbook',
  oauthToken: 'OAuth Token',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
};
function getVariableTypeLabel(type: any): string {
  return VARIABLE_TYPE_LABELS[type] || type;
}

function variableSourceLabel(variable: any): string | null {
  if (variable.valueFromEnv) return t('tasks.builder.variablesPanel.tooltip.sourceEnv', { key: variable.valueFromEnv });
  if (variable.valueFromGlobal) return t('tasks.builder.variablesPanel.tooltip.sourceGlobal', { name: variable.valueFromGlobal });
  return null;
}

const getVariableIcon = (type: any) => {
  const icons: Record<string, any> = {
    object: Braces,
    array: Brackets,
    number: Hash,
    string: Type,
    boolean: ToggleLeft,
    date: Calendar,
    browser: Monitor,
    sshConnection: Server,
    dbConnection: Database,
    workbook: Sheet,
    oauthToken: KeyRound,
    image: Image,
    audio: AudioLines,
    video: Video,
    null: Circle,
    undefined: Circle,
  };
  return icons[type] || Circle;
};

// Visibility defaults to private, same as the variable forms. The type icon's tile
// carries it: green public, blue protected, plain grey private.
function variableVisibility(variable: any): 'public' | 'protected' | 'private' {
  return variable.visibility ?? 'private';
}

const VISIBILITY_TILE_CLASSES: Record<string, string> = {
  public: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  protected: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  private: 'bg-sidebar-accent text-muted-foreground',
};

// Same rule as the warning in the variable forms: a private output isn't returned.
function isPrivateOutput(variable: any): boolean {
  return !!variable.output && variableVisibility(variable) === 'private';
}

function displayValue(variable: any) {
  if (isExternallySourced(variable)) {
    return variable.valueFromEnv ? `env: ${variable.valueFromEnv}` : `global: ${variable.valueFromGlobal}`;
  }
  if (variable.secret && variable.value != null && variable.value !== '') return '••••••••';
  return variable.value;
}

const { t } = useI18n();

const selectedVariable = ref();
const taskOpen = ref(true);
const globalOpen = ref(false);

const props = defineProps({
  modelValue: {
    type: Array as PropType<any[]>,
    required: true,
    default: () => [],
  },
  globalVariables: {
    type: Array as PropType<any[]>,
    default: () => [],
  },
  // The task's own pipeline actions — used only to compute which variables
  // are referenced where, so delete can warn instead of silently breaking
  // an action. Not required: callers that don't pass it just skip the check.
  actions: {
    type: Array as PropType<any[]>,
    default: () => [],
  },
  showNew: Boolean,
  isDebug: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    default: undefined,
  },
});

// Derived, not maintained: recomputes from `actions` whenever the pipeline
// changes, so there's no separate index to keep in sync by hand.
const usageIndex = computed(() => buildVariableUsageIndex(props.actions));
function usageCount(variable: any): number {
  return usageIndex.value.get(variable.name)?.length ?? 0;
}

const resolvedLabel = computed(() => props.label ?? t('tasks.builder.variablesPanel.taskLabel'));

const emit = defineEmits(['update:modelValue', 'update:showNew', 'save']);

const isNewVariableFormDialogOpen = computed({
  get: () => props.showNew,
  set: (value) => emit('update:showNew', value),
});

const isEditVariableFormDialogOpen = ref(false);

function openEditVariableFormDialog(variable: any) {
  console.log('openEditVariableFormDialog', variable);
  selectedVariable.value = variable;
  isEditVariableFormDialogOpen.value = true;
}

// Global variables aren't part of `modelValue`, so `onDelete` (which only
// filters the task's own variable array) can't touch them — hide the button
// rather than show a delete action that silently does nothing.
const isSelectedVariableGlobal = computed(() =>
  props.globalVariables.some((v: any) => v.name === selectedVariable.value?.name)
);

const handleSubmit = (payload: any) => {
  // Search if the variable does not exists
  const entry = props.modelValue.find(
    (variable: any) => variable.name === payload.name
  );

  // A duplicate should already be blocked by the form's own validation —
  // this is a defense-in-depth guard, so surface it instead of silently
  // dropping the submission and closing the dialog as if it succeeded.
  if (entry) {
    toast.error(t('tasks.builder.variablesPanel.duplicateVariableName', { name: payload.name }));
    return;
  }

  const variablesCopy = [...props.modelValue];
  const reactivePayload = reactive({ ...payload });
  const mergedVariables = [...variablesCopy, reactivePayload];

  // Updates the parent source model with the new set of variables
  emit('update:modelValue', mergedVariables);

  // Saves the source in the database with the new variable updates
  emit('save');

  isNewVariableFormDialogOpen.value = false;
};

const handleSubmitEdit = (payload: any) => {
  // Search if the variable exists
  const entryIndex = props.modelValue.findIndex(
    (variable: any) => variable.name === payload.name
  );

  // If the variable exists, update it
  if (entryIndex !== -1) {
    const variablesCopy = [...props.modelValue];
    // Merge onto the existing variable — the edit dialog only knows about a
    // subset of fields, so a full replace would silently drop things like
    // valueFromEnv/valueFromGlobal/secret/scope.
    variablesCopy[entryIndex] = { ...variablesCopy[entryIndex], ...payload };

    // Updates the parent source model with the updated variables
    emit('update:modelValue', variablesCopy);

    // Saves the source in the database with the variable updates
    emit('save');
  }

  isEditVariableFormDialogOpen.value = false;
};

// Single-slot undo buffer, same shape/lifetime as the one in
// TaskPipelineCanvas.vue's action delete: in-memory only, dies with this
// component (e.g. navigating away from the task).
const lastDeletedVariable = ref<{ snapshot: any[] } | null>(null);
const UNDO_DELETE_VARIABLE_TOAST_ID = 'task-variable-delete-undo';

function onDelete(variable: any) {
  const snapshot = [...props.modelValue];

  // Gets all the variable except the one I will to delete
  const mergedVariables = props.modelValue.filter((v: any) => v.name !== variable.name);

  // Updates the parent source model with the new set of variables
  emit('update:modelValue', mergedVariables);

  // Saves the source in the database with the new variable updates
  emit('save');

  lastDeletedVariable.value = { snapshot };
  toast(t('tasks.builder.variablesPanel.variableDeleted'), {
    id: UNDO_DELETE_VARIABLE_TOAST_ID,
    duration: 5000,
    action: {
      label: t('tasks.builder.variablesPanel.undo'),
      onClick: onUndoDeleteVariable,
    },
  });
}

function onDeleteFromEdit() {
  if (!selectedVariable.value) return;
  isEditVariableFormDialogOpen.value = false;
  requestDelete(selectedVariable.value);
}

// Only interrupts when the variable is actually referenced somewhere —
// deleting an unused variable keeps the existing instant-delete-with-undo
// flow below unchanged.
const pendingDeleteVariable = ref<any | null>(null);
const isUsageWarningOpen = ref(false);
const pendingDeleteUsages = computed(() => {
  if (!pendingDeleteVariable.value) return [];
  return usageIndex.value.get(pendingDeleteVariable.value.name) ?? [];
});

function requestDelete(variable: any) {
  if (usageCount(variable) > 0) {
    pendingDeleteVariable.value = variable;
    isUsageWarningOpen.value = true;
    return;
  }
  onDelete(variable);
}

function confirmDeleteAnyway() {
  if (pendingDeleteVariable.value) onDelete(pendingDeleteVariable.value);
  isUsageWarningOpen.value = false;
  pendingDeleteVariable.value = null;
}

function onUndoDeleteVariable() {
  if (!lastDeletedVariable.value) return;
  emit('update:modelValue', lastDeletedVariable.value.snapshot);
  emit('save');
  lastDeletedVariable.value = null;
}

// function onEdit(variable: any) {
//   console.log('onEdit', variable);
//   isEditVariableFormDialogOpen.value = true;
// }

function onClose() {
  isNewVariableFormDialogOpen.value = false;
  isEditVariableFormDialogOpen.value = false;
}
</script>

<template>
  <Dialog
    v-model="isNewVariableFormDialogOpen"
    :title="t('tasks.builder.variablesPanel.newVariable')"
    :description="t('tasks.builder.variablesPanel.newVariableDescription')"
  >
    <NewVariableForm
      @close="onClose"
      ref="newVariableFormRef"
      @onSubmit="handleSubmit"
      :variables="modelValue"
    />

    <template #footer>
      <Button @click="newVariableFormRef?.submit()">{{ t('variable.form.create') }}</Button>
    </template>
  </Dialog>

  <Dialog
    v-model="isEditVariableFormDialogOpen"
    :title="t('tasks.builder.variablesPanel.editVariable')"
    :description="t('tasks.builder.variablesPanel.editVariableDescription')"
  >
    <EditVariableForm
      @close="onClose"
      ref="editVariableFormRef"
      @onSubmit="handleSubmitEdit"
      :variables="modelValue"
      :selectedVariable="selectedVariable"
    />

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <Button @click="editVariableFormRef?.submit()">{{ t('variable.saveChanges') }}</Button>
        <Button
          v-if="!isSelectedVariableGlobal"
          variant="outline"
          class="ml-auto text-destructive hover:text-destructive"
          @click="onDeleteFromEdit"
        >
          <component :is="getIconComponent('Trash')" class="size-4" />
          {{ t('tasks.builder.variablesPanel.delete') }}
        </Button>
      </div>
    </template>
  </Dialog>

  <AlertDialog v-model:open="isUsageWarningOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ t('tasks.builder.variablesPanel.usageWarning.title', { name: pendingDeleteVariable?.name }) }}
        </AlertDialogTitle>
        <AlertDialogDescription as-child>
          <div class="space-y-2">
            <p>
              {{ t('tasks.builder.variablesPanel.usageWarning.description', { count: pendingDeleteUsages.length }) }}
            </p>
            <ul class="list-disc pl-5 text-sm text-foreground">
              <li v-for="(usage, index) in pendingDeleteUsages" :key="index">{{ usage.label }}</li>
            </ul>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('tasks.builder.variablesPanel.usageWarning.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          @click="confirmDeleteAnyway"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {{ t('tasks.builder.variablesPanel.usageWarning.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <div class="space-y-3">
    <!-- Task Variables Section -->
    <Collapsible v-model:open="taskOpen" class="w-full">
      <CollapsibleTrigger
        class="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors group"
      >
        <div class="flex items-center gap-2">
          <Code2 class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-sm font-medium">{{ resolvedLabel }}</span>
          <span v-if="modelValue.length" class="text-xs text-muted-foreground">
            ({{ modelValue.length }})
          </span>
        </div>
        <ChevronRight
          class="h-4 w-4 text-muted-foreground transition-transform duration-200"
          :class="{ 'rotate-90': taskOpen }"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="mt-1 space-y-0.5 pl-5">
          <button
            v-for="variable in modelValue"
            :key="variable.name"
            @click="openEditVariableFormDialog(variable)"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent text-sm group/item transition-colors"
          >
            <span
              class="size-5 rounded-[5px] grid place-items-center shrink-0"
              :class="VISIBILITY_TILE_CLASSES[variableVisibility(variable)]"
            >
              <component :is="getVariableIcon(variable.type)" class="size-3" />
            </span>
            <Tooltip :delay-duration="400">
              <TooltipTrigger as-child>
                <span
                  class="flex-1 min-w-0 text-left truncate"
                  :class="{ 'text-muted-foreground': actions.length > 0 && usageCount(variable) === 0 }"
                >
                  {{ variable.label || variable.name
                  }}<span v-if="variable.required" class="ml-px font-medium text-destructive">*</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" align="start" class="max-w-xs">
                <div class="space-y-1">
                  <p class="font-medium">{{ variable.label || variable.name }}</p>
                  <p v-if="variable.label" class="text-primary-foreground/70">{{ variable.name }}</p>
                  <p class="text-primary-foreground/70">
                    {{ t('tasks.builder.variablesPanel.tooltip.type') }}: {{ getVariableTypeLabel(variable.type) }}
                  </p>
                  <p class="text-primary-foreground/70">
                    {{ t(`variable.form.${variableVisibility(variable)}`) }}:
                    {{ t(`variable.form.${variableVisibility(variable)}Description`) }}
                  </p>
                  <p v-if="variable.required" class="text-primary-foreground/70">
                    {{ t('tasks.builder.variablesPanel.tooltip.required') }}
                  </p>
                  <p v-if="variable.output" class="text-primary-foreground/70">{{ t('variable.form.output') }}</p>
                  <p v-if="variable.secret" class="text-primary-foreground/70">{{ t('variable.form.secret') }}</p>
                  <p v-if="variableSourceLabel(variable)" class="text-primary-foreground/70">
                    {{ variableSourceLabel(variable) }}
                  </p>
                  <p v-if="actions.length > 0" class="text-primary-foreground/70">
                    {{
                      usageCount(variable) > 0
                        ? t('tasks.builder.variablesPanel.usedInPlaces', { count: usageCount(variable) })
                        : t('tasks.builder.variablesPanel.notUsed')
                    }}
                  </p>
                  <p v-if="isPrivateOutput(variable)">{{ t('variable.form.outputPrivateWarning') }}</p>
                  <p v-if="variable.description">{{ variable.description }}</p>
                </div>
              </TooltipContent>
            </Tooltip>
            <!-- Flags and the use count swap for the value on hover. -->
            <span class="flex items-center gap-1 shrink-0 text-muted-foreground group-hover/item:hidden">
              <TriangleAlert
                v-if="isPrivateOutput(variable)"
                class="size-3 text-amber-600 dark:text-amber-400"
                :aria-label="t('variable.form.outputPrivateWarning')"
              />
              <ArrowRightFromLine v-if="variable.output" class="size-3" :aria-label="t('variable.form.output')" />
              <KeyRound v-if="variable.secret" class="size-3" :aria-label="t('variable.form.secret')" />
              <Link
                v-if="isExternallySourced(variable)"
                class="size-3"
                :aria-label="variableSourceLabel(variable) ?? undefined"
              />
            </span>
            <span
              v-if="actions.length > 0"
              class="min-w-5.5 h-4.5 px-1.5 rounded-full grid place-items-center shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground group-hover/item:hidden"
              :class="usageCount(variable) > 0 ? 'bg-sidebar-accent' : 'border border-dashed border-border'"
              :aria-label="
                usageCount(variable) > 0
                  ? t('tasks.builder.variablesPanel.usedInPlaces', { count: usageCount(variable) })
                  : t('tasks.builder.variablesPanel.notUsed')
              "
            >
              {{ usageCount(variable) }}
            </span>
            <span
              class="hidden group-hover/item:block max-w-20 shrink-0 text-xs text-muted-foreground text-right truncate"
            >
              {{ displayValue(variable) }}
            </span>
            <DropdownMenu v-if="!isDebug">
              <DropdownMenuTrigger @click.stop @mousedown.stop>
                <component
                  :is="getIconComponent(`EllipsisVertical`)"
                  class="size-4 text-muted-foreground opacity-0 group-hover/item:opacity-100 transition-opacity"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{{ t('tasks.builder.variablesPanel.actions') }}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  @click="openEditVariableFormDialog(variable)"
                  class="cursor-pointer"
                >
                  <component :is="getIconComponent(`SquarePen`)" class="size-5" />
                  {{ t('tasks.builder.variablesPanel.edit') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  @click="requestDelete(variable)"
                  class="cursor-pointer text-red-500 focus:text-red-500"
                >
                  <component :is="getIconComponent(`Trash`)" class="size-5" />
                  {{ t('tasks.builder.variablesPanel.delete') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </button>

          <div
            v-if="!modelValue.length"
            class="px-2 py-2 text-sm text-muted-foreground"
          >
            {{ t('tasks.builder.variablesPanel.noTaskVariables') }}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>

    <!-- Global Variables Section -->
    <Collapsible v-model:open="globalOpen" class="w-full">
      <CollapsibleTrigger
        class="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors group"
      >
        <div class="flex items-center gap-2">
          <Globe class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-sm font-medium">{{ t('tasks.builder.variablesPanel.globalVariables') }}</span>
          <span
            v-if="globalVariables.length"
            class="text-xs text-muted-foreground"
          >
            ({{ globalVariables.length }})
          </span>
        </div>
        <ChevronRight
          class="h-4 w-4 text-muted-foreground transition-transform duration-200"
          :class="{ 'rotate-90': globalOpen }"
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div class="mt-1 space-y-0.5 pl-5">
          <button
            v-for="variable in globalVariables"
            :key="variable.name"
            @click="openEditVariableFormDialog(variable)"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent text-sm group/item transition-colors"
          >
            <span
              class="size-5 rounded-[5px] grid place-items-center shrink-0 bg-sidebar-accent text-muted-foreground"
            >
              <component :is="getVariableIcon(variable.type)" class="size-3" />
            </span>
            <Tooltip :delay-duration="400">
              <TooltipTrigger as-child>
                <span class="flex-1 min-w-0 text-left truncate">
                  {{ variable.name }}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" align="start" class="max-w-xs">
                <div class="space-y-1">
                  <p class="font-medium">{{ variable.name }}</p>
                  <p class="text-primary-foreground/70">
                    {{ t('tasks.builder.variablesPanel.tooltip.type') }}: {{ getVariableTypeLabel(variable.type) }}
                  </p>
                  <p v-if="variable.output" class="text-primary-foreground/70">{{ t('variable.form.output') }}</p>
                  <p v-if="variableSourceLabel(variable)" class="text-primary-foreground/70">
                    {{ variableSourceLabel(variable) }}
                  </p>
                  <p v-if="variable.description">{{ variable.description }}</p>
                </div>
              </TooltipContent>
            </Tooltip>
            <span class="w-16 shrink-0 text-xs text-muted-foreground text-right truncate opacity-0 group-hover/item:opacity-100 transition-opacity">
              {{ displayValue(variable) }}
            </span>
          </button>

          <div
            v-if="!globalVariables.length"
            class="px-2 py-2 text-sm text-muted-foreground"
          >
            {{ t('tasks.builder.variablesPanel.noGlobalVariables') }}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>

<style scoped>
/* Keep animations smooth */
.rotate-90 {
  transform: rotate(90deg);
}
</style>
