<script setup>
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { useIcon } from '@/composables/useIcon';
import { useSaveTask } from '@/composables/useSaveTask';

const props = defineProps({
  hasOrderingErrors: { type: Boolean, default: false },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  /** The projects the workflow is in: in several, a save changes it in all of them. */
  projects: { type: Array, default: () => [] },
});
const { isDirty } = useSaveTask();
const { getIconComponent } = useIcon();
const { t } = useI18n();
const emit = defineEmits(['save', 'debug', 'undo', 'redo']);
</script>

<template>
  <div class="flex items-center gap-1">
    <span
      v-if="props.projects.length > 1"
      class="mr-1 inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300"
      :title="t('builder.inProjectsHint', { names: props.projects.map((p) => p.name).join(', ') })"
    >
      {{ t('builder.inProjects', { count: props.projects.length }) }}
    </span>
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
