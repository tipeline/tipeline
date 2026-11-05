<script setup lang="ts">
import { ref, watch, toRaw, computed, provide, inject, defineComponent } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useActionT } from '@/composables/useActionT';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { z } from 'zod';
import { useFieldValue, useSetFieldValue } from 'vee-validate';
import { ListTree } from 'lucide-vue-next';
import { html as htmlLang } from '@codemirror/lang-html';
import { json as jsonLang } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { useColorMode } from '@vueuse/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import AutoForm from '@/components/ui/auto-form/AutoForm.vue';
import AutoFormField from '@/components/ui/auto-form/AutoFormField.vue';
import DateStringInput from '@/components/ui/auto-form/DateStringInput.vue';
import AutoFormCodeMirrorEditor from '@/components/ui/auto-form/AutoFormCodeMirrorEditor.vue';
import { getValidation, coreValidations, isCacheableAction } from '@tipeline/schemas';
import StepCacheField from '@/components/task/StepCacheField.vue';
import type { Dependency } from '@/components/ui/auto-form/interface';
import { preprocessParams, pluginActionHasErrors } from '@/utils/flowValidation';
import {
  conditionCompareToField,
  conditionDependencies,
  operatorAfterTypeChange,
} from '@/utils/conditionForm';
import { usePluginStore } from '@/store/pluginStore';
import type { PluginParamDef } from '@/store/pluginStore';
import { useTaskStore } from '@/store/task';
import { toast } from '@/components/ui/sonner';

const pluginStore = usePluginStore();
const taskStore = useTaskStore();
const router = useRouter();
const { t } = useI18n();
const { tAction, tActionDescription, tFieldConfig } = useActionT();

const navigateToSubtask = inject<(taskIdentifier: string, returnActionId: string) => void>(
  'navigateToSubtask',
  () => {}
);

const schema = ref();
const fieldConfig = ref();
const returns = ref<string | undefined>(undefined);
const builtinDescription = ref<string>('');
const destination = ref<string>('');
const createNewVariable = ref(false);
const newVariableName = ref<string>('');
const comment = ref<string>('');
const onError = ref<'throw' | 'continue'>('throw');
// The step's cache TTL ('' = off). Only offered for steps that can be cached.
const cacheTtl = ref<string>('');
const isPluginAction = ref(false);
// Root element of the built-in-action <AutoForm>, used to trigger a native
// form submission from the Cmd+S shortcut below (this re-runs vee-validate's
// own validation, same as clicking the Save button).
const autoFormRef = ref<{ $el?: HTMLFormElement } | null>(null);
const pluginParamDefs = ref<PluginParamDef[]>([]);
const pluginParamValues = ref<Record<string, any>>({});
// Code-editor params whose saved value was an object, shown as JSON text.
const jsonTextParams = new Set<string>();
const isCodeEditorParam = (def: PluginParamDef) => def.type === 'html' || def.component === 'textarea';

const colorMode = useColorMode();
const htmlEditorExtensions = computed(() => [
  htmlLang(),
  EditorView.lineWrapping,
  ...(colorMode.value === 'dark' ? [oneDark] : []),
]);
// Plugin fields with component: 'textarea' hold free-form text, not
// necessarily JSON (e.g. a plugin might use it for a raw string body) — JSON
// language mode still gives useful syntax highlighting/bracket-matching for
// the common case without rejecting non-JSON input, since CodeMirror's
// language support only affects highlighting, never validates/blocks input.
const textareaEditorExtensions = computed(() => [
  jsonLang(),
  EditorView.lineWrapping,
  ...(colorMode.value === 'dark' ? [oneDark] : []),
]);

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  actionParams: {
    type: Object,
  },
  variables: {
    type: Array,
    default: () => [],
  },
  globalVariables: {
    type: Array,
    default: () => [],
  },
  isNew: {
    type: Boolean,
    default: false,
  },
  taskIdentifier: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(['update:open', 'handleSave', 'cancel']);

// Global variables are addressed as `_global.<name>` — the same prefix the engine
// reads (`{= _global.x =}`) and writes (`destination: _global.x`) — so pipeline
// authors pick "_global.googleGmailToken" here without needing to know the syntax.
const variableOptions = computed(() => [
  ...(props.variables as any[]).map((v: any) => ({ name: v.name, type: v.type })),
  ...(props.globalVariables as any[]).map((v: any) => ({ name: `_global.${v.name}`, type: v.type })),
]);

// The "identifier" field's live value lives inside vee-validate's <Form>
// (rendered by <AutoForm>), so it isn't visible to props.actionParams until
// the form is submitted. This bridge component is rendered inside the form
// (see customAutoForm slot below) purely to mirror that live value out here,
// so the "open subtask builder" link reflects an in-progress dropdown change
// immediately instead of only the last-saved target.
const liveSubtaskIdentifier = ref<string | undefined>(undefined);
// Distinguishes "form not mounted yet, nothing live to report" from "the
// user actively cleared the field" — both look like an empty string/undefined
// on liveSubtaskIdentifier, but only the former should fall back to the
// last-saved identifier.
const liveValueReady = ref(false);
const SubtaskIdentifierBridge = defineComponent({
  emits: ['change'],
  setup(_, { emit }) {
    const value = useFieldValue<string | undefined>('identifier');
    watch(value, (v) => emit('change', v), { immediate: true });
    return () => null;
  },
});

// Changing "Compare as" keeps the operator only if the new type has it; otherwise the
// operator is cleared so the (now filtered) dropdown asks for a new one.
const ConditionTypeBridge = defineComponent({
  setup() {
    const compareAs = useFieldValue<string | undefined>('compareAs');
    const operator = useFieldValue<string | undefined>('operator');
    const setOperator = useSetFieldValue<string | undefined>('operator');
    watch(compareAs, (type) => {
      const kept = operatorAfterTypeChange(type, operator.value);
      if (kept !== operator.value) setOperator(kept);
    });
    return () => null;
  },
});

function onLiveIdentifierChange(value: string | undefined) {
  liveSubtaskIdentifier.value = value;
  liveValueReady.value = true;
}

// Only path-based subtasks (no identifier) have nothing to route to.
const subtaskTargetIdentifier = computed(() => {
  if (props.actionParams?.group !== 'subtask') return undefined;
  if (liveValueReady.value) return liveSubtaskIdentifier.value || undefined;
  return props.actionParams?.params?.identifier || undefined;
});

function openSubtaskBuilder() {
  if (!subtaskTargetIdentifier.value || !props.actionParams?.identifier) return;
  emit('update:open', false);
  navigateToSubtask(subtaskTargetIdentifier.value, props.actionParams.identifier);
}

// Invoked by AutoFormFieldTaskSelect right after it creates a new task from
// the subtask picker's "Create new task" option. That field component has no
// access to this action's own params object, so it hands the new task's
// identifier back here to actually persist it (openSubtaskBuilder above only
// navigates off the picker's live value — it never writes into actionParams,
// since it's meant for a subtask reference that was already saved earlier).
function onSubtaskCreated(newTaskIdentifier: string) {
  if (!props.actionParams?.identifier) return;
  emit('update:open', false);
  props.actionParams.params = { ...toRaw(props.actionParams.params), identifier: newTaskIdentifier };
  emit('handleSave');
  navigateToSubtask(newTaskIdentifier, props.actionParams.identifier);
}

provide('onSubtaskCreated', onSubtaskCreated);

const destinationVariables = computed(() =>
  returns.value && returns.value !== 'any'
    ? variableOptions.value.filter((v) => v.type === returns.value)
    : variableOptions.value
);

// Lowest unused "<type><n>" name (e.g. "browser", then "browser1", "browser2"…)
// scoped to task variables only — the pool a newly created variable joins.
function suggestVariableName(type: string, existing: { name: string }[]): string {
  const taken = new Set(existing.map((v) => v.name));
  if (!taken.has(type)) return type;
  let n = 1;
  while (taken.has(`${type}${n}`)) n++;
  return `${type}${n}`;
}

function onToggleCreateNewVariable(checked: boolean | 'indeterminate') {
  createNewVariable.value = checked === true;
  if (createNewVariable.value && returns.value && returns.value !== 'any') {
    newVariableName.value = suggestVariableName(returns.value, props.variables as any[]);
  }
}

// Lets `variable-select` AutoForm fields (e.g. a loop's indexVariable/currentItem)
// offer an inline "create new variable" checkbox, mirroring the destination
// flow above: creation is deferred to handleSubmit so cancelling the dialog
// never leaves an orphaned variable behind in props.variables (the live task
// state, not a draft copy). Keyed by fieldName since a form can have more than
// one variable-select field (e.g. forEachLoop's currentItem + indexVariable).
const pendingVariableCreations = ref(new Map<string, { name: string; type: string }>());

function suggestTaskVariableName(type: string, base?: string): string {
  const existing = [
    ...(props.variables as any[]),
    ...Array.from(pendingVariableCreations.value.values()),
  ];
  return suggestVariableName(base ?? type, existing);
}

function registerPendingVariable(fieldName: string, name: string, type: string) {
  pendingVariableCreations.value.set(fieldName, { name, type });
}

function unregisterPendingVariable(fieldName: string) {
  pendingVariableCreations.value.delete(fieldName);
}

provide('suggestTaskVariableName', suggestTaskVariableName);
provide('registerPendingVariable', registerPendingVariable);
provide('unregisterPendingVariable', unregisterPendingVariable);

// Cleared whenever the dialog closes — on Save, pending creations were already
// pushed into props.variables earlier in handleSubmit; on Cancel, they were
// never pushed at all, so there's nothing to discard but the bookkeeping.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) pendingVariableCreations.value.clear();
  }
);

// True when the action's params satisfy its creation schema.
// Used to prevent closing when a freshly dropped action hasn't been configured yet.
const isParamsValid = computed(() => {
  if (!props.actionParams) return true;
  if (props.actionParams.source === 'plugin') return true; // plugin — no core schema to validate against
  try {
    const validator = getValidation(props.actionParams.group, props.actionParams.name, 'creation');
    return validator.schema.safeParse(preprocessParams(props.actionParams.params ?? {})).success;
  } catch {
    return true; // plugin or unknown action — no schema to validate against
  }
});

// The dialog's own autofocus skips the text fields (they're contenteditable, see
// ExpressionInput) and lands on the first field's `{}` button: put focus in the first
// field instead, so typing and Escape work right away.
function focusFirstField(event: Event) {
  const content = event.target as HTMLElement | null;
  const field = content?.querySelector<HTMLElement>(
    'form [contenteditable="plaintext-only"], form [contenteditable="true"], form input:not([type="hidden"]):not([disabled]), form textarea, form select'
  );
  if (!field) return;
  event.preventDefault();
  field.focus();
}

function handleOpenChange(newOpen: boolean) {
  if (!newOpen && props.isNew && !isParamsValid.value) {
    // X / Escape / backdrop on an unconfigured new action = cancel → remove the item
    emit('cancel');
    return;
  }
  emit('update:open', newOpen);
}

provide('taskVariables', variableOptions);
provide('taskIdentifier', props.taskIdentifier);

const pluginHasErrors = computed(() => {
  if (!props.actionParams) return false;
  const rules = pluginStore.getActionRules(props.actionParams.group, props.actionParams.name);
  return pluginActionHasErrors(pluginParamValues.value, pluginParamDefs.value, rules);
});

const handlePluginSubmit = () => {
  if (pluginHasErrors.value) return;
  const coerced: Record<string, any> = {};
  for (const def of pluginParamDefs.value) {
    const val = pluginParamValues.value[def.name];
    if (def.type === 'number') {
      coerced[def.name] = val === '' || val === undefined ? (def.default ?? 0) : Number(val);
    } else if (jsonTextParams.has(def.name) && typeof val === 'string') {
      // Opened as a map/list → save it back as one while it's still valid JSON.
      try {
        const parsed = JSON.parse(val);
        coerced[def.name] = parsed !== null && typeof parsed === 'object' ? parsed : val;
      } catch {
        coerced[def.name] = val;
      }
    } else {
      coerced[def.name] = val;
    }
  }
  handleSubmit(coerced);
};

const handleSubmit = (data: any) => {
  if (!isPluginAction.value && props.actionParams) {
    try {
      const validator = getValidation(props.actionParams.group, props.actionParams.name, 'creation');
      if (!validator.schema.safeParse(preprocessParams(data)).success) return;
    } catch { /* plugin action */ }
  }

  if (
    props.actionParams?.group === 'subtask' &&
    data.identifier &&
    data.identifier === taskStore.currentTask?.identifier
  ) {
    toast.error(t('actionEdit.subtaskSelfReferenceError'));
    return;
  }

  if (createNewVariable.value && returns.value && returns.value !== 'any') {
    const trimmedName = newVariableName.value.trim();
    if (!coreValidations.varObject.variableNameSchema.safeParse(trimmedName).success) {
      toast.error(t('actionEdit.newVariableInvalidName'));
      return;
    }
    if ((props.variables as any[]).some((v: any) => v.name === trimmedName)) {
      toast.error(t('actionEdit.newVariableDuplicateName'));
      return;
    }
    (props.variables as any[]).push({
      name: trimmedName,
      type: returns.value,
      secret: false,
      readonly: false,
      visibility: 'private',
    });
    destination.value = trimmedName;
  }

  for (const pending of pendingVariableCreations.value.values()) {
    const trimmedName = pending.name.trim();
    if (!coreValidations.varObject.variableNameSchema.safeParse(trimmedName).success) {
      toast.error(t('actionEdit.newVariableInvalidName'));
      return;
    }
    if ((props.variables as any[]).some((v: any) => v.name === trimmedName)) {
      toast.error(t('actionEdit.newVariableDuplicateName'));
      return;
    }
    (props.variables as any[]).push({
      name: trimmedName,
      type: pending.type,
      secret: false,
      readonly: false,
      visibility: 'private',
    });
  }

  emit('update:open', false);
  if (props.actionParams) {
    props.actionParams.params = { ...toRaw(props.actionParams.params), ...data };
    props.actionParams.destination = (returns.value === undefined || destination.value === '__none__') ? '' : destination.value;
    props.actionParams.comment = comment.value.trim() || undefined;
    props.actionParams.onError = onError.value === 'throw' ? undefined : onError.value;
    // Keeps a `key` written in YAML; the TTL is all the builder edits.
    props.actionParams.cache =
      stepCacheable.value && cacheTtl.value
        ? { ...(toRaw(props.actionParams.cache) ?? {}), ttl: cacheTtl.value }
        : undefined;

    try {
      const runtimeSchema = getValidation(props.actionParams.group, props.actionParams.name, 'runtime')?.schema;
      if (
        runtimeSchema instanceof z.ZodObject &&
        'actions' in runtimeSchema.shape &&
        !('actions' in props.actionParams.params)
      ) {
        props.actionParams.params.actions = [];
      }
    } catch {
      // Plugin action — no runtime schema, skip actions initialization
    }
  }
  emit('handleSave');
};

useKeyboardShortcuts([
  {
    // Not skipWhenEditable: should save even while a field/textarea inside
    // the modal has focus, same rationale as the builder's other Save
    // shortcuts. requestSubmit() re-runs vee-validate's validation, so an
    // invalid built-in form surfaces its errors instead of silently no-oping.
    key: 's',
    meta: true,
    enabled: () => props.open,
    handler: () => {
      if (isPluginAction.value) {
        handlePluginSubmit();
      } else {
        autoFormRef.value?.$el?.requestSubmit?.();
      }
    },
  },
]);

watch(
  [() => props.open, () => props.actionParams],
  ([open, actionParams]) => {
    if (actionParams && open) {
      liveValueReady.value = false;
      const rawValue = toRaw(actionParams);

      const resolveAsPlugin = () => {
        schema.value = null;
        fieldConfig.value = null;
        builtinDescription.value = '';
        // Plugins have no Zod schema, but may still declare a return type via
        // their own `returns` export (see PluginReturnsRegistry) — fall back
        // to 'any' only when they haven't, same as other unpredictable-return
        // built-ins (script, subtask, ...): 'any' still lets the user pick a
        // destination instead of hiding the field and forcing handleSubmit to
        // wipe it on every save.
        returns.value = pluginStore.getActionReturns(actionParams.group, actionParams.name);
        isPluginAction.value = true;

        const defs = pluginStore.getActionDefs(actionParams.group, actionParams.name);
        pluginParamDefs.value = defs;
        const initial: Record<string, any> = {};
        jsonTextParams.clear();
        for (const def of defs) {
          const existing = rawValue?.params?.[def.name];
          // The code editor only takes text: a YAML map/list saved for a
          // textarea/html param (e.g. fillTemplate `values`) is shown as JSON.
          if (isCodeEditorParam(def) && existing !== null && typeof existing === 'object') {
            initial[def.name] = JSON.stringify(existing, null, 2);
            jsonTextParams.add(def.name);
            continue;
          }
          initial[def.name] = existing !== undefined ? existing : (def.default ?? (def.type === 'boolean' ? false : ''));
        }
        pluginParamValues.value = initial;
      };

      if (actionParams.source === 'plugin') {
        // Explicitly tagged — a same-named core group may exist, so never
        // attempt the core lookup at all (it could resolve to the wrong one).
        resolveAsPlugin();
      } else {
        try {
          const validator = getValidation(actionParams.group, actionParams.name, 'creation');
          fieldConfig.value = validator.fieldConfig;
          returns.value = validator.returns;
          schema.value = rawValue?.params && Object.keys(rawValue.params).length > 0
            ? validator.withDefaults(rawValue.params)
            : validator.schema;
          isPluginAction.value = false;
          builtinDescription.value = validator.description ?? '';
        } catch {
          resolveAsPlugin();
        }
      }

      destination.value = rawValue?.destination || '';
      createNewVariable.value = false;
      newVariableName.value = '';
      comment.value = rawValue?.comment || '';
      onError.value = rawValue?.onError === 'continue' ? 'continue' : 'throw';
      cacheTtl.value = rawValue?.cache?.ttl != null ? String(rawValue.cache.ttl) : '';
    }
  }
);

const stepCacheable = computed(() => {
  const action = props.actionParams;
  if (!action) return false;
  return isPluginAction.value
    ? pluginStore.isActionCacheable(action.group, action.name)
    : isCacheableAction(action.group, action.name);
});

const dialogTitle = computed(() => {
  if (!props.actionParams) return '';
  const translated = tAction(props.actionParams.group, props.actionParams.name);
  return translated || props.actionParams.name?.replace(/_/g, ' ');
});

const pluginActionDocs = computed(() => {
  if (!props.actionParams || !isPluginAction.value) return undefined;
  return pluginStore.getActionDocs(props.actionParams.group, props.actionParams.name);
});

// Distinguishes "this plugin genuinely takes no params" from "we have no
// params data because the plugin is currently disabled/missing" — both leave
// pluginParamDefs empty, but only the latter is an actionable problem.
const isPluginUnavailable = computed(() => {
  if (!props.actionParams || !isPluginAction.value) return false;
  return !pluginStore.enabledPluginGroups.includes(props.actionParams.group);
});

function goToPlugins() {
  emit('update:open', false);
  router.push('/plugins');
}

const dialogDescription = computed(() => {
  if (!props.actionParams) return '';
  if (isPluginAction.value) {
    return pluginActionDocs.value?.description || props.actionParams.group;
  }
  return (
    tActionDescription(props.actionParams.group, props.actionParams.name) ||
    builtinDescription.value ||
    props.actionParams.group
  );
});

// Extracts the variable name back out of a stored `{= name =}` reference so
// the picker can show the current selection; anything else (empty, a literal
// the user typed before this field existed) falls back to "none selected".
function variableRefName(value: any): string {
  if (typeof value !== 'string') return '__none__';
  const match = value.match(/^\{=\s*([\w.[\]]+)\s*=\}$/);
  return match ? match[1] : '__none__';
}

function setPluginVariableValue(def: PluginParamDef, name: string) {
  pluginParamValues.value[def.name] = name === '__none__' ? '' : `{= ${name} =}`;
}

const translatedFieldConfig = computed(() => {
  if (!props.actionParams || !fieldConfig.value) return fieldConfig.value;
  return tFieldConfig(props.actionParams.group, props.actionParams.name, fieldConfig.value);
});

// Conditions (If / ElseIf / Conditional Loop, array find/filter/…): the operator list
// follows "Compare as", and fields that don't apply are hidden (see conditionForm).
const conditionCompareTo = computed(() =>
  conditionCompareToField(props.actionParams?.group, props.actionParams?.name)
);

const formDependencies = computed<Dependency<any>[] | undefined>(() =>
  conditionCompareTo.value ? conditionDependencies(conditionCompareTo.value) : undefined
);
</script>

<template>
  <Dialog :open="props.open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-175 max-h-[90vh] flex flex-col" @open-auto-focus="focusFirstField">
      <DialogHeader class="shrink-0 flex-row items-center justify-between gap-4 space-y-0 pr-8">
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <Button
          v-if="subtaskTargetIdentifier"
          type="button"
          variant="outline"
          size="sm"
          class="border-violet-500/50 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 hover:text-violet-600 shrink-0"
          @click="openSubtaskBuilder"
        >
          <ListTree class="w-4 h-4" />
          {{ t('actionEdit.openSubtaskBuilder') }}
        </Button>
      </DialogHeader>

      <!-- Built-in action: schema-backed form -->
      <AutoForm
        v-if="!isPluginAction"
        ref="autoFormRef"
        :schema="schema"
        :field-config="translatedFieldConfig"
        :dependencies="formDependencies"
        @submit="handleSubmit"
        class="flex flex-col flex-1 min-h-0"
      >
        <template #customAutoForm="{ fields }">
          <div class="overflow-y-auto overflow-x-hidden flex-1 min-h-0 py-4 pr-2 space-y-6">
            <SubtaskIdentifierBridge
              v-if="actionParams?.group === 'subtask'"
              @change="onLiveIdentifierChange"
            />
            <ConditionTypeBridge v-if="conditionCompareTo" />
            <DialogDescription>{{ dialogDescription }}</DialogDescription>

            <AutoFormField
              v-for="(field, key) in fields"
              :key="key"
              :config="field.config"
              :field-name="field.fieldName"
              :shape="field.shape"
            />

            <div class="space-y-2">
              <Label>{{ t('actionEdit.comment') }} <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span></Label>
              <Textarea v-model="comment" :placeholder="t('actionEdit.commentPlaceholder')" rows="2" class="resize-none" />
            </div>

            <div v-if="returns !== undefined" class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <Label>{{ t('actionEdit.destination') }}</Label>
                <div v-if="returns !== 'any'" class="flex items-center gap-2">
                  <Checkbox
                    id="createNewVariableBuiltin"
                    :model-value="createNewVariable"
                    @update:model-value="onToggleCreateNewVariable"
                  />
                  <Label for="createNewVariableBuiltin" class="font-normal text-xs text-muted-foreground">
                    {{ t('actionEdit.createNewVariable') }}
                  </Label>
                </div>
              </div>
              <Input
                v-if="createNewVariable"
                v-model="newVariableName"
                :placeholder="t('actionEdit.newVariableNamePlaceholder')"
              />
              <Select v-else v-model="destination">
                <SelectTrigger class="w-full">
                  <SelectValue :placeholder="t('actionEdit.destinationNone')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{{ t('actionEdit.destinationNone') }}</SelectItem>
                  <SelectItem v-for="v in destinationVariables" :key="v.name" :value="v.name">
                    {{ v.name }}
                    <span class="ml-1 text-xs text-muted-foreground">({{ v.type }})</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-2">
              <Label>{{ t('actionEdit.onError') }}</Label>
              <Select v-model="onError">
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="throw">{{ t('actionEdit.onErrorThrow') }}</SelectItem>
                  <SelectItem value="continue">{{ t('actionEdit.onErrorContinue') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <StepCacheField
              v-if="stepCacheable"
              v-model="cacheTtl"
              :label="t('cache.stepLabel')"
              :hint="t('cache.stepHint')"
            />
          </div>
        </template>

        <template #default="{ meta }">
          <DialogFooter class="shrink-0 pt-4 sm:justify-start">
            <Button type="submit" :disabled="!meta.valid">
              {{ t('actionEdit.save') }}
              <kbd
                class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border border-primary-foreground/30 bg-primary-foreground/15 px-1.5 font-mono text-[10px] font-medium text-primary-foreground opacity-100"
              >
                <span class="text-xs">⌘</span>S
              </kbd>
            </Button>
            <Button v-if="isNew" type="button" variant="outline" @click="emit('cancel')">{{ t('actionEdit.remove') }}</Button>
          </DialogFooter>
        </template>
      </AutoForm>

      <!-- Plugin action -->
      <div v-else class="flex flex-col flex-1 min-h-0">
        <div class="overflow-y-auto flex-1 min-h-0 py-4 pr-2 space-y-4">
          <DialogDescription>{{ dialogDescription }}</DialogDescription>
          <pre
            v-if="pluginActionDocs?.example"
            class="text-xs bg-muted rounded p-2 overflow-x-auto text-left whitespace-pre-wrap"
          >{{ pluginActionDocs.example }}</pre>

          <!-- Typed fields from plugin params definition -->
          <template v-if="pluginParamDefs.length > 0">
            <div v-for="def in pluginParamDefs" :key="def.name" class="space-y-2">
              <Label>
                {{ def.label ?? def.name }}
                <span v-if="def.required" class="text-destructive ml-1">*</span>
              </Label>
              <p v-if="def.description" class="text-xs text-muted-foreground">{{ def.description }}</p>
              <div v-if="def.type === 'boolean'" class="flex items-center gap-2">
                <Checkbox
                  :id="def.name"
                  :checked="!!pluginParamValues[def.name]"
                  @update:checked="(v: boolean) => (pluginParamValues[def.name] = v)"
                />
                <Label :for="def.name" class="font-normal">{{ t('actionEdit.enablePlugin') }}</Label>
              </div>
              <DateStringInput
                v-else-if="def.type === 'date' || def.component === 'datetime'"
                :model-value="pluginParamValues[def.name]"
                @update:model-value="(v: string) => (pluginParamValues[def.name] = v)"
              />
              <div v-else-if="def.type === 'html'" class="border rounded-md overflow-hidden">
                <AutoFormCodeMirrorEditor
                  :model-value="pluginParamValues[def.name] ?? ''"
                  :extensions="htmlEditorExtensions"
                  :label="def.label ?? def.name"
                  @update:model-value="(v: string) => (pluginParamValues[def.name] = v)"
                />
              </div>
              <div v-else-if="def.component === 'textarea'" class="border rounded-md overflow-hidden">
                <AutoFormCodeMirrorEditor
                  :model-value="pluginParamValues[def.name] ?? ''"
                  :extensions="textareaEditorExtensions"
                  :label="def.label ?? def.name"
                  height="160px"
                  @update:model-value="(v: string) => (pluginParamValues[def.name] = v)"
                />
              </div>
              <Select
                v-else-if="def.type === 'variable'"
                :model-value="variableRefName(pluginParamValues[def.name])"
                @update:model-value="(v) => setPluginVariableValue(def, v as string)"
              >
                <SelectTrigger class="w-full">
                  <SelectValue :placeholder="t('actionEdit.selectVariable')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{{ t('actionEdit.selectVariable') }}</SelectItem>
                  <SelectItem v-for="v in variableOptions" :key="v.name" :value="v.name">
                    {{ v.name }}
                    <span class="ml-1 text-xs text-muted-foreground">({{ v.type }})</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                v-else-if="def.enum && def.enum.length > 0"
                :model-value="pluginParamValues[def.name]"
                @update:model-value="(v) => (pluginParamValues[def.name] = v)"
              >
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in def.enum" :key="opt" :value="opt">{{ opt }}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                v-else
                :type="def.type === 'number' ? 'number' : 'text'"
                v-model="pluginParamValues[def.name]"
              />
            </div>
          </template>
          <div
            v-else-if="isPluginUnavailable"
            class="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-2"
          >
            <p class="text-sm text-destructive">
              {{ t('actionEdit.pluginUnavailable', { group: actionParams?.group }) }}
            </p>
            <Button variant="outline" size="sm" @click="goToPlugins">
              {{ t('actionEdit.goToPlugins') }}
            </Button>
          </div>
          <p v-else class="text-sm text-muted-foreground">
            {{ t('actionEdit.noParamDefs') }}
          </p>

          <div class="space-y-2">
            <Label>{{ t('actionEdit.comment') }} <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span></Label>
            <Textarea v-model="comment" :placeholder="t('actionEdit.commentPlaceholder')" rows="2" class="resize-none" />
          </div>

          <div v-if="returns !== undefined" class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <Label>{{ t('actionEdit.destination') }}</Label>
              <div v-if="returns !== 'any'" class="flex items-center gap-2">
                <Checkbox
                  id="createNewVariablePlugin"
                  :model-value="createNewVariable"
                  @update:model-value="onToggleCreateNewVariable"
                />
                <Label for="createNewVariablePlugin" class="font-normal text-xs text-muted-foreground">
                  {{ t('actionEdit.createNewVariable') }}
                </Label>
              </div>
            </div>
            <Input
              v-if="createNewVariable"
              v-model="newVariableName"
              :placeholder="t('actionEdit.newVariableNamePlaceholder')"
            />
            <Select v-else v-model="destination">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('actionEdit.destinationNone')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{{ t('actionEdit.destinationNone') }}</SelectItem>
                <SelectItem v-for="v in destinationVariables" :key="v.name" :value="v.name">
                  {{ v.name }}
                  <span class="ml-1 text-xs text-muted-foreground">({{ v.type }})</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>{{ t('actionEdit.onError') }}</Label>
            <Select v-model="onError">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="throw">{{ t('actionEdit.onErrorThrow') }}</SelectItem>
                <SelectItem value="continue">{{ t('actionEdit.onErrorContinue') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <StepCacheField
            v-if="stepCacheable"
            v-model="cacheTtl"
            :label="t('cache.stepLabel')"
            :hint="t('cache.stepHint')"
          />

        </div>

        <DialogFooter class="shrink-0 pt-4 sm:justify-start">
          <Button :disabled="pluginHasErrors" @click="handlePluginSubmit">
            Save
            <kbd
              class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border border-primary-foreground/30 bg-primary-foreground/15 px-1.5 font-mono text-[10px] font-medium text-primary-foreground opacity-100"
            >
              <span class="text-xs">⌘</span>S
            </kbd>
          </Button>
          <Button v-if="isNew" variant="outline" @click="emit('cancel')">Remove</Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>
