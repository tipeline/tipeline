<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import AppListActions from '@/components/app/AppListActions.vue';
import { descriptionSummary } from '@tipeline/utils';
import { thumbnail, type AppItem } from '@/config/tables/AppsList';
import { sourceClasses } from '@/config/tables/TasksList';

// The Apps page's Cards view: one tile per app with its picture, description and author.
// Ticking works like the table's checkbox column.
const props = defineProps<{
  items: AppItem[];
  /** When each app was last opened (Recently opened scope), shown on the tile. */
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
      v-for="app in props.items"
      :key="app.identifier"
      class="group relative flex flex-col gap-3 p-4 border rounded-md bg-card hover:bg-muted/40 transition-colors cursor-pointer"
      :class="selection.includes(app.identifier) ? 'border-primary' : 'border-border'"
      @click="router.push(`/apps/${app.identifier}`)"
    >
      <div class="flex items-start gap-3">
        <component :is="thumbnail(app.image, 'size-10')" />
        <div class="flex flex-col gap-1 min-w-0 flex-1">
          <p class="font-medium leading-tight truncate m-0" :title="app.name">{{ app.name }}</p>
          <div class="flex items-center gap-1.5 flex-wrap">
            <Badge v-if="app.source_type" :class="sourceClasses[app.source_type] ?? ''">{{ app.source_type }}</Badge>
            <span v-if="app.version" class="font-mono text-[11px] text-muted-foreground">{{ app.version }}</span>
          </div>
        </div>
        <div
          class="shrink-0 transition-opacity"
          :class="selection.length > 0 ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'"
          @click.stop
        >
          <Checkbox
            :aria-label="t('dataTable.selectRow')"
            :model-value="selection.includes(app.identifier)"
            @update:model-value="toggle(app.identifier, $event === true)"
          />
        </div>
      </div>

      <p
        class="text-sm text-muted-foreground line-clamp-2 m-0 min-h-[2.5rem]"
        :class="app.description ? '' : 'italic opacity-60'"
      >
        {{ app.description ? descriptionSummary(app.description) : t('listViews.views.noDescription') }}
      </p>

      <div class="mt-auto pt-3 border-t border-border flex items-center gap-2 min-h-9">
        <span class="text-xs text-muted-foreground truncate flex-1 min-w-0">
          <template v-if="props.openedAt?.get(app.identifier)">
            {{ t('recentRow.opened', { time: formatDistanceToNow(new Date(props.openedAt.get(app.identifier)!), { addSuffix: true }) }) }}
          </template>
          <template v-else>{{ app.author || '—' }}</template>
        </span>
        <div class="shrink-0" @click.stop>
          <AppListActions :item="app" :on-deleted="() => emit('deleted')" :on-updated="() => emit('updated')" />
        </div>
      </div>
    </div>
  </div>
</template>
