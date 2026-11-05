<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDragAndDrop } from '@formkit/drag-and-drop/vue';
import { animations } from '@formkit/drag-and-drop';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { GripVerticalIcon, PlusIcon, XIcon } from 'lucide-vue-next';

const { t } = useI18n();
const props = defineProps<{ modelValue: string | Record<string, any> }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

type Pair = { key: string; value: any };

const parsePairs = (val: string | Record<string, any>): Pair[] => {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return Object.entries(val).map(([key, value]) => ({ key, value }));
  }
  if (!val || !(val as string)?.trim()) return [];
  try {
    const parsed = JSON.parse(val as string);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([key, value]) => ({ key, value }));
    }
  } catch {}
  return [];
};

const isScalar = (val: any) => val === null || typeof val !== 'object';

const preview = (val: any) => {
  const str = JSON.stringify(val);
  return str.length > 50 ? str.slice(0, 47) + '…' : str;
};

const coerceToOriginal = (val: string, original: any): any => {
  if (typeof original === 'number') {
    const n = Number(val);
    return isNaN(n) ? val : n;
  }
  if (typeof original === 'boolean') return val === 'true';
  return val;
};

const containerRef = ref<HTMLElement>();

const [parentRef, pairs] = useDragAndDrop<Pair>(parsePairs(props.modelValue), {
  dragHandle: '.drag-handle',
  plugins: [animations()],
  draggable: (el) => !el.classList.contains('add-row-trigger'),
});

onMounted(() => {
  parentRef.value = containerRef.value;
});

const sync = () => {
  const obj: Record<string, any> = {};
  for (const pair of pairs.value) {
    if (pair.key) obj[pair.key] = pair.value;
  }
  emit('update:modelValue', JSON.stringify(obj));
};

watch(pairs, sync, { deep: true });

const add = () => {
  pairs.value.push({ key: '', value: '' });
};

const remove = (i: number) => {
  pairs.value.splice(i, 1);
};

const updateKey = (i: number, key: string) => {
  pairs.value[i].key = key;
};

const updateValue = (i: number, val: string) => {
  pairs.value[i].value = coerceToOriginal(val, pairs.value[i].value);
};
</script>

<template>
  <div ref="containerRef" class="space-y-1">
    <div v-for="(pair, i) in pairs" :key="i" class="flex items-center gap-2">
      <span class="drag-handle shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground">
        <GripVerticalIcon :size="15" />
      </span>
      <Input
        :model-value="pair.key"
        :placeholder="t('common.key')"
        class="w-2/5 shrink-0"
        @update:model-value="updateKey(i, String($event))"
      />
      <Input
        v-if="isScalar(pair.value)"
        :model-value="String(pair.value ?? '')"
        :placeholder="t('common.value')"
        class="flex-1"
        @update:model-value="updateValue(i, String($event))"
      />
      <div
        v-else
        class="flex-1 min-w-0 flex items-center gap-2 rounded-md border bg-muted px-3 py-1.5 text-xs text-muted-foreground font-mono"
      >
        <span class="shrink-0 text-muted-foreground/60">
          {{ Array.isArray(pair.value) ? '[Array]' : '[Object]' }}
        </span>
        <span class="truncate">{{ preview(pair.value) }}</span>
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
      Add property
    </button>
  </div>
</template>
