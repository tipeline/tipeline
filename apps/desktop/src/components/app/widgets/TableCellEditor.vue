<script setup lang="ts">
import { computed } from 'vue';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { coerceCell, type TableEditor } from '@/utils/tableEdits';

// One editable cell of an app table. Text, numbers and dates are committed when the
// field loses focus or Enter is pressed (so the table doesn't re-render under the
// cursor while typing); checkboxes and selects right away.
const props = defineProps<{
  editor: TableEditor;
  value: unknown;
  options?: unknown;
  /** Differs from the saved value. */
  changed?: boolean;
  /** Required and empty. */
  invalid?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ update: [value: unknown] }>();

const options = computed(() =>
  (Array.isArray(props.options) ? props.options : []).map((o: any) =>
    o && typeof o === 'object'
      ? { label: String(o.label ?? o.value), value: o.value }
      : { label: String(o), value: o }
  )
);
// <option> values are strings: options are chosen by index.
const selectedIndex = computed(() =>
  String(options.value.findIndex((o) => JSON.stringify(o.value) === JSON.stringify(props.value)))
);

const text = computed(() => {
  if (props.value === null || props.value === undefined) return '';
  // A date input only takes YYYY-MM-DD (a datetime keeps its time when untouched).
  if (props.editor === 'date') return String(props.value).slice(0, 10);
  return typeof props.value === 'object' ? JSON.stringify(props.value) : String(props.value);
});

function commit(raw: unknown) {
  const value = coerceCell(raw, props.editor);
  if (JSON.stringify(value) !== JSON.stringify(props.value ?? (props.editor === 'checkbox' ? false : null)))
    emit('update', value);
}

const fieldClass = computed(() =>
  cn(
    'h-7 w-full min-w-16 rounded-md border border-input bg-white dark:bg-input/30 px-2 text-xs outline-none',
    'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50',
    props.changed && 'border-amber-500/70 bg-amber-500/10 dark:bg-amber-500/15',
    props.invalid && 'border-destructive bg-destructive/5'
  )
);
</script>

<template>
  <div class="flex items-center" @click.stop>
    <Checkbox
      v-if="editor === 'checkbox'"
      :model-value="value === true"
      :disabled="disabled"
      :class="cn(changed && 'ring-2 ring-amber-500/50', invalid && 'ring-2 ring-destructive/50')"
      @update:model-value="(v) => commit(v === true)"
    />
    <select
      v-else-if="editor === 'select'"
      :value="selectedIndex"
      :disabled="disabled"
      :class="fieldClass"
      @change="(e) => commit(options[Number((e.target as HTMLSelectElement).value)]?.value ?? null)"
    >
      <option value="-1" disabled hidden />
      <option v-for="(o, i) in options" :key="i" :value="String(i)">{{ o.label }}</option>
    </select>
    <input
      v-else
      :type="editor === 'number' ? 'number' : editor === 'date' ? 'date' : 'text'"
      :value="text"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :class="fieldClass"
      @change="(e) => commit((e.target as HTMLInputElement).value)"
      @keydown.enter="(e) => (e.target as HTMLInputElement).blur()"
    />
  </div>
</template>
