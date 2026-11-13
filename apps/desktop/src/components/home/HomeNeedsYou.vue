<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';
import { CheckIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import type { TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import { useInbox } from '@/composables/useInbox';
import { useTaskExecution } from '@/composables/useTaskExecution';
import { HOME_HEADING, HOME_HEADING_ROW, HOME_LINK } from '@/config/homeStyles';

// Home's first section: everything only the user can act on — approvals to decide, workflows
// whose last run failed, scheduled runs that didn't happen — newest first, each with what to
// do about it. With nothing there it says so plainly, and shows what runs next, so a glance
// is enough.
const props = defineProps<{
  tasks: TaskItem[] | null | undefined;
  schedules: ScheduleItem[] | null | undefined;
}>();

const { t } = useI18n();
const router = useRouter();
const { approvals, failing, missed, count, dismiss, dismissMissed } = useInbox(
  toRef(props, 'tasks'),
  toRef(props, 'schedules')
);
const { executeTask } = useTaskExecution();

type Kind = 'approval' | 'failed' | 'missed';
type Row = {
  key: string;
  kind: Kind;
  title: string;
  detail: string;
  at: string | null;
  primary: { label: string; run: () => void };
  secondary?: { label: string; run: () => void };
};

// How many of the latest runs failed one after another.
function failedInARow(task: TaskItem): number {
  const runs = task.recent_runs ?? [];
  let n = 0;
  while (n < runs.length && runs[n] === 'failed') n++;
  return Math.max(1, n);
}

function openFailedRun(task: TaskItem) {
  if (task.last_run_identifier) {
    router.push({ name: 'PipelineDetail', params: { tid: task.identifier, pipelineId: task.last_run_identifier } });
  } else {
    router.push(`/tasks/${task.identifier}`);
  }
}

function runNow(schedule: ScheduleItem) {
  executeTask(schedule.taskIdentifier, JSON.parse(JSON.stringify(schedule.variables ?? {})));
  dismissMissed(schedule);
}

function missedTime(iso: string): string {
  const date = new Date(iso);
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'EEE d MMM HH:mm');
}

const rows = computed<Row[]>(() => {
  const list: Row[] = [
    ...approvals.value.map((item) => ({
      key: `approval:${item.pipelineIdentifier}`,
      kind: 'approval' as const,
      title: item.title,
      detail: t('dashboard.needs.approvalDetail', { workflow: item.workflowName }),
      at: item.requestedAt ?? null,
      primary: { label: t('dashboard.needs.review'), run: () => router.push('/approvals') },
    })),
    ...failing.value.map((task) => {
      const times = failedInARow(task);
      return {
        key: `failed:${task.identifier}`,
        kind: 'failed' as const,
        title: task.name,
        detail: times > 1 ? t('dashboard.needs.failedTimes', { n: times }) : t('dashboard.needs.failedOnce'),
        at: task.last_run_at,
        primary: { label: t('dashboard.needs.openRun'), run: () => openFailedRun(task) },
        secondary: { label: t('dashboard.needs.dismiss'), run: () => dismiss(task) },
      };
    }),
    ...missed.value.map((schedule) => ({
      key: `missed:${schedule.scheduleIdentifier}`,
      kind: 'missed' as const,
      title: schedule.taskName,
      detail: t('dashboard.needs.missedDetail', { time: missedTime(schedule.missedAt!) }),
      at: schedule.missedAt ?? null,
      primary: { label: t('dashboard.needs.runNow'), run: () => runNow(schedule) },
      secondary: { label: t('dashboard.needs.dismiss'), run: () => dismissMissed(schedule) },
    })),
  ];
  return list.sort((a, b) => Date.parse(b.at ?? '0') - Date.parse(a.at ?? '0'));
});

const badge: Record<Kind, string> = {
  failed: 'bg-destructive/10 text-red-700 dark:text-red-400',
  approval: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  missed: 'bg-muted text-foreground/80',
};

const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '');

// For the all-clear state: the next few scheduled runs.
const comingUp = computed(() =>
  (props.schedules ?? [])
    .filter((s) => s.enabled && s.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))
    .slice(0, 3)
);
function nextLabel(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isTomorrow(date)) return t('dashboard.needs.tomorrowAt', { time: format(date, 'HH:mm') });
  return format(date, 'EEE HH:mm');
}
</script>

<template>
  <section class="flex flex-col gap-2" aria-labelledby="home-needs-title">
    <div :class="HOME_HEADING_ROW">
      <h2 id="home-needs-title" :class="HOME_HEADING">
        {{ t('dashboard.needs.title') }}
        <span
          v-if="count"
          class="text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-red-700 dark:text-red-400"
        >
          {{ count }}
        </span>
      </h2>
      <button v-if="failing.length" type="button" :class="HOME_LINK" @click="router.push({ path: '/tasks', query: { scope: 'failing' } })">
        {{ t('dashboard.needs.allFailing') }}
      </button>
    </div>

    <ul v-if="rows.length" class="m-0 p-0 list-none border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
      <li v-for="row in rows" :key="row.key" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span class="shrink-0 w-20 text-center text-xs font-semibold rounded-md px-2 py-1" :class="badge[row.kind]">
          {{ t(`dashboard.needs.kind.${row.kind}`) }}
        </span>
        <div class="flex-1 min-w-48">
          <p class="text-sm font-semibold m-0 truncate">{{ row.title }}</p>
          <p class="text-xs text-muted-foreground m-0 mt-0.5 truncate">{{ row.detail }}</p>
        </div>
        <span class="text-xs text-muted-foreground shrink-0 w-28 text-right">{{ ago(row.at) }}</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <Button size="sm" @click="row.primary.run()">{{ row.primary.label }}</Button>
          <Button v-if="row.secondary" size="sm" variant="outline" @click="row.secondary.run()">
            {{ row.secondary.label }}
          </Button>
        </div>
      </li>
    </ul>

    <div
      v-else
      class="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/60 dark:bg-emerald-950/30"
    >
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <span class="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/50 shrink-0">
          <CheckIcon class="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <p class="text-sm font-semibold m-0 text-emerald-900 dark:text-emerald-200">{{ t('dashboard.needs.clearTitle') }}</p>
          <p class="text-xs m-0 mt-0.5 text-emerald-800 dark:text-emerald-300/90">{{ t('dashboard.needs.clearDetail') }}</p>
        </div>
      </div>
      <div v-if="comingUp.length" class="flex flex-col gap-1 min-w-56">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300/90 m-0">
          {{ t('dashboard.needs.comingUp') }}
        </p>
        <button
          v-for="s in comingUp"
          :key="s.scheduleIdentifier"
          type="button"
          class="flex items-baseline gap-3 -mx-2 px-2 py-0.5 rounded-md text-left text-sm transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/50"
          @click="router.push(`/tasks/${s.taskIdentifier}`)"
        >
          <!-- The whole row is the target: it lights up on hover, no underline. -->
          <span class="w-28 shrink-0 whitespace-nowrap font-semibold tabular-nums text-emerald-900 dark:text-emerald-200">{{ nextLabel(s.nextRunAt!) }}</span>
          <span class="truncate text-emerald-950 dark:text-emerald-100">{{ s.taskName }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
