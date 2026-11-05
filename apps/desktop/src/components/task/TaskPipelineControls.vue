<script setup>
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { useIcon } from '@/composables/useIcon';
import { useSaveTask } from '@/composables/useSaveTask';

const props = defineProps({
  hasOrderingErrors: { type: Boolean, default: false },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
});
const { isDirty } = useSaveTask();
const { getIconComponent } = useIcon();
const { t } = useI18n();
const emit = defineEmits(['save', 'debug', 'undo', 'redo']);
</script>

<template>
  <div class="flex items-center gap-1">
    <Button
      variant="ghost"
      size="icon"
      :disabled="!props.canUndo"
      :title="`${t('builder.undo')} (⌘Z)`"
      :aria-label="t('builder.undo')"
      @click="emit('undo')"
    >
      <component :is="getIconComponent('Undo2')" class="w-4 h-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      :disabled="!props.canRedo"
      :title="`${t('builder.redo')} (⇧⌘Z)`"
      :aria-label="t('builder.redo')"
      @click="emit('redo')"
    >
      <component :is="getIconComponent('Redo2')" class="w-4 h-4" />
    </Button>
    <Button
      variant="ghost"
      type="submit"
      :disabled="!isDirty"
      :class="[!isDirty ? 'text-muted-foreground cursor-not-allowed' : '']"
      @click="emit('save')"
    >
      <component :is="getIconComponent('Save')" class="w-4 h-4" />
      {{ t('builder.save') }}
      <kbd
        class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
      >
        <span class="text-xs">⌘</span>S
      </kbd>
    </Button>
    <Button
      variant="ghost"
      type="submit"
      :disabled="props.hasOrderingErrors"
      :title="props.hasOrderingErrors ? 'Fix errors in the builder before running' : undefined"
      @click="emit('debug')"
    >
      <component :is="getIconComponent('Bug')" class="w-4 h-4" />{{ t('builder.testRun') }}
      <kbd
        class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
      >
        <span class="text-xs">⌘</span>⏎
      </kbd>
    </Button>
  </div>
</template>
