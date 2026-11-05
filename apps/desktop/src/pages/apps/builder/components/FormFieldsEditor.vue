<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppFormField } from '@tipeline/schemas';
import { coreValidations } from '@tipeline/schemas';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import BindingInput from './BindingInput.vue';
import BindingHint from './BindingHint.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Edits a form's fields. Emits the whole new list on every change.
const props = defineProps<{ modelValue: AppFormField[] }>();
const emit = defineEmits<{ 'update:modelValue': [fields: AppFormField[]] }>();
const { t } = useI18n();

const { APP_FORM_FIELD_TYPES, APP_CODE_LANGUAGES: CODE_LANGUAGES } = coreValidations.appObject;
const open = ref<number | null>(null);
const NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

function commit(fields: AppFormField[]) {
  emit('update:modelValue', fields);
}

// Cleared optional values are removed rather than stored as "" — except the name,
// which falls back to the previous one.
// A color field's swatches: a list of colors, or a binding kept as written.
const swatchesValue = (text: string): AppFormField['swatches'] =>
  !text.trim() ? undefined : /\{[{=]/.test(text) ? text.trim() : text.split(/[\s,]+/).filter(Boolean);

// A slider bound: a number, or text kept as is (a binding such as {= state.max =}).
function boundValue(v: string | number): number | string | undefined {
  const text = String(v).trim();
  if (!text) return undefined;
  return Number.isFinite(Number(text)) ? Number(text) : text;
}
const SLIDER_BOUNDS = ['min', 'max', 'step'] as const;

function patch(index: number, changes: Partial<AppFormField>) {
  const next = props.modelValue.map((f, i) => {
    if (i !== index) return f;
    const merged: Record<string, unknown> = { ...f, ...changes };
    for (const [k, value] of Object.entries(merged))
      if (value === undefined || value === '') delete merged[k];
    merged.name ??= f.name;
    return merged as AppFormField;
  });
  commit(next);
}

// Text the field holds as typed — it can be a binding. Saved only when it changed:
// the binding field commits on every blur.
function setText(
  index: number,
  key: 'label' | 'placeholder' | 'description',
  value: string
) {
  if (value !== (props.modelValue[index][key] ?? '')) patch(index, { [key]: value });
}

function defaultText(field: AppFormField): string {
  if (field.default == null) return '';
  return typeof field.default === 'string' ? field.default : JSON.stringify(field.default);
}

/** The looks a field can take, its default first (none for most types). */
function displaysFor(field: AppFormField): NonNullable<AppFormField['display']>[] {
  if (field.type === 'checkbox') return ['switch', 'checkbox'];
  if (field.type === 'select') return ['dropdown', 'list', 'buttons'];
  if (field.type === 'multiselect') return ['list', 'buttons'];
  return [];
}

function add() {
  let n = props.modelValue.length + 1;
  while (props.modelValue.some((f) => f.name === `field${n}`)) n++;
  commit([
    ...props.modelValue,
    { name: `field${n}`, type: 'text', label: `Field ${n}` },
  ]);
  open.value = props.modelValue.length;
}

function move(index: number, by: number) {
  const next = [...props.modelValue];
  const [field] = next.splice(index, 1);
  next.splice(index + by, 0, field);
  commit(next);
  open.value = index + by;
}

function remove(index: number) {
  commit(props.modelValue.filter((_, i) => i !== index));
  open.value = null;
}

// Options are edited as text: one per line, "value" or "value | label" — or a binding
// such as {= runnables.lookup.outputs.items =} for options that come from a workflow.
function optionsText(field: AppFormField): string {
  const options = field.options;
  if (typeof options === 'string') return options;
  return (options ?? [])
    .map((o: any) =>
      o && typeof o === 'object' ? `${o.value} | ${o.label}` : String(o)
    )
    .join('\n');
}

function parseOptions(text: string): AppFormField['options'] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('{=') || trimmed.startsWith('{{')) return trimmed;
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bar = line.indexOf('|');
      return bar < 0
        ? line
        : {
            value: line.slice(0, bar).trim(),
            label: line.slice(bar + 1).trim(),
          };
    });
}

const nameError = (field: AppFormField, index: number) =>
  !NAME.test(field.name)
    ? t('builder.errors.namePattern')
    : props.modelValue.some((f, i) => i !== index && f.name === field.name)
      ? t('builder.form.duplicateField')
      : null;
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-for="(field, index) in modelValue"
      :key="index"
      class="rounded-md border"
    >
      <div class="flex items-center gap-1 px-2 py-1.5 text-xs">
        <button
          class="flex items-center gap-1 flex-1 min-w-0 text-left"
          @click="open = open === index ? null : index"
        >
          <component
            :is="open === index ? ChevronDown : ChevronRight"
            class="size-3 shrink-0"
          />
          <span class="font-mono truncate">{{ field.name }}</span>
          <span class="text-muted-foreground shrink-0"
            >· {{ t(`builder.form.types.${field.type ?? 'text'}`) }}</span
          >
          <span v-if="field.required" class="text-destructive">*</span>
        </button>
        <button
          :disabled="index === 0"
          class="disabled:opacity-30"
          :title="t('builder.form.moveUp')"
          @click="move(index, -1)"
        >
          <ArrowUp class="size-3" />
        </button>
        <button
          :disabled="index === modelValue.length - 1"
          class="disabled:opacity-30"
          :title="t('builder.form.moveDown')"
          @click="move(index, 1)"
        >
          <ArrowDown class="size-3" />
        </button>
        <button :title="t('common.remove')" @click="remove(index)">
          <Trash2 class="size-3 text-destructive" />
        </button>
      </div>

      <div v-if="open === index" class="flex flex-col gap-2 border-t p-2">
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <Label class="text-xs">{{ t('builder.form.name') }}</Label>
            <Input
              :model-value="field.name"
              class="h-7 text-xs font-mono"
              @change="
                (e: Event) =>
                  patch(index, {
                    name: (e.target as HTMLInputElement).value.trim(),
                  })
              "
            />
          </div>
          <div class="flex flex-col gap-1">
            <Label class="text-xs">{{ t('builder.form.type') }}</Label>
            <Select
              :model-value="field.type ?? 'text'"
              @update:model-value="
                (v) => patch(index, { type: v as AppFormField['type'] })
              "
            >
              <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="type in APP_FORM_FIELD_TYPES"
                  :key="type"
                  :value="type"
                  >{{ t(`builder.form.types.${type}`) }}</SelectItem
                >
              </SelectContent>
            </Select>
          </div>
        </div>
        <p v-if="nameError(field, index)" class="text-xs text-destructive m-0">
          {{ nameError(field, index) }}
        </p>
        <div class="flex flex-col gap-1">
          <Label class="text-xs flex items-center gap-1">{{ t('builder.props.label') }} <BindingHint /></Label>
          <BindingInput
            :model-value="field.label ?? ''"
            @commit="(v) => setText(index, 'label', v)"
          />
        </div>
        <div class="flex items-center justify-between">
          <Label class="text-xs">{{ t('builder.props.required') }}</Label>
          <Switch
            :model-value="!!field.required"
            @update:model-value="
              (v: boolean) => patch(index, { required: v || undefined })
            "
          />
        </div>
        <div class="flex flex-col gap-1">
          <Label class="text-xs flex items-center gap-1">{{ t('builder.props.placeholder') }} <BindingHint /></Label>
          <BindingInput
            :model-value="field.placeholder ?? ''"
            @commit="(v) => setText(index, 'placeholder', v)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <Label class="text-xs flex items-center gap-1">{{ t('builder.props.description') }} <BindingHint /></Label>
          <BindingInput
            :model-value="field.description ?? ''"
            @commit="(v) => setText(index, 'description', v)"
          />
        </div>
        <!-- How the field looks: only the choices that suit its type (the first is the default). -->
        <div v-if="displaysFor(field).length" class="flex flex-col gap-1">
          <Label class="text-xs">{{ t('builder.props.display') }}</Label>
          <Select
            :model-value="field.display ?? displaysFor(field)[0]"
            @update:model-value="(v) => patch(index, { display: v === displaysFor(field)[0] ? undefined : (v as AppFormField['display']) })"
          >
            <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="d in displaysFor(field)" :key="d" :value="d">{{ t(`builder.fieldDisplay.${d}`) }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div
          v-if="field.type === 'select' || field.type === 'multiselect'"
          class="flex flex-col gap-1"
        >
          <Label class="text-xs flex items-center gap-1">{{ t('builder.props.options') }} <BindingHint /></Label>
          <BindingInput
            :model-value="optionsText(field)"
            multiline
            input-class="font-mono"
            @commit="
              (v) =>
                v !== optionsText(field) &&
                patch(index, { options: parseOptions(v) })
            "
          />
          <p class="text-[11px] text-muted-foreground m-0">
            {{ t('builder.form.optionsHint') }}
          </p>
        </div>
        <template v-if="field.type === 'slider'">
          <div class="grid grid-cols-3 gap-1.5">
            <div v-for="key in SLIDER_BOUNDS" :key="key" class="flex flex-col gap-1">
              <Label class="text-xs">{{ t(`builder.props.slider_${key}`) }}</Label>
              <Input
                class="h-7 text-xs font-mono"
                :data-slider-setting="key"
                :placeholder="key === 'min' ? '0' : key === 'max' ? '100' : '1'"
                :model-value="field[key] == null ? '' : String(field[key])"
                @update:model-value="(v) => patch(index, { [key]: boundValue(v) } as Partial<AppFormField>)"
              />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Switch
              :id="`ff-range-${index}`"
              :model-value="field.range === true"
              @update:model-value="(v: boolean) => patch(index, { range: v || undefined })"
            />
            <Label :for="`ff-range-${index}`" class="text-xs">{{ t('builder.props.sliderRange') }}</Label>
          </div>
          <div class="flex flex-col gap-1">
            <Label class="text-xs">{{ t('builder.props.sliderUnit') }}</Label>
            <Input
              class="h-7 text-xs"
              placeholder="km, %, kg…"
              :model-value="field.unit ?? ''"
              @update:model-value="(v) => patch(index, { unit: String(v) || undefined })"
            />
          </div>
        </template>
        <template v-if="field.type === 'color'">
          <div class="flex items-center gap-2">
            <Switch
              :id="`ff-alpha-${index}`"
              :model-value="field.alpha === true"
              @update:model-value="(v: boolean) => patch(index, { alpha: v || undefined })"
            />
            <Label :for="`ff-alpha-${index}`" class="text-xs">{{ t('builder.props.colorAlpha') }}</Label>
          </div>
          <div class="flex flex-col gap-1">
            <Label class="text-xs">{{ t('builder.props.colorSwatches') }}</Label>
            <!-- Colors separated by spaces or commas; a binding is kept as written. -->
            <Input
              class="h-7 text-xs font-mono"
              placeholder="#ef4444 #f59e0b #22c55e"
              data-color-swatches
              :model-value="Array.isArray(field.swatches) ? field.swatches.join(' ') : (field.swatches ?? '')"
              @update:model-value="(v) => patch(index, { swatches: swatchesValue(String(v)) })"
            />
          </div>
        </template>
        <div v-if="field.type === 'currency' || field.type === 'slider'" class="flex flex-col gap-1">
          <Label class="text-xs">{{ t('builder.props.currency') }}</Label>
          <Input
            class="h-7 text-xs uppercase"
            maxlength="3"
            placeholder="USD"
            :model-value="field.currency ?? ''"
            @update:model-value="(v) => patch(index, { currency: String(v).trim().toUpperCase() || undefined })"
          />
        </div>
        <div v-if="field.type === 'code'" class="flex flex-col gap-1">
          <Label class="text-xs">{{ t('builder.props.codeLanguage') }}</Label>
          <Select
            :model-value="field.language ?? 'text'"
            @update:model-value="(v) => patch(index, { language: v === 'text' ? undefined : (v as AppFormField['language']) })"
          >
            <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="lang in CODE_LANGUAGES" :key="lang" :value="lang">{{ lang }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div v-if="field.type === 'richtext'" class="flex flex-col gap-1">
          <Label class="text-xs">{{ t('builder.props.richTextFormat') }}</Label>
          <Select
            :model-value="field.format ?? 'html'"
            @update:model-value="(v) => patch(index, { format: v === 'html' ? undefined : (v as AppFormField['format']) })"
          >
            <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="html">HTML</SelectItem>
              <SelectItem value="markdown">Markdown</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p v-if="field.type === 'password'" class="text-[11px] text-amber-700 dark:text-amber-400 m-0">
          {{ t('builder.form.passwordHint') }}
        </p>
        <div class="flex flex-col gap-1">
          <Label class="text-xs flex items-center gap-1">{{ t('builder.props.default') }} <BindingHint /></Label>
          <BindingInput
            :model-value="defaultText(field)"
            input-class="font-mono"
            @commit="(v) => v !== defaultText(field) && patch(index, { default: v })"
          />
        </div>
      </div>
    </div>

    <Button size="sm" variant="outline" class="h-7 text-xs" @click="add">
      <Plus class="size-3" /> {{ t('builder.form.addField') }}
    </Button>
  </div>
</template>
