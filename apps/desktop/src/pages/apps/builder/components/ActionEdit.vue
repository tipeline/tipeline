<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppAction } from '@tipeline/schemas';
import { coreValidations } from '@tipeline/schemas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import BindingInput from './BindingInput.vue';
import JsonEditor from '@/components/JsonEditor.vue';
import { useBindingAnalyzer } from '@/composables/useBindingAnalyzer';
import { jsonError } from '@/utils/jsonError';
import { BINDING_SUGGESTIONS } from '../bindingSuggestions';

const { t } = useI18n();

const props = defineProps<{
  action?: AppAction | null;
  pages: Array<{ id: string; name: string }>;
  runnables: string[];
  /** Components of the page (for `reset`, which targets inputs and forms). */
  components?: Array<{ id: string; type: string }>;
  handler?: boolean;
}>();

const injected = inject(BINDING_SUGGESTIONS, null);
const suggestions = computed(() => (props.handler ? injected?.handler.value : injected?.page.value) ?? []);
const analyze = useBindingAnalyzer();

const emit = defineEmits<{ submit: [action: AppAction] }>();

type ActionType = AppAction['type'];
const ACTION_TYPES: ActionType[] = ['run', 'navigate', 'openModal', 'closeModal', 'reset', 'setState', 'toast', 'openUrl', 'openFile'];
const RESETTABLE = new Set(coreValidations.appObject.APP_RESETTABLE_TYPES as readonly string[]);
const resettable = computed(() => (props.components ?? []).filter((c) => RESETTABLE.has(c.type)));

const type = ref<ActionType>('run');
const runnable = ref('');
// run: skip the workflow cache and store fresh outputs.
const refresh = ref(false);
const page = ref('');
const params = ref('');
const target = ref('');
const stateKey = ref('');
const stateValue = ref('');
const message = ref('');
const variant = ref<'default' | 'success' | 'error'>('default');
// openUrl / openFile
const url = ref('');
const filePath = ref('');
const fileMode = ref<'open' | 'reveal' | 'save'>('open');
// openModal: how the page is shown.
const display = ref<'dialog' | 'drawer'>('dialog');
const side = ref<'right' | 'left'>('right');
const size = ref<'sm' | 'md' | 'lg' | 'xl'>('md');

// A value typed as JSON (number, true/false/null, array, object, quoted string) is
// stored as that value; anything else — including {{ }} / {= =} bindings — as text.
function parseValue(text: string): unknown {
  const trimmed = text.trim();
  if (/^(-?\d|true$|false$|null$|\[|\{(?![{=])|")/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

watch(
  () => props.action,
  (action) => {
    type.value = action?.type ?? 'run';
    runnable.value = action?.type === 'run' ? action.runnable : '';
    refresh.value = action?.type === 'run' ? !!action.refresh : false;
    page.value = action?.type === 'navigate' || action?.type === 'openModal' ? action.page : '';
    params.value =
      (action?.type === 'navigate' || action?.type === 'openModal') && action.params ? JSON.stringify(action.params) : '';
    target.value = action?.type === 'reset' ? action.component : '';
    stateKey.value = action?.type === 'setState' ? action.key : '';
    stateValue.value = action?.type === 'setState' ? formatValue(action.value) : '';
    message.value = action?.type === 'toast' ? action.message : '';
    variant.value = action?.type === 'toast' ? action.variant : 'default';
    url.value = action?.type === 'openUrl' ? action.url : '';
    filePath.value = action?.type === 'openFile' ? action.path : '';
    fileMode.value = action?.type === 'openFile' ? (action.mode ?? 'open') : 'open';
    display.value = action?.type === 'openModal' ? (action.display ?? 'dialog') : 'dialog';
    side.value = action?.type === 'openModal' ? (action.side ?? 'right') : 'right';
    size.value = action?.type === 'openModal' ? (action.size ?? 'md') : 'md';
  },
  { immediate: true }
);

const hasPage = computed(() => type.value === 'navigate' || type.value === 'openModal');

const paramsError = computed(() => {
  if (!hasPage.value || !params.value.trim()) return false;
  try {
    const parsed = JSON.parse(params.value);
    return !parsed || typeof parsed !== 'object' || Array.isArray(parsed);
  } catch {
    return true;
  }
});

const canSubmit = computed(() => {
  switch (type.value) {
    case 'run':
      return !!runnable.value;
    case 'navigate':
    case 'openModal':
      return !!page.value && !paramsError.value;
    case 'closeModal':
      return true;
    case 'reset':
      return !!target.value;
    case 'setState':
      return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(stateKey.value);
    case 'toast':
      return !!message.value.trim();
    case 'openUrl':
      return !!url.value.trim();
    case 'openFile':
      return !!filePath.value.trim();
  }
  return false;
});

function submit() {
  if (!canSubmit.value) return;
  let action: AppAction;
  switch (type.value) {
    case 'run':
      action = { type: 'run', runnable: runnable.value, ...(refresh.value ? { refresh: true } : {}) };
      break;
    case 'navigate':
      action = params.value.trim()
        ? { type: 'navigate', page: page.value, params: JSON.parse(params.value) }
        : { type: 'navigate', page: page.value };
      break;
    case 'openModal':
      // Defaults are left out, so a plain dialog stays `{ type, page }`.
      action = {
        type: 'openModal',
        page: page.value,
        ...(params.value.trim() ? { params: JSON.parse(params.value) } : {}),
        ...(display.value === 'drawer' ? { display: 'drawer' as const } : {}),
        ...(display.value === 'drawer' && side.value === 'left' ? { side: 'left' as const } : {}),
        ...(size.value !== 'md' ? { size: size.value } : {}),
      };
      break;
    case 'closeModal':
      action = { type: 'closeModal' };
      break;
    case 'reset':
      action = { type: 'reset', component: target.value };
      break;
    case 'setState':
      action = { type: 'setState', key: stateKey.value, value: parseValue(stateValue.value) };
      break;
    case 'openUrl':
      action = { type: 'openUrl', url: url.value.trim() };
      break;
    case 'openFile':
      action = { type: 'openFile', path: filePath.value.trim(), mode: fileMode.value };
      break;
    default:
      action = { type: 'toast', message: message.value, variant: variant.value };
  }
  emit('submit', action);
}

defineExpose({ submit, canSubmit });
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label>{{ t('builder.actionEdit.action') }}</Label>
      <Select v-model="type">
        <SelectTrigger><SelectValue :placeholder="t('builder.actionEdit.selectAction')" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="at in ACTION_TYPES" :key="at" :value="at">
            {{ t(`builder.actionEdit.actionTypes.${at}`) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- run -->
    <div v-if="type === 'run'" class="flex flex-col gap-1.5">
      <Label>{{ t('builder.actionEdit.runnable') }}</Label>
      <Select v-model="runnable" :disabled="!runnables.length">
        <SelectTrigger><SelectValue :placeholder="t('builder.actionEdit.selectRunnable')" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="name in runnables" :key="name" :value="name">{{ name }}</SelectItem>
        </SelectContent>
      </Select>
      <p v-if="!runnables.length" class="text-xs text-muted-foreground">{{ t('builder.actionEdit.noRunnables') }}</p>
      <label class="flex items-start gap-2 pt-1 text-sm">
        <Checkbox v-model="refresh" class="mt-0.5" />
        <span>
          {{ t('builder.actionEdit.refresh') }}
          <span class="block text-xs text-muted-foreground">{{ t('builder.actionEdit.refreshHint') }}</span>
        </span>
      </label>
    </div>

    <!-- navigate / openModal -->
    <template v-if="hasPage">
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.targetPage') }}</Label>
        <Select v-model="page">
          <SelectTrigger><SelectValue :placeholder="t('builder.actionEdit.selectPage')" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in pages" :key="p.id" :value="p.id">{{ p.name }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.params') }} <span class="text-muted-foreground text-xs">{{ t('common.optional') }}</span></Label>
        <JsonEditor v-model="params" :analyze="analyze" :min-lines="2" :max-lines="8" placeholder='{"id": "{{ invoiceTable.selectedRow.id }}"}' />
        <!-- The editor explains JSON that doesn't parse; this covers valid JSON of the wrong shape. -->
        <p v-if="paramsError && !jsonError(params)" class="text-xs text-destructive">{{ t('builder.actionEdit.paramsInvalid') }}</p>
      </div>
    </template>

    <!-- openModal: dialog or drawer, side, width -->
    <div v-if="type === 'openModal'" class="grid grid-cols-3 gap-2">
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.display') }}</Label>
        <Select v-model="display">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dialog">{{ t('builder.actionEdit.displays.dialog') }}</SelectItem>
            <SelectItem value="drawer">{{ t('builder.actionEdit.displays.drawer') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.side') }}</Label>
        <Select v-model="side" :disabled="display !== 'drawer'">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="right">{{ t('builder.actionEdit.sides.right') }}</SelectItem>
            <SelectItem value="left">{{ t('builder.actionEdit.sides.left') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.size') }}</Label>
        <Select v-model="size">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="s in ['sm', 'md', 'lg', 'xl']" :key="s" :value="s">{{ t(`builder.actionEdit.sizes.${s}`) }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    <p v-if="type === 'openModal'" class="text-xs text-muted-foreground -mt-2">{{ t('builder.actionEdit.openModalHint') }}</p>
    <p v-if="type === 'closeModal'" class="text-xs text-muted-foreground">{{ t('builder.actionEdit.closeModalHint') }}</p>

    <!-- reset -->
    <div v-if="type === 'reset'" class="flex flex-col gap-1.5">
      <Label>{{ t('builder.actionEdit.component') }}</Label>
      <Select v-model="target" :disabled="!resettable.length">
        <SelectTrigger><SelectValue :placeholder="t('builder.actionEdit.selectComponent')" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="c in resettable" :key="c.id" :value="c.id">{{ c.id }}</SelectItem>
        </SelectContent>
      </Select>
      <p v-if="!resettable.length" class="text-xs text-muted-foreground">{{ t('builder.actionEdit.noResettable') }}</p>
    </div>

    <!-- setState -->
    <template v-if="type === 'setState'">
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.stateKey') }}</Label>
        <Input v-model="stateKey" placeholder="selectedCustomer" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.stateValue') }}</Label>
        <BindingInput v-model="stateValue" :suggestions="suggestions" size="default" input-class="font-mono" placeholder="{= result.outputs.customer =}" />
        <p class="text-xs text-muted-foreground">{{ t('builder.actionEdit.valueHint') }}</p>
      </div>
    </template>

    <!-- openUrl -->
    <div v-if="type === 'openUrl'" class="flex flex-col gap-1.5">
      <Label>{{ t('builder.actionEdit.url') }}</Label>
      <BindingInput v-model="url" :suggestions="suggestions" size="default" placeholder="https://example.com/{{ table1.selectedRow.id }}" />
      <p class="text-xs text-muted-foreground">{{ t('builder.actionEdit.openUrlHint') }}</p>
    </div>

    <!-- openFile -->
    <template v-if="type === 'openFile'">
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.filePath') }}</Label>
        <BindingInput v-model="filePath" :suggestions="suggestions" size="default" input-class="font-mono" placeholder="{{ runnables.report.outputs.path }}" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.fileMode') }}</Label>
        <Select v-model="fileMode">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="m in ['open', 'reveal', 'save']" :key="m" :value="m">{{ t(`builder.actionEdit.fileModes.${m}`) }}</SelectItem>
          </SelectContent>
        </Select>
        <p class="text-xs text-muted-foreground">{{ t(`builder.actionEdit.fileModeHints.${fileMode}`) }}</p>
      </div>
    </template>

    <!-- toast -->
    <template v-if="type === 'toast'">
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.message') }}</Label>
        <BindingInput v-model="message" :suggestions="suggestions" size="default" :placeholder="t('builder.actionEdit.messagePlaceholder')" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.variant') }}</Label>
        <Select v-model="variant">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{{ t('builder.actionEdit.variants.default') }}</SelectItem>
            <SelectItem value="success">{{ t('builder.actionEdit.variants.success') }}</SelectItem>
            <SelectItem value="error">{{ t('builder.actionEdit.variants.error') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </template>
  </div>
</template>
