<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useDragAndDrop } from '@formkit/drag-and-drop/vue';
import { animations } from '@formkit/drag-and-drop';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { GripVerticalIcon, PlusIcon, XIcon } from 'lucide-vue-next';

const props = defineProps<{ modelValue: string | any[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const parseItems = (val: string | any[]): any[] => {
  // A copy: the value can be readonly (VariableForm passes vee-validate's `values`).
  if (Array.isArray(val)) return JSON.parse(JSON.stringify(val));
  if (!val?.trim()) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const isScalar = (val: any) => val === null || typeof val !== 'object';

const preview = (val: any) => {
  const str = JSON.stringify(val);
  return str.length > 60 ? str.slice(0, 57) + '…' : str;
};

// Coerce edited string back to the original type of that position.
const coerceToOriginal = (val: string, original: any): any => {
  if (typeof original === 'number') {
    const n = Number(val);
    return isNaN(n) ? val : n;
  }
  if (typeof original === 'boolean') return val === 'true';
  return val;
};

const containerRef = ref<HTMLElement>();

const [parentRef, items] = useDragAndDrop<any>(parseItems(props.modelValue), {
  dragHandle: '.drag-handle',
  plugins: [animations()],
  draggable: (el) => !el.classList.contains('add-row-trigger'),
});

onMounted(() => {
  parentRef.value = containerRef.value;
});

const sync = () => emit('update:modelValue', JSON.stringify(items.value));

watch(items, sync, { deep: true });

const add = () => {
  items.value.push('');
};

const remove = (i: number) => {
  items.value.splice(i, 1);
};

const update = (i: number, val: string) => {
  items.value[i] = coerceToOriginal(val, items.value[i]);
};
</script>

<template>
  <div ref="containerRef" class="space-y-1">
    <div v-for="(item, i) in items" :key="i" class="flex items-center gap-2">
      <span class="drag-handle shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground">
        <GripVerticalIcon :size="15" />
      </span>
      <Input
        v-if="isScalar(item)"
        :model-value="String(item ?? '')"
        :placeholder="`Item ${i + 1}`"
        class="flex-1"
        @update:model-value="update(i, String($event))"
      />
      <div
        v-else
        class="flex-1 min-w-0 flex items-center gap-2 rounded-md border bg-muted px-3 py-1.5 text-xs text-muted-foreground font-mono"
      >
        <span class="shrink-0 text-muted-foreground/60">
          {{ Array.isArray(item) ? '[Array]' : '[Object]' }}
        </span>
        <span class="truncate">{{ preview(item) }}</span>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
        @click="remove(i)"
      >
        <XIcon :size="15" />
      </Button>
    </div>
    <button
      type="button"
      class="add-row-trigger flex items-center gap-1.5 pl-1 pt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      @click="add"
    >
      <PlusIcon :size="13" />
      Add item
    </button>
  </div>
</template>
