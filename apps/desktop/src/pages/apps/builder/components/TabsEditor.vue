<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { AppTab } from '@tipeline/schemas';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-vue-next';
import BindingInput from './BindingInput.vue';
import { Button } from '@/components/ui/button';

// Edits a tabs component's tabs. Ids are generated and never change, so children
// (`parent.tab`) and bindings on `activeTab` keep pointing at the same tab when it is
// relabelled or reordered. A label can be a binding. Emits the whole new list on every
// change.
const props = defineProps<{ modelValue: AppTab[] }>();
const emit = defineEmits<{ 'update:modelValue': [tabs: AppTab[]] }>();
const { t } = useI18n();

function commit(tabs: AppTab[]) {
  emit('update:modelValue', tabs);
}

function relabel(index: number, label: string) {
  const text = label.trim();
  if (!text || text === props.modelValue[index].label) return;
  commit(props.modelValue.map((tab, i) => (i === index ? { ...tab, label: text } : tab)));
}

function add() {
  let n = props.modelValue.length + 1;
  while (props.modelValue.some((tab) => tab.id === `tab${n}`)) n++;
  commit([...props.modelValue, { id: `tab${n}`, label: `Tab ${n}` }]);
}

function move(index: number, delta: number) {
  const next = [...props.modelValue];
  const [tab] = next.splice(index, 1);
  next.splice(index + delta, 0, tab);
  commit(next);
}

function remove(index: number) {
  commit(props.modelValue.filter((_, i) => i !== index));
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div v-for="(tab, index) in modelValue" :key="tab.id" class="flex items-center gap-1">
      <BindingInput
        :model-value="tab.label"
        class="flex-1"
        @commit="(v) => relabel(index, v)"
      />
      <span class="font-mono text-[10px] text-muted-foreground w-9 truncate" :title="tab.id">{{ tab.id }}</span>
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
      <button
        :disabled="modelValue.length <= 1"
        class="disabled:opacity-30"
        :title="t('common.remove')"
        @click="remove(index)"
      >
        <Trash2 class="size-3 text-destructive" />
      </button>
    </div>
    <Button size="sm" variant="secondary" class="h-7 text-xs" @click="add">
      <Plus class="size-3" /> {{ t('builder.tabs.add') }}
    </Button>
    <p class="text-xs text-muted-foreground m-0">{{ t('builder.tabs.hint') }}</p>
  </div>
</template>
