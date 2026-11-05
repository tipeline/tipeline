<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const props = defineProps<{ open: boolean; maxRow: number }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; submit: [row: number] }>();

const { t } = useI18n();
// Vue's v-model on <input type="number"> always casts to a Number once the
// field holds a valid numeric value (built into vModelText, not opt-in) — so
// this holds a string only while empty/unparseable, a number otherwise.
const rowValue = ref<string | number>('');
const errorMessage = ref('');
const rowInput = ref<InstanceType<typeof Input> | null>(null);

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      rowValue.value = '';
      errorMessage.value = '';
      await nextTick();
      rowInput.value?.focus();
    }
  }
);

watch(rowValue, () => { errorMessage.value = ''; });

function close() {
  emit('update:open', false);
}

function submit() {
  const row = Number(rowValue.value);
  if (!Number.isInteger(row) || row < 1 || row > props.maxRow) {
    errorMessage.value = t('tasks.builder.canvas.goToRow.invalid', { max: props.maxRow });
    return;
  }
  emit('submit', row);
  close();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') submit();
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="max-w-xs"
      @keydown="onKeydown"
      @close-auto-focus="(e: Event) => e.preventDefault()"
    >
      <DialogHeader>
        <DialogTitle>{{ t('tasks.builder.canvas.goToRow.title') }}</DialogTitle>
      </DialogHeader>
      <Input
        ref="rowInput"
        v-model="rowValue"
        type="number"
        min="1"
        :max="maxRow"
        :aria-invalid="!!errorMessage"
        :placeholder="t('tasks.builder.canvas.goToRow.placeholder', { max: maxRow })"
      />
      <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
    </DialogContent>
  </Dialog>
</template>
