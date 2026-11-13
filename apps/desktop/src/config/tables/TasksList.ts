import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import type { Router } from 'vue-router';
import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import TaskListActions from '@/components/task/TaskListActions.vue';
import { Lock, Workflow } from 'lucide-vue-next';
import { toAssetUrl } from '@/utils/assetUrl';
import { descriptionSummary } from '@tipeline/utils';
import type { ProjectTag } from '@/utils/projectAssign';

export type TaskItem = {
  identifier: string;
  name: string;
  description: string | null;
  author: string | null;
  version: string | null;
  tags: string[];
  source_type: 'local' | 'hub';
  /** Every project it's in (none, one or several). */
  projects: ProjectTag[];
  last_run_status: 'pending' | 'running' | 'failed' | 'completed' | 'canceled' | 'paused' | null;
  last_run_at: string | null;
  last_run_identifier?: string | null;
  /** The last ten runs' statuses, newest first (missing from older cores). */
  recent_runs?: NonNullable<TaskItem['last_run_status']>[] | null;
  image?: string | null;
  /** The assistant wrote it and nobody has marked it ready (metadata.draft; SQLite reports 1). */
  draft?: boolean | number | null;
  /** A schedule the assistant proposed with the draft (metadata.draftSchedule, as JSON text). */
  draftSchedule?: string | null;
  /** Other workflows run it for its data (`helper: true` in its source; SQLite reports 1). */
  helper?: boolean | number | null;
  // Set when connected to a server — false means another user owns this task
  is_owned_by_me?: boolean;
  owned_by_email?: string | null;
  owned_by_name?: string | null;
};

export function thumbnail(image: string | null | undefined, size = 'size-8') {
  const src = toAssetUrl(image);
  return h(
    'div',
    { class: `${size} rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0` },
    src
      ? [h('img', { src, class: 'w-full h-full object-cover' })]
      : [h(Workflow, { class: 'size-4 text-muted-foreground/50' })]
  );
}

export const dotColors: Record<string, string> = {
  completed: 'bg-emerald-500',
  running: 'bg-blue-500',
  failed: 'bg-red-500',
  paused: 'bg-yellow-500',
  canceled: 'bg-gray-400',
  pending: 'bg-gray-400',
};

export const sourceClasses: Record<string, string> = {
  local: 'bg-secondary text-secondary-foreground',
  hub: 'bg-indigo-600 text-white dark:text-black',
};

export function statusDot(status: string | null) {
  if (!status) return h('span', { class: 'h-2 w-2 rounded-full shrink-0 bg-muted-foreground/20' });

  if (status === 'running') {
    return h('span', { class: 'relative flex h-2 w-2 shrink-0' }, [
      h('span', { class: 'animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75' }),
      h('span', { class: 'relative inline-flex h-2 w-2 rounded-full bg-blue-500' }),
    ]);
  }

  return h('span', { class: `h-2 w-2 rounded-full shrink-0 ${dotColors[status] ?? 'bg-gray-400'}` });
}

/** The Draft and Helper labels next to a workflow's name. */
export function workflowBadges(row: TaskItem, t: (key: string) => string) {
  return [
    row.draft === true || row.draft === 1
      ? h(
          'span',
          {
            class:
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-500/40 text-amber-700 dark:text-amber-400',
            title: t('tasks.draft.explain'),
          },
          t('tasks.draft.badge')
        )
      : null,
    row.helper === true || row.helper === 1
      ? h(
          'span',
          {
            class:
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-border text-muted-foreground',
            title: t('tasks.helper.explain'),
          },
          t('tasks.helper.badge')
        )
      : null,
  ].filter((badge) => badge !== null);
}

/** "Completed" / "Failed"… for the last run, or "Never". */
export function lastRunLabel(row: TaskItem, t: (key: string) => string): string {
  if (!row.last_run_status) return t('common.never');
  const statusKey = `taskHistory.${row.last_run_status}`;
  return t(statusKey) !== statusKey ? t(statusKey) : row.last_run_status;
}

const STRIP_SLOTS = 10;
const stripColor: Record<string, string> = {
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  running: 'bg-blue-500',
  paused: 'bg-amber-500',
  pending: 'bg-amber-500',
  canceled: 'bg-gray-400',
};

/**
 * The last ten runs as small bars, oldest on the left; a failed run stands taller so a
 * bad streak shows at a glance. Empty slots for a workflow that ran fewer times.
 */
export function runStrip(row: TaskItem, t: (key: string, named?: Record<string, unknown>) => string) {
  const runs = [...(row.recent_runs ?? [])].reverse();
  const slots = [...Array(Math.max(0, STRIP_SLOTS - runs.length)).fill(null), ...runs.slice(-STRIP_SLOTS)];
  const failed = runs.filter((s) => s === 'failed').length;
  const label = runs.length
    ? t('tasks.runStrip.label', { n: runs.length, failed })
    : t('tasks.runStrip.none');
  return h(
    'div',
    { class: 'flex items-end gap-[3px] h-5', role: 'img', 'aria-label': label, title: label },
    slots.map((status) =>
      h('span', {
        class: `w-2.5 rounded-[2px] ${
          status ? `${stripColor[status] ?? 'bg-gray-400'} ${status === 'failed' ? 'h-5' : 'h-3.5'}` : 'h-1 bg-muted-foreground/20'
        }`,
      })
    )
  );
}

/** "14:00" today, "Tomorrow 02:00", or the weekday and date further out. */
export function nextRunText(iso: string, t: (key: string, named?: Record<string, unknown>) => string): string {
  const date = new Date(iso);
  const time = format(date, 'HH:mm');
  if (isToday(date)) return t('tasks.nextRun.today', { time });
  if (isTomorrow(date)) return t('tasks.nextRun.tomorrow', { time });
  return format(date, 'EEE d MMM HH:mm');
}

export type WorkflowColumnExtras = {
  /** When a workflow's next scheduled run is (the earliest of its schedules), or null. */
  nextRunAt?: (identifier: string) => string | null;
};

export function createColumns(
  t: (key: string) => string,
  router: Router,
  onDeleted?: () => void,
  onUpdated?: () => void,
  showOwner = false,
  extras: WorkflowColumnExtras = {}
): ColumnDef<TaskItem>[] {
  const tt = t as (key: string, named?: Record<string, unknown>) => string;
  return [
    {
      accessorKey: 'name',
      header: () => t('tasks.columns.task'),
      cell: (info) => {
        const row = info.row.original as TaskItem;
        const tags = Array.isArray(row.tags) ? row.tags : [];
        const notMine = row.is_owned_by_me === false;
        return h('div', { class: 'flex items-center gap-3 py-0.5' }, [
          thumbnail(row.image),
          h('div', { class: 'flex flex-col gap-0.5 min-w-0' }, [
            h('div', { class: 'flex items-center gap-1.5' }, [
              h(
                'a',
                {
                  href: '#',
                  class: 'font-medium leading-tight hover:underline',
                  onClick: (e: Event) => {
                    e.preventDefault();
                    router.push(`/tasks/${row.identifier}`);
                  },
                },
                row.name
              ),
              notMine
                ? h(Lock, {
                    class: 'h-3 w-3 shrink-0 text-muted-foreground/60',
                    title: row.owned_by_email ? `Owned by ${row.owned_by_email}` : 'Owned by another user',
                  })
                : null,
              ...workflowBadges(row, t),
            ]),
            row.description
              ? h('span', { class: 'text-xs text-muted-foreground truncate max-w-sm' }, descriptionSummary(row.description))
              : null,
            tags.length > 0
              ? h('div', { class: 'flex flex-wrap gap-1 mt-0.5' },
                  tags.map((tag) =>
                    h('span', { class: 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground' }, tag)
                  )
                )
              : null,
          ]),
        ]);
      },
    },
    {
      accessorKey: 'source_type',
      header: () => t('tasks.columns.source'),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => {
        const value = info.getValue() as string;
        return h(Badge, { class: sourceClasses[value] || '' }, () => value);
      },
    },
    ...(showOwner
      ? [
          {
            id: 'owner',
            header: () => t('tasks.columns.owner'),
            cell: (info: any) => {
              const row = info.row.original as TaskItem;
              const display = row.owned_by_name || row.owned_by_email;
              if (!display) return h('span', { class: 'text-muted-foreground text-sm' }, '—');
              return h(
                'span',
                { class: 'text-sm text-muted-foreground truncate max-w-[180px] block', title: row.owned_by_email ?? undefined },
                display
              );
            },
          } as ColumnDef<TaskItem>,
        ]
      : []),
    {
      id: 'recentRuns',
      header: () => t('tasks.columns.recentRuns'),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => runStrip(info.row.original as TaskItem, tt),
    },
    {
      accessorKey: 'last_run_status',
      header: () => t('tasks.columns.lastRun'),
      cell: (info) => {
        const row = info.row.original as TaskItem;
        if (!row.last_run_status) {
          return h('span', { class: 'text-muted-foreground text-sm' }, t('common.never'));
        }
        const failed = row.last_run_status === 'failed';
        return h('div', { class: 'flex flex-col gap-0.5' }, [
          h('span', { class: 'flex items-center gap-1.5' }, [
            statusDot(row.last_run_status),
            h(
              'span',
              { class: failed ? 'text-sm font-medium text-red-700 dark:text-red-400' : 'text-sm' },
              lastRunLabel(row, t)
            ),
          ]),
          row.last_run_at
            ? h(
                'span',
                { class: 'text-xs text-muted-foreground pl-3.5' },
                formatDistanceToNow(new Date(row.last_run_at), { addSuffix: true })
              )
            : null,
        ]);
      },
    },
    {
      id: 'nextRun',
      header: () => t('tasks.columns.nextRun'),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => {
        const at = extras.nextRunAt?.((info.row.original as TaskItem).identifier) ?? null;
        return at
          ? h('span', { class: 'text-sm' }, nextRunText(at, tt))
          : h('span', { class: 'text-muted-foreground' }, '—');
      },
    },
    {
      id: 'actions',
      header: () => h('div', { class: 'flex justify-end' }),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => {
        const row = info.row.original as TaskItem;
        return h('div', { class: 'flex justify-end' }, [h(TaskListActions, { item: row, onDeleted, onUpdated })]);
      },
    },
  ];
}
