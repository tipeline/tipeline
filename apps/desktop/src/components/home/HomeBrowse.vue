<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { TagIcon } from 'lucide-vue-next';
import Card from '@/components/Card.vue';
import HomeFilter from '@/components/home/HomeFilter.vue';
import { Button } from '@/components/ui/button';
import type { TaskItem } from '@/config/tables/TasksList';
import { normalizeTags } from '@/utils/taskTags';
import { useQuery } from '@/composables/useQuery';
import { useRecentItemsStore } from '@/store/recentItems';
import { useRememberedChoice } from '@/composables/useRememberedChoice';
import { SEND } from '@/ipc-channels';

// Two ways into the workflow list: by tag, or by project (as cards). Opens on the tab used last.
const props = defineProps<{ tasks: TaskItem[] | null | undefined }>();

type ProjectItem = {
  identifier: string;
  name: string;
  color?: string;
  task_count: number;
  app_count: number;
};

const MAX_TAGS = 16;

const { t } = useI18n();
const router = useRouter();
const recentItemsStore = useRecentItemsStore();
const { data: projects } = useQuery<ProjectItem[]>(SEND.PROJECT_LIST);

const TABS = ['tags', 'projects'] as const;
const tab = useRememberedChoice('browseTab', TABS, 'tags');
const tabOptions = computed(() => [
  { value: 'tags' as const, label: t('dashboard.browse.tags') },
  { value: 'projects' as const, label: t('dashboard.browse.projects') },
]);

const topTags = computed<{ tag: string; count: number }[]>(() => {
  const counts = new Map<string, number>();
  for (const task of props.tasks ?? []) {
    for (const tag of normalizeTags(task.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TAGS);
});

// Recently opened projects first, then the biggest.
const projectList = computed<ProjectItem[]>(() => {
  const all = projects.value ?? [];
  const byIdentifier = new Map(all.map((p) => [p.identifier, p]));
  const recentFirst = recentItemsStore
    .recent('project', Infinity)
    .map((i) => byIdentifier.get(i.identifier))
    .filter((p): p is ProjectItem => !!p);
  const seen = new Set(recentFirst.map((p) => p.identifier));
  const rest = all
    .filter((p) => !seen.has(p.identifier))
    .sort((a, b) => b.task_count + b.app_count - (a.task_count + a.app_count));
  return [...recentFirst, ...rest];
});

function viewAll() {
  router.push(tab.value === 'tags' ? '/tags' : '/projects');
}
</script>

<template>
  <Card classContent="p-0">
    <template #title>{{ t('dashboard.browse.title') }}</template>
    <template #actions>
      <HomeFilter v-model="tab" :options="tabOptions" :label="t('dashboard.browse.title')" />
      <Button variant="outline" size="sm" @click="viewAll">{{ t('dashboard.browse.viewAll') }}</Button>
    </template>
    <template #content>
      <template v-if="tab === 'tags'">
        <div v-if="topTags.length" class="flex flex-wrap gap-2 px-6 pb-5">
          <button
            v-for="{ tag, count } in topTags"
            :key="tag"
            type="button"
            class="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-full bg-card hover:bg-muted/50 transition-colors text-xs font-medium"
            @click="router.push({ path: '/tasks', query: { tags: tag } })"
          >
            <TagIcon class="w-3 h-3 text-muted-foreground" />
            {{ tag }}
            <span class="text-muted-foreground">{{ count }}</span>
          </button>
        </div>
        <p v-else class="text-sm text-muted-foreground px-6 pb-5 m-0">{{ t('dashboard.browse.noTags') }}</p>
      </template>

      <template v-else>
        <div
          v-if="projectList.length"
          class="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] px-6 pb-5 max-h-56 overflow-y-auto scroll-fade"
        >
          <button
            v-for="project in projectList"
            :key="project.identifier"
            type="button"
            class="flex flex-col gap-1 px-3.5 py-3 border border-border rounded-md bg-card hover:bg-muted/50 transition-colors text-left min-w-0"
            @click="router.push(`/projects/${project.identifier}`)"
          >
            <span class="flex items-center gap-2 min-w-0">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :style="{ backgroundColor: project.color || 'var(--muted-foreground)' }"
              />
              <span class="text-sm font-medium truncate">{{ project.name }}</span>
            </span>
            <span class="text-xs text-muted-foreground truncate">
              {{ t('dashboard.browse.workflowCount', project.task_count) }} · {{ t('dashboard.browse.appCount', project.app_count) }}
            </span>
          </button>
        </div>
        <p v-else class="text-sm text-muted-foreground px-6 pb-5 m-0">{{ t('projects.empty') }}</p>
      </template>
    </template>
  </Card>
</template>
