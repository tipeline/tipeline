<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { Lock } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import TaskListActions from '@/components/task/TaskListActions.vue';
import { descriptionSummary } from '@tipeline/utils';
import {
  lastRunLabel,
  sourceClasses,
  statusDot,
  thumbnail,
  workflowBadges,
  type TaskItem,
} from '@/config/tables/TasksList';

// The Workflows page's Cards view: one tile per workflow with its picture, description,
// tags and last run. Ticking works like the table's checkbox column.
const props = defineProps<{
  items: TaskItem[];
  /** When each workflow was last opened (Recently opened scope), shown on the tile. */
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
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
    <div
      v-for="task in props.items"
      :key="task.identifier"
      class="group relative flex flex-col gap-3 p-4 border rounded-md bg-card hover:bg-muted/40 transition-colors cursor-pointer"
      :class="selection.includes(task.identifier) ? 'border-primary' : 'border-border'"
      @click="router.push(`/tasks/${task.identifier}`)"
    >
      <div class="flex items-start gap-3">
        <component :is="thumbnail(task.image, 'size-10')" />
        <div class="flex flex-col gap-1 min-w-0 flex-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <p class="font-medium leading-tight truncate m-0" :title="task.name">{{ task.name }}</p>
            <Lock
              v-if="task.is_owned_by_me === false"
              class="h-3 w-3 shrink-0 text-muted-foreground/60"
              :title="task.owned_by_email ?? undefined"
            />
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <Badge :class="sourceClasses[task.source_type] ?? ''">{{ task.source_type }}</Badge>
            <component :is="badge" v-for="(badge, i) in workflowBadges(task, t)" :key="i" />
            <span v-if="task.version" class="font-mono text-[11px] text-muted-foreground">{{ task.version }}</span>
          </div>
        </div>
        <div
          class="shrink-0 transition-opacity"
          :class="selection.length > 0 ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'"
          @click.stop
        >
          <Checkbox
            :aria-label="t('dataTable.selectRow')"
            :model-value="selection.includes(task.identifier)"
            @update:model-value="toggle(task.identifier, $event === true)"
          />
        </div>
      </div>

      <p
        class="text-sm text-muted-foreground line-clamp-2 m-0 min-h-[2.5rem]"
        :class="task.description ? '' : 'italic opacity-60'"
      >
        {{ task.description ? descriptionSummary(task.description) : t('listViews.views.noDescription') }}
      </p>

      <div v-if="task.tags.length" class="flex flex-wrap gap-1">
        <span
          v-for="tag in task.tags"
          :key="tag"
          class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>

      <div class="mt-auto pt-3 border-t border-border flex items-center gap-2 min-h-9">
        <component :is="statusDot(task.last_run_status)" />
        <span class="text-xs text-muted-foreground truncate flex-1 min-w-0">
          <template v-if="props.openedAt?.get(task.identifier)">
            {{ t('recentRow.opened', { time: formatDistanceToNow(new Date(props.openedAt.get(task.identifier)!), { addSuffix: true }) }) }}
          </template>
          <template v-else>
            {{ lastRunLabel(task, t) }}
            <template v-if="task.last_run_at">
              · {{ formatDistanceToNow(new Date(task.last_run_at), { addSuffix: true }) }}
            </template>
          </template>
        </span>
        <div class="shrink-0" @click.stop>
          <TaskListActions :item="task" :on-deleted="() => emit('deleted')" :on-updated="() => emit('updated')" />
        </div>
      </div>
    </div>
  </div>
</template>
