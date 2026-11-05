<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-vue-next';
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui';
import { cn } from '@/lib/utils';
import { chosenOptions, type AppOption } from '@/utils/appOptions';

// A select with a search box (Select with `search`). local: typing filters the options
// by label. remote: typing asks for new options instead — `search` is emitted (after a
// pause) and the options are whatever the search brought back; nothing is filtered here.
// Chosen options are remembered (`known`), so a choice keeps its label when later
// results no longer include it.

export type ComboOption = AppOption;

const props = defineProps<{
  id: string;
  options: ComboOption[];
  modelValue: unknown;
  multiple?: boolean;
  mode: 'local' | 'remote';
  /** Labels of chosen options the current options may not hold (remote search). */
  known?: ComboOption[];
  placeholder?: string;
  /** remote: the search is running. */
  busy?: boolean;
  editable?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: unknown, chosen: ComboOption[]];
  search: [text: string];
}>();
const { t } = useI18n();

/** Search delay after the last key, in ms. */
const DEBOUNCE = 300;

const keyOf = (value: unknown) => JSON.stringify(value ?? null);
const open = ref(false);
const term = ref('');

const values = computed<unknown[]>(() =>
  props.multiple
    ? Array.isArray(props.modelValue)
      ? props.modelValue
      : []
    : props.modelValue === null || props.modelValue === undefined || props.modelValue === ''
      ? []
      : [props.modelValue]
);

const chosen = computed(() => chosenOptions(props.modelValue, props.options, props.known));

const shown = computed(() => {
  if (props.mode === 'remote') return props.options;
  const q = term.value.trim().toLowerCase();
  return q ? props.options.filter((o) => o.label.toLowerCase().includes(q)) : props.options;
});

// Reka's model: option keys.
const model = computed(() => (props.multiple ? values.value.map(keyOf) : values.value[0] !== undefined ? keyOf(values.value[0]) : ''));

function pick(next: unknown) {
  const keys = (Array.isArray(next) ? next : next ? [next] : []) as string[];
  const options = keys.map((key) => {
    const found = [...props.options, ...chosen.value].find((o) => keyOf(o.value) === key);
    return found ?? { label: key, value: JSON.parse(key) };
  });
  const value = props.multiple ? options.map((o) => o.value) : (options[0]?.value ?? null);
  emit('update:modelValue', value, options);
  if (!props.multiple) open.value = false;
}

function remove(option: ComboOption) {
  const key = keyOf(option.value);
  const rest = chosen.value.filter((o) => keyOf(o.value) !== key);
  emit('update:modelValue', rest.map((o) => o.value), rest);
}

function clear() {
  emit('update:modelValue', props.multiple ? [] : null, []);
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(term, (text) => {
  if (props.mode !== 'remote') return;
  clearTimeout(timer);
  timer = setTimeout(() => emit('search', text), DEBOUNCE);
});
onBeforeUnmount(() => clearTimeout(timer));

// A fresh search box each time it opens (the options stay as last searched).
watch(open, (isOpen) => {
  if (!isOpen) term.value = '';
});
</script>

<template>
  <ComboboxRoot
    v-model:open="open"
    :model-value="model"
    :multiple="multiple"
    :disabled="editable"
    ignore-filter
    :reset-search-term-on-blur="false"
    :reset-search-term-on-select="false"
    @update:model-value="pick"
  >
    <ComboboxAnchor class="relative w-full">
      <ComboboxTrigger
        :id="id"
        :class="
          cn(
            'flex min-h-9 w-full items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 pr-14 text-left text-sm shadow-xs',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60'
          )
        "
      >
        <span v-if="!chosen.length" class="truncate text-muted-foreground">
          {{ placeholder ?? t('apps.field.choose') }}
        </span>
        <span v-else-if="!multiple" class="truncate">{{ chosen[0].label }}</span>
        <span v-else class="flex flex-wrap gap-1">
          <span
            v-for="option in chosen"
            :key="keyOf(option.value)"
            class="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs"
          >
            {{ option.label }}
            <X
              v-if="!editable"
              class="size-3 cursor-pointer opacity-60 hover:opacity-100"
              :aria-label="t('common.clear')"
              @pointerdown.stop.prevent="remove(option)"
            />
          </span>
        </span>
      </ComboboxTrigger>
      <button
        v-if="chosen.length && !editable"
        type="button"
        class="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        :title="t('common.clear')"
        @click="clear"
      >
        <X class="size-3.5" />
      </button>
      <ChevronsUpDown class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
    </ComboboxAnchor>

    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="4"
        class="z-50 w-(--reka-combobox-trigger-width) min-w-48 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
      >
        <div class="flex items-center gap-2 border-b px-3">
          <Search class="size-4 shrink-0 opacity-50" />
          <ComboboxInput
            v-model="term"
            auto-focus
            class="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            :placeholder="t('apps.field.search')"
          />
          <Loader2 v-if="busy" class="size-4 shrink-0 animate-spin opacity-60" data-testid="combo-busy" />
        </div>
        <ComboboxViewport class="max-h-60 overflow-y-auto p-1">
          <ComboboxItem
            v-for="option in shown"
            :key="keyOf(option.value)"
            :value="keyOf(option.value)"
            class="relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
          >
            <Check
              v-if="values.some((v) => keyOf(v) === keyOf(option.value))"
              class="absolute left-2 size-4"
            />
            {{ option.label }}
          </ComboboxItem>
          <div v-if="!shown.length" class="py-5 text-center text-sm text-muted-foreground">
            {{
              mode === 'remote' && busy
                ? t('apps.field.searching')
                : mode === 'remote' && !term.trim() && !options.length
                  ? t('apps.field.typeToSearch')
                  : t('apps.field.noMatches')
            }}
          </div>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
