<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, EyeOff, FileText, X } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { normalizeOptions } from '@/utils/appOptions';
import { formatError } from '@/utils/appForm';
import { formatSliderNumber, sliderBounds, sliderPositions, sliderValue } from '@/utils/appSlider';
import AppCombobox, { type ComboOption } from './AppCombobox.vue';
import AppDatePicker from './AppDatePicker.vue';
import AppCodeEditor from './AppCodeEditor.vue';
import AppColorPicker from './AppColorPicker.vue';
// TipTap is big: loaded only when a rich text field is shown.
const AppRichTextEditor = defineAsyncComponent(() => import('./AppRichTextEditor.vue'));
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// One input of any kind — used by the standalone Input/Select/Checkbox components and
// by every field of a Form, so they look and behave the same.

interface FieldOption {
  label: string;
  value: unknown;
}

const props = defineProps<{
  id: string;
  type: string;
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  /** Raw options (strings or { label, value }), already resolved. */
  options?: unknown;
  modelValue: unknown;
  error?: string | null;
  /** Builder preview: shown, not interactive. */
  editable?: boolean;
  /**
   * checkbox: a switch (default) or a tick box. select: dropdown (default), list (radio
   * buttons) or buttons (a segmented row). multiselect: list (tick boxes, default) or
   * buttons (toggle buttons).
   */
  display?: 'switch' | 'checkbox' | 'dropdown' | 'list' | 'buttons';
  /**
   * select / multiselect shown as a dropdown: a search box. local filters the
   * options; remote emits `search` and shows the options as given (see AppCombobox).
   */
  search?: 'off' | 'local' | 'remote';
  /** Remote search: chosen options to keep labels for, and whether a search is running. */
  known?: ComboOption[];
  busy?: boolean;
  /** type currency: the ISO code of its symbol (default USD). */
  currency?: string;
  /** type code: its language (json is also checked). */
  language?: string;
  /** type richtext: the value as html (default) or markdown. */
  format?: 'html' | 'markdown';
  /** Take the whole height (a standalone code / rich text input fills its card). */
  fill?: boolean;
  /** type slider: its bounds and step, two handles ([from, to]) with `range`, and a unit after the number. */
  min?: unknown;
  max?: unknown;
  step?: unknown;
  range?: unknown;
  unit?: string;
  /** type color: an opacity strip (the value may be #rrggbbaa), and colors to pick from. */
  alpha?: boolean;
  swatches?: unknown;
  /** type code: a Code | Preview switch showing `previewHtml` (asked for with `preview`). */
  preview?: boolean;
  previewHtml?: string | null;
  /** type code: names the { } menu inserts as {{ name }}. */
  variables?: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: unknown, chosen?: ComboOption[]];
  search: [text: string];
  /** slider / color: let go of (or a key moved, a swatch picked) — the value it settled on. */
  commit: [value: unknown];
  /** type code: the preview opened, or its text changed while it shows. */
  preview: [text: string];
}>();
const { t, locale } = useI18n();

// A badly formatted value (an email without @…) says so once the field is left —
// not while it's being typed. A form's submit / a stepper's Next check it too.
const touched = ref(false);
const formatProblem = computed(() => formatError(props.type, props.modelValue, props.language));
const shownError = computed(
  () => props.error || (touched.value && formatProblem.value ? t(`apps.field.errors.${formatProblem.value}`) : null)
);

const revealed = ref(false); // password shown as text

// The currency's symbol ($, €, CRC…) before the amount.
const currencySymbol = computed(() => {
  const code = (props.currency || 'USD').toUpperCase();
  try {
    return (
      new Intl.NumberFormat(locale.value, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? code
    );
  } catch {
    return code;
  }
});

const options = computed<FieldOption[]>(() => normalizeOptions(props.options));

// Slider: where the handles are, and the value shown next to the label.
const bounds = computed(() => sliderBounds({ min: props.min, max: props.max, step: props.step, range: props.range }));
const positions = computed(() => sliderPositions(props.modelValue, bounds.value));
// A required slider without a default starts unanswered: "–", the handle dimmed at min.
// The first touch answers it — even a click or key that leaves it at min.
const unset = computed(() => props.modelValue == null || props.modelValue === '');
function answer() {
  if (unset.value && !props.editable) emit('update:modelValue', sliderValue(positions.value, bounds.value));
}
const sliderText = computed(() => {
  if (unset.value) return '–';
  const show = (n: number) =>
    formatSliderNumber(n, { unit: props.unit, currency: props.currency, locale: locale.value, step: bounds.value.step });
  return positions.value.map(show).join(' – ');
});
const thumbLabels = computed(() => {
  const name = props.label || t('apps.field.slider');
  return bounds.value.range ? [`${name}: ${t('apps.field.sliderFrom')}`, `${name}: ${t('apps.field.sliderTo')}`] : [name];
});
function slide(next: number[] | undefined) {
  if (next) emit('update:modelValue', sliderValue(next, bounds.value));
}

// Select items need string values; map options by index and back.
const selectedIndex = computed(() => {
  const i = options.value.findIndex(
    (o) => JSON.stringify(o.value) === JSON.stringify(props.modelValue)
  );
  return i < 0 ? undefined : String(i);
});

const multiValues = computed<unknown[]>(() =>
  Array.isArray(props.modelValue) ? props.modelValue : []
);
const isChosen = (o: FieldOption) =>
  multiValues.value.some((v) => JSON.stringify(v) === JSON.stringify(o.value));
function toggle(o: FieldOption, on: boolean) {
  const rest = multiValues.value.filter(
    (v) => JSON.stringify(v) !== JSON.stringify(o.value)
  );
  emit('update:modelValue', on ? [...rest, o.value] : rest);
}

function onNumber(raw: string | number) {
  const text = String(raw).trim();
  if (text === '') return emit('update:modelValue', null);
  const num = Number(text);
  emit('update:modelValue', Number.isNaN(num) ? props.modelValue : num);
}

async function chooseFile() {
  if (props.editable) return;
  const path = await window.ipcRenderer.invoke('dialog:open-file', {
    filters: [{ name: t('apps.field.allFiles'), extensions: ['*'] }],
  });
  if (path) emit('update:modelValue', path);
}
</script>

<template>
  <div :class="['flex flex-col gap-1.5', fill && 'h-full min-h-0']">
    <!-- checkbox: label sits next to the switch (or tick box) -->
    <div v-if="type === 'checkbox'" class="flex items-center gap-2">
      <Checkbox
        v-if="display === 'checkbox'"
        :id="id"
        :model-value="modelValue === true"
        :disabled="editable"
        @update:model-value="(v) => emit('update:modelValue', v === true)"
      />
      <Switch
        v-else
        :id="id"
        :model-value="modelValue === true"
        :disabled="editable"
        @update:model-value="(v: boolean) => emit('update:modelValue', v)"
      />
      <Label v-if="label" :for="id" class="text-sm"
        >{{ label
        }}<span v-if="required" class="text-destructive"> *</span></Label
      >
    </div>

    <template v-else>
      <!-- slider: the value it's at, next to the label -->
      <div v-if="type === 'slider'" class="flex items-center gap-2 min-w-0">
        <Label v-if="label" :for="id" class="text-sm truncate"
          >{{ label }}<span v-if="required" class="text-destructive"> *</span></Label
        >
        <span class="ml-auto text-sm tabular-nums font-medium whitespace-nowrap" data-testid="slider-value">{{ sliderText }}</span>
      </div>
      <Label v-else-if="label" :for="id" class="text-sm"
        >{{ label
        }}<span v-if="required" class="text-destructive"> *</span></Label
      >

      <Slider
        v-if="type === 'slider'"
        :id="id"
        :class="['py-2', unset && 'opacity-60']"
        :data-unset="unset || undefined"
        :model-value="positions"
        :min="bounds.min"
        :max="bounds.max"
        :step="bounds.step"
        :disabled="editable"
        :thumb-labels="thumbLabels"
        @pointerdown.capture="answer"
        @keydown.capture="answer"
        @update:model-value="slide"
        @value-commit="(v: number[]) => emit('commit', sliderValue(v, bounds))"
      />

      <Textarea
        v-else-if="type === 'textarea'"
        :id="id"
        :model-value="String(modelValue ?? '')"
        :placeholder="placeholder"
        :disabled="editable"
        rows="3"
        @update:model-value="(v) => emit('update:modelValue', v)"
      />

      <Input
        v-else-if="type === 'number'"
        :id="id"
        type="number"
        :model-value="modelValue == null ? '' : String(modelValue)"
        :placeholder="placeholder"
        :disabled="editable"
        @update:model-value="onNumber"
        @blur="touched = true"
      />

      <!-- rich text: a toolbar editor; HTML or Markdown -->
      <AppRichTextEditor
        v-else-if="type === 'richtext'"
        :id="id"
        :model-value="modelValue"
        :format="format"
        :placeholder="placeholder"
        :editable="editable"
        :fill="fill"
        @update:model-value="(v) => emit('update:modelValue', v)"
        @blur="touched = true"
      />

      <!-- color: a swatch that opens the picker, and the hex text -->
      <AppColorPicker
        v-else-if="type === 'color'"
        :id="id"
        :model-value="modelValue"
        :alpha="alpha"
        :swatches="swatches"
        :placeholder="placeholder"
        :editable="editable"
        @update:model-value="(v) => emit('update:modelValue', v)"
        @commit="(v) => emit('commit', v)"
        @blur="touched = true"
      />

      <!-- code: an editor highlighted for its language -->
      <AppCodeEditor
        v-else-if="type === 'code'"
        :id="id"
        :model-value="modelValue"
        :language="language"
        :placeholder="placeholder"
        :editable="editable"
        :fill="fill"
        :label="label"
        :preview="preview"
        :preview-html="previewHtml"
        :variables="variables"
        @update:model-value="(v) => emit('update:modelValue', v)"
        @preview="(v) => emit('preview', v)"
        @blur="touched = true"
      />

      <!-- date / date & time: Tipeline's calendar (as a Date range's); time: a time box -->
      <AppDatePicker
        v-else-if="type === 'date' || type === 'datetime'"
        :id="id"
        :model-value="modelValue"
        :with-time="type === 'datetime'"
        :placeholder="placeholder"
        :required="required"
        :editable="editable"
        @update:model-value="(v) => emit('update:modelValue', v)"
        @blur="touched = true"
      />
      <Input
        v-else-if="type === 'time'"
        :id="id"
        type="time"
        :model-value="String(modelValue ?? '')"
        :disabled="editable"
        @update:model-value="(v) => emit('update:modelValue', v)"
      />

      <!-- currency: a number, with its symbol in front -->
      <div v-else-if="type === 'currency'" class="relative">
        <span
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          data-testid="currency-symbol"
          >{{ currencySymbol }}</span
        >
        <Input
          :id="id"
          type="number"
          step="0.01"
          class="pl-[calc(0.75rem+var(--sym-w))]"
          :style="{ '--sym-w': `${currencySymbol.length * 0.6 + 0.4}rem` }"
          :model-value="modelValue == null ? '' : String(modelValue)"
          :placeholder="placeholder"
          :disabled="editable"
          @update:model-value="onNumber"
          @blur="touched = true"
        />
      </div>

      <!-- password: hidden, with a button to show it -->
      <div v-else-if="type === 'password'" class="relative">
        <Input
          :id="id"
          :type="revealed ? 'text' : 'password'"
          autocomplete="off"
          class="pr-9"
          :model-value="String(modelValue ?? '')"
          :placeholder="placeholder"
          :disabled="editable"
          @update:model-value="(v) => emit('update:modelValue', v)"
        />
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
          :aria-label="revealed ? t('apps.field.hidePassword') : t('apps.field.showPassword')"
          :title="revealed ? t('apps.field.hidePassword') : t('apps.field.showPassword')"
          :disabled="editable"
          @click="revealed = !revealed"
        >
          <component :is="revealed ? EyeOff : Eye" class="size-4" />
        </button>
      </div>

      <Input
        v-else-if="type === 'email' || type === 'phone'"
        :id="id"
        :type="type === 'email' ? 'email' : 'tel'"
        :autocomplete="type === 'email' ? 'email' : 'tel'"
        :model-value="String(modelValue ?? '')"
        :placeholder="placeholder"
        :disabled="editable"
        @update:model-value="(v) => emit('update:modelValue', v)"
        @blur="touched = true"
      />

      <!-- select / multiselect with a search box -->
      <AppCombobox
        v-else-if="
          (type === 'select' || type === 'multiselect') &&
          (search === 'local' || search === 'remote') &&
          (!display || display === 'dropdown')
        "
        :id="id"
        :options="options"
        :model-value="modelValue"
        :multiple="type === 'multiselect'"
        :mode="search"
        :known="known"
        :placeholder="placeholder"
        :busy="busy"
        :editable="editable"
        @update:model-value="(v, chosen) => emit('update:modelValue', v, chosen)"
        @search="(text) => emit('search', text)"
      />

      <!-- select as radio buttons -->
      <RadioGroup
        v-else-if="type === 'select' && display === 'list'"
        :id="id"
        :model-value="selectedIndex"
        :disabled="editable"
        class="gap-1.5"
        @update:model-value="(i) => emit('update:modelValue', options[Number(i)]?.value ?? null)"
      >
        <label v-for="(o, i) in options" :key="i" class="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem :value="String(i)" />
          {{ o.label }}
        </label>
        <span v-if="!options.length" class="text-xs text-muted-foreground">{{ t('apps.field.noOptions') }}</span>
      </RadioGroup>

      <!-- select / multiselect as a row of buttons (one pressed, or several) -->
      <div
        v-else-if="(type === 'select' || type === 'multiselect') && display === 'buttons'"
        :id="id"
        :role="type === 'select' ? 'radiogroup' : 'group'"
        class="flex flex-wrap gap-1"
      >
        <button
          v-for="(o, i) in options"
          :key="i"
          type="button"
          :role="type === 'select' ? 'radio' : undefined"
          :aria-checked="type === 'select' ? String(i) === selectedIndex : undefined"
          :aria-pressed="type === 'multiselect' ? isChosen(o) : undefined"
          :disabled="editable"
          :class="
            cn(
              'h-8 rounded-md border px-3 text-sm transition-colors disabled:opacity-60',
              (type === 'select' ? String(i) === selectedIndex : isChosen(o))
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background hover:bg-accent'
            )
          "
          @click="type === 'select' ? emit('update:modelValue', o.value) : toggle(o, !isChosen(o))"
        >
          {{ o.label }}
        </button>
        <span v-if="!options.length" class="text-xs text-muted-foreground">{{ t('apps.field.noOptions') }}</span>
      </div>

      <Select
        v-else-if="type === 'select'"
        :model-value="selectedIndex"
        :disabled="editable"
        @update:model-value="
          (i) => emit('update:modelValue', options[Number(i)]?.value ?? null)
        "
      >
        <SelectTrigger :id="id" class="w-full"
          ><SelectValue :placeholder="placeholder ?? t('apps.field.choose')"
        /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="(o, i) in options" :key="i" :value="String(i)">{{
            o.label
          }}</SelectItem>
        </SelectContent>
      </Select>

      <div
        v-else-if="type === 'multiselect'"
        :id="id"
        class="flex flex-col gap-1.5 rounded-md border p-2 max-h-40 overflow-auto"
      >
        <label
          v-for="(o, i) in options"
          :key="i"
          class="flex items-center gap-2 text-sm cursor-pointer"
        >
          <Checkbox
            :model-value="isChosen(o)"
            :disabled="editable"
            @update:model-value="(on) => toggle(o, on === true)"
          />
          {{ o.label }}
        </label>
        <span v-if="!options.length" class="text-xs text-muted-foreground">{{
          t('apps.field.noOptions')
        }}</span>
      </div>

      <div v-else-if="type === 'file'" class="flex items-center gap-2">
        <Button
          :id="id"
          type="button"
          variant="outline"
          size="sm"
          :disabled="editable"
          @click="chooseFile"
        >
          <FileText class="size-4" /> {{ t('apps.field.chooseFile') }}
        </Button>
        <span
          class="text-xs text-muted-foreground truncate flex-1"
          :title="String(modelValue ?? '')"
        >
          {{ modelValue || placeholder || t('apps.field.noFile') }}
        </span>
        <button
          v-if="modelValue && !editable"
          type="button"
          :title="t('common.clear')"
          @click="emit('update:modelValue', '')"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <Input
        v-else
        :id="id"
        :model-value="String(modelValue ?? '')"
        :placeholder="placeholder"
        :disabled="editable"
        @update:model-value="(v) => emit('update:modelValue', v)"
      />
    </template>

    <p v-if="shownError" class="text-xs text-destructive m-0" data-testid="field-error">{{ shownError }}</p>
    <p v-else-if="description" class="text-xs text-muted-foreground m-0">
      {{ description }}
    </p>
  </div>
</template>
