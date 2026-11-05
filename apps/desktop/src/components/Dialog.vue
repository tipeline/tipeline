<!-- src/components/Dialog.vue -->
<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const props = defineProps<{
  modelValue: boolean;
  title?: string;
  description?: string;
  /** Classes for the dialog box, e.g. another width (default sm:max-w-[700px]). */
  contentClass?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit'): void;
  (e: 'close'): void;
}>();

function onClose() {
  console.log('onClose - Dialog');
}
</script>

<template>
  <Dialog
    :open="props.modelValue"
    @update:open="(v: boolean) => emit('update:modelValue', v)"
  >
    <DialogContent :class="cn('sm:max-w-[700px] max-h-[90vh] flex flex-col', contentClass)">
      <DialogHeader class="shrink-0">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">{{
          description
        }}</DialogDescription>
      </DialogHeader>

      <div class="py-4 overflow-y-auto scroll-fade flex-1 min-h-0">
        <slot />
      </div>

      <DialogFooter v-if="$slots.footer" class="shrink-0 pt-4 sm:justify-start">
        <slot name="footer" />
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
