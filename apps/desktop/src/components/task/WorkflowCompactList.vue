<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { Lock } from 'lucide-vue-next';
import { Checkbox } from '@/components/ui/checkbox';
import TaskListActions from '@/components/task/TaskListActions.vue';
import { statusDot, thumbnail, workflowBadges, type TaskItem } from '@/config/tables/TasksList';

// The Workflows page's Compact view: one short line per workflow, to scan a long list.
// Actions show on hover; ticking works like the table's checkbox column.
const props = defineProps<{
  items: TaskItem[];
  /** When each workflow was last opened (Recently opened scope), shown instead of the last run. */
  openedAt?: Map<string, string>;
}>();
const emit = defineEmits<{ deleted: []; updated: [] }>();
const selection = defineModel<string[]>('selection', { default: () => [] });

const { t } = useI18n();
const router = useRouter();

function toggle(identifier: string, on: boolean) {
  selection.value = on
    ? [...selection.value, identifier]
    : selection.value.filter((key) => key !== identifier);
}

function when(task: TaskItem): string {
  const opened = props.openedAt?.get(task.identifier);
  if (opened) return t('recentRow.opened', { time: formatDistanceToNow(new Date(opened), { addSuffix: true }) });
  return task.last_run_at ? formatDistanceToNow(new Date(task.last_run_at), { addSuffix: true }) : t('common.never');
}
</script>

<template>
  <div class="border border-border rounded-sm bg-card divide-y divide-border">
    <div
      v-for="task in props.items"
      :key="task.identifier"
      class="group flex items-center gap-3 pl-3 pr-2 h-10 hover:bg-muted/50 transition-colors cursor-pointer"
      :class="selection.includes(task.identifier) ? 'bg-muted/40' : ''"
      @click="router.push(`/tasks/${task.identifier}`)"
    >
      <div class="flex items-center" @click.stop>
        <Checkbox
          :aria-label="t('dataTable.selectRow')"
          :model-value="selection.includes(task.identifier)"
          @update:model-value="toggle(task.identifier, $event === true)"
        />
      </div>
      <component :is="statusDot(task.last_run_status)" />
      <component :is="thumbnail(task.image, 'size-6')" />
      <span class="text-sm font-medium truncate min-w-0" :title="task.name">{{ task.name }}</span>
      <Lock v-if="task.is_owned_by_me === false" class="h-3 w-3 shrink-0 text-muted-foreground/60" />
      <component :is="badge" v-for="(badge, i) in workflowBadges(task, t)" :key="i" />
      <span v-if="task.source_type === 'hub'" class="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 shrink-0">
        {{ t('tasks.hub') }}
      </span>
      <span class="flex-1 min-w-0 truncate text-xs text-muted-foreground/70">
        {{ task.tags.join(' · ') }}
      </span>
      <span class="text-xs text-muted-foreground shrink-0 whitespace-nowrap group-hover:hidden">{{ when(task) }}</span>
      <div class="hidden group-hover:block focus-within:block shrink-0" @click.stop>
        <TaskListActions :item="task" :on-deleted="() => emit('deleted')" :on-updated="() => emit('updated')" />
      </div>
    </div>
  </div>
</template>
