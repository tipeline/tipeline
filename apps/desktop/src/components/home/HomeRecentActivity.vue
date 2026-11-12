<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Workflow } from 'lucide-vue-next';
import { generateIdentifier } from '@tipeline/utils';
import { useQuery } from '@/composables/useQuery';
import { useStreamListener } from '@/composables/useStreamListener';
import type { Item } from '@/config/tables/HomeRecentActivity';
import { mergeRunEvents } from '@/utils/mergeRunEvents';
import { SEND } from '@/ipc-channels';
import { HOME_HEADING, HOME_HEADING_ROW, HOME_LINK } from '@/config/homeStyles';
import { ENTITY_COLORS } from '@/config/entityColors';
import { dayGroupLabel, groupByDay, type DayGroup } from '@/utils/dayGroups';

// Home's Recent runs: the same table as Recently opened (grouped by day, sticky header): the
// workflow with how the run went under it, and when it ran. It fills its card and scrolls.
const props = withDefaults(defineProps<{ limit?: number }>(), { limit: 30 });

const { t } = useI18n();
const router = useRouter();

const { data: pipelineData, isLoading, error } = useQuery<Item[]>(SEND.PIPELINE_LIST, {});
const { events } = useStreamListener();

const runs = computed<Item[]>(() => mergeRunEvents(pipelineData.value ?? [], events.value).slice(0, props.limit));

const statusDot: Record<Item['status'], string> = {
  running: 'bg-blue-500',
  completed: 'bg-emerald-500',
  failed: 'bg-destructive',
  pending: 'bg-muted-foreground/50',
  paused: 'bg-amber-500',
  canceled: 'bg-muted-foreground/50',
};

const ranAt = (run: Item) => new Date(run.finished_at ?? run.started_at);
const groups = computed(() => groupByDay(runs.value, ranAt));

function when(run: Item, group: DayGroup): string {
  if (run.status === 'running') return t('recentActivity.now');
  return dayGroupLabel(ranAt(run), group);
}

const statusInk: Record<Item['status'], string> = {
  running: 'text-blue-700 dark:text-blue-300',
  completed: 'text-muted-foreground',
  failed: 'text-destructive',
  pending: 'text-muted-foreground',
  paused: 'text-amber-700 dark:text-amber-400',
  canceled: 'text-muted-foreground',
};

function open(run: Item) {
  if (run.task_identifier) router.push(`/tasks/${run.task_identifier}/pipelines/${run.identifier}`);
}

// A pipeline only appears above via the initial fetch or a live 'start'/'action'
// event. A detached run (e.g. a `subtask.exec(async: true)` child) has no
// TaskStreamListener wired up for its correlationId, so it never broadcasts at
// all — it would stay invisible here until the widget remounts. Polls
// unconditionally (see Activity.vue for why gating on "something already-known
// is running" isn't reliable) via a direct IPC call rather than useQuery's
// refetch(), so a background poll doesn't flash the loading state.
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollPipelines() {
  try {
    const fresh: Item[] =
      (await window.ipcRenderer.invoke(SEND.PIPELINE_LIST, {
        correlationId: generateIdentifier(),
        payload: {},
      })) ?? [];
    const byIdentifier = new Map((pipelineData.value ?? []).map((p) => [p.identifier, p]));
    for (const item of fresh) byIdentifier.set(item.identifier, item);
    pipelineData.value = Array.from(byIdentifier.values());
  } catch {
    // Best-effort refresh — live events remain the primary update path.
  }
}

onMounted(() => {
  pollTimer = setInterval(pollPipelines, 8000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <section class="flex flex-col gap-2 min-h-0" aria-labelledby="home-runs-title">
    <div :class="HOME_HEADING_ROW">
      <h2 id="home-runs-title" :class="HOME_HEADING">{{ t('recentActivity.title') }}</h2>
      <button type="button" :class="HOME_LINK" @click="router.push('/activity')">{{ t('recentActivity.viewAll') }}</button>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scroll-fade border border-border rounded-md bg-card">
      <p v-if="isLoading" class="text-sm text-muted-foreground px-4 py-3 m-0">{{ t('recentActivity.loading') }}</p>
      <p v-else-if="error" class="text-sm text-destructive px-4 py-3 m-0">{{ error }}</p>
      <p v-else-if="!runs.length" class="text-sm text-muted-foreground px-4 py-3 m-0">{{ t('recentActivity.empty') }}</p>
      <table v-else class="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr class="text-xs text-muted-foreground">
            <th class="sticky top-0 z-10 bg-card text-left font-medium px-4 py-2 border-b border-border">
              {{ t('recentActivity.workflow') }}
            </th>
            <th class="sticky top-0 z-10 bg-card text-right font-medium px-4 py-2 border-b border-border w-px whitespace-nowrap">
              {{ t('recentActivity.ran') }}
            </th>
          </tr>
        </thead>
        <tbody v-for="group in groups" :key="group.key">
          <tr>
            <th colspan="2" scope="colgroup" class="text-left px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {{ t(`dashboard.recentItems.groups.${group.key}`) }}
            </th>
          </tr>
          <tr
            v-for="run in group.rows"
            :key="run.identifier"
            class="hover:bg-muted/50 transition-colors cursor-pointer"
            @click="open(run)"
          >
            <td class="px-4 py-1.5 max-w-0">
              <button type="button" class="flex items-center gap-2.5 min-w-0 w-full text-left" @click.stop="open(run)">
                <span class="relative flex items-center justify-center w-7 h-7 rounded-md shrink-0" :class="ENTITY_COLORS.workflow.tint">
                  <Workflow class="w-3.5 h-3.5" />
                  <span class="absolute -bottom-0.5 -right-0.5 flex w-2.5 h-2.5">
                    <span v-if="run.status === 'running'" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span class="relative inline-flex w-2.5 h-2.5 rounded-full ring-2 ring-card" :class="statusDot[run.status]" />
                  </span>
                </span>
                <span class="min-w-0">
                  <p class="text-sm font-medium truncate m-0">{{ run.task_name ?? run.task_identifier }}</p>
                  <span class="block text-xs truncate" :class="statusInk[run.status]">{{ t(`taskHistory.${run.status}`) }}</span>
                </span>
              </button>
            </td>
            <td class="px-4 py-1.5 text-xs text-muted-foreground text-right whitespace-nowrap">
              {{ when(run, group.key) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
