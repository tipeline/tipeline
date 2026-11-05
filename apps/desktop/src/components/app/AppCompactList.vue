<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import AppListActions from '@/components/app/AppListActions.vue';
import { descriptionSummary } from '@tipeline/utils';
import { thumbnail, type AppItem } from '@/config/tables/AppsList';

// The Apps page's Compact view: one short line per app, to scan a long list.
// Actions show on hover; ticking works like the table's checkbox column.
const props = defineProps<{
  items: AppItem[];
  /** When each app was last opened (Recently opened scope), shown instead of the author. */
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

function aside(app: AppItem): string {
  const opened = props.openedAt?.get(app.identifier);
  if (opened) return t('recentRow.opened', { time: formatDistanceToNow(new Date(opened), { addSuffix: true }) });
  return app.author ?? '';
}
</script>

<template>
  <div class="border border-border rounded-sm bg-card divide-y divide-border">
    <div
      v-for="app in props.items"
      :key="app.identifier"
      class="group flex items-center gap-3 pl-3 pr-2 h-10 hover:bg-muted/50 transition-colors cursor-pointer"
      :class="selection.includes(app.identifier) ? 'bg-muted/40' : ''"
      @click="router.push(`/apps/${app.identifier}`)"
    >
      <div class="flex items-center" @click.stop>
        <Checkbox
          :aria-label="t('dataTable.selectRow')"
          :model-value="selection.includes(app.identifier)"
          @update:model-value="toggle(app.identifier, $event === true)"
        />
      </div>
      <component :is="thumbnail(app.image, 'size-6')" />
      <span class="text-sm font-medium truncate min-w-0 shrink-0 max-w-[40%]" :title="app.name">{{ app.name }}</span>
      <span v-if="app.source_type === 'hub'" class="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 shrink-0">
        {{ t('tasks.hub') }}
      </span>
      <span class="flex-1 min-w-0 truncate text-xs text-muted-foreground/70">
        {{ descriptionSummary(app.description) }}
      </span>
      <span class="text-xs text-muted-foreground shrink-0 whitespace-nowrap group-hover:hidden">{{ aside(app) }}</span>
      <div class="hidden group-hover:block focus-within:block shrink-0" @click.stop>
        <AppListActions :item="app" :on-deleted="() => emit('deleted')" :on-updated="() => emit('updated')" />
      </div>
    </div>
  </div>
</template>
