<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useQuery } from '@/composables/useQuery';
import { useApprovalsStore } from '@/store/approvalsStore';
import { useRecentItemsStore } from '@/store/recentItems';
import { readableInk } from '@/utils/readableColor';
import { HOME_HEADING, HOME_HEADING_ROW, HOME_LINK, HOME_CARD, HOME_PANEL_ROW } from '@/config/homeStyles';
import { SEND } from '@/ipc-channels';
import { Loader2, Plus } from 'lucide-vue-next';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/ui/button/Button.vue';
import ProjectForm from '@/components/project/ProjectForm.vue';
import type { TaskItem } from '@/config/tables/TasksList';

// Home's projects, in its own card under Starred: each project's initials in its own
// color, its counts, and the one thing worth knowing about it. Recently opened projects come
// first, then the biggest. It scrolls inside its card; a New project row closes it.
const props = defineProps<{ tasks: TaskItem[] | null | undefined }>();

type ProjectItem = {
  identifier: string;
  name: string;
  color?: string | null;
  task_count: number;
  app_count: number;
};

// A project without a color of its own.
const FALLBACK_COLOR = '#64748b';

const { t } = useI18n();
const router = useRouter();
const approvals = useApprovalsStore();
const recentItemsStore = useRecentItemsStore();
const { data: projects, isLoading, refetch } = useQuery<ProjectItem[]>(SEND.PROJECT_LIST);

// The same New project dialog as the Projects page.
const openNew = ref(false);
const projectFormRef = ref<InstanceType<typeof ProjectForm> | null>(null);
function handleCreated() {
  openNew.value = false;
  refetch();
}

const ordered = computed<ProjectItem[]>(() => {
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

type Health = { kind: 'failed' | 'waiting' | 'running' | 'ok'; count: number };

// The one thing worth saying about a project, worst first: failures, approvals, running runs.
const healthByProject = computed(() => {
  const workflowsIn = new Map<string, TaskItem[]>();
  const projectsOf = new Map<string, string[]>();
  for (const task of props.tasks ?? []) {
    const ids = (task.projects ?? []).map((p) => p.identifier);
    projectsOf.set(task.identifier, ids);
    for (const id of ids) workflowsIn.set(id, [...(workflowsIn.get(id) ?? []), task]);
  }
  const waiting = new Map<string, number>();
  for (const approval of approvals.actionable) {
    for (const id of projectsOf.get(approval.taskIdentifier) ?? []) waiting.set(id, (waiting.get(id) ?? 0) + 1);
  }

  const result = new Map<string, Health | null>();
  for (const project of ordered.value) {
    const workflows = workflowsIn.get(project.identifier) ?? [];
    const failed = workflows.filter((w) => w.last_run_status === 'failed').length;
    const running = workflows.filter((w) => w.last_run_status === 'running').length;
    const approvalsWaiting = waiting.get(project.identifier) ?? 0;
    if (failed) result.set(project.identifier, { kind: 'failed', count: failed });
    else if (approvalsWaiting) result.set(project.identifier, { kind: 'waiting', count: approvalsWaiting });
    else if (running) result.set(project.identifier, { kind: 'running', count: running });
    // Nothing has run yet: no news rather than "All good".
    else if (workflows.some((w) => w.last_run_status)) result.set(project.identifier, { kind: 'ok', count: 0 });
    else result.set(project.identifier, null);
  }
  return result;
});

const healthInk = {
  failed: 'text-red-700 dark:text-red-400',
  waiting: 'text-amber-800 dark:text-amber-300',
  running: 'text-blue-700 dark:text-blue-300',
  ok: 'text-emerald-700 dark:text-emerald-400',
} as const;

const tiles = computed(() =>
  ordered.value.map((project) => {
    const color = project.color || FALLBACK_COLOR;
    const health = healthByProject.value.get(project.identifier) ?? null;
    const initials = project.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
    return {
      ...project,
      initials,
      health,
      badgeStyle: { backgroundColor: color, color: readableInk(color) },
      healthClass: health ? healthInk[health.kind] : '',
    };
  })
);

function healthLabel(health: Health): string {
  return health.kind === 'ok' ? t('dashboard.projects.ok') : t(`dashboard.projects.${health.kind}`, { n: health.count }, health.count);
}
</script>

<template>
  <section class="flex flex-col gap-2 min-h-0" aria-labelledby="home-projects-title">
    <div :class="HOME_HEADING_ROW">
      <h2 id="home-projects-title" :class="HOME_HEADING">{{ t('dashboard.projects.title') }}</h2>
      <button type="button" :class="HOME_LINK" @click="router.push('/projects')">
        {{ t('dashboard.projects.viewAll') }}
      </button>
    </div>

    <div :class="HOME_CARD">
      <button
        v-for="tile in tiles"
        :key="tile.identifier"
        type="button"
        :class="HOME_PANEL_ROW"
        :data-project="tile.identifier"
        @click="router.push(`/projects/${tile.identifier}`)"
      >
        <span class="flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-semibold shrink-0" :style="tile.badgeStyle">
          {{ tile.initials }}
        </span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">{{ tile.name }}</span>
          <span class="block text-xs text-muted-foreground truncate">
            {{ t('dashboard.projects.workflowCount', tile.task_count) }} · {{ t('dashboard.projects.appCount', tile.app_count) }}
          </span>
        </span>
        <span v-if="tile.health" class="text-xs font-medium whitespace-nowrap" :class="tile.healthClass">
          {{ healthLabel(tile.health) }}
        </span>
      </button>

      <p v-if="!tiles.length && !isLoading" class="text-xs text-muted-foreground px-2 py-1 m-0">
        {{ t('projects.empty') }}
      </p>
      <button
        type="button"
        :class="[HOME_PANEL_ROW, 'text-sm text-muted-foreground hover:text-foreground']"
        @click="openNew = true"
      >
        <span class="flex items-center justify-center w-7 h-7 rounded-md border border-dashed border-muted-foreground/40 shrink-0">
          <Plus class="w-3.5 h-3.5" />
        </span>
        {{ t('projects.new') }}
      </button>
    </div>

    <Dialog v-model="openNew" :title="t('projects.newDialog.title')" :description="t('projects.newDialog.description')">
      <ProjectForm ref="projectFormRef" @close="handleCreated" />
      <template #footer>
        <Button :disabled="projectFormRef?.isWaiting" @click="projectFormRef?.submit()">
          <Loader2 v-if="projectFormRef?.isWaiting" class="w-4 h-4 mr-2 animate-spin" />
          {{ projectFormRef?.isWaiting ? t('common.creating') : t('projects.new') }}
        </Button>
      </template>
    </Dialog>
  </section>
</template>
