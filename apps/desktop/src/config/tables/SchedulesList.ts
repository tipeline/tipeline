import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { useIcon } from '@/composables/useIcon';

const { getIconComponent } = useIcon();

export type ScheduleItem = {
  scheduleIdentifier: string;
  taskIdentifier: string;
  taskName: string;
  /** Null for a one-time schedule, which has runAt instead. */
  cron: string | null;
  /** When a one-time schedule runs (ISO). Missing from cores older than one-time schedules. */
  runAt?: string | null;
  /** An interval schedule repeats every this many seconds. */
  everySeconds?: number | null;
  variables: Record<string, any>;
  enabled: boolean;
  /** When it fires next; null when paused or done. Missing from cores older than this field. */
  nextRunAt?: string | null;
  /** When it last started a run. */
  lastRunAt?: string | null;
};

/** Schedule wording from useScheduleText, passed in because column definitions live outside setup. */
export type ScheduleText = {
  describe: (timing: { cron?: string | null; runAt?: string | null; everySeconds?: number | null }) => string;
  formatTime: (value: string | null | undefined) => string;
  status: (schedule: ScheduleItem) => 'active' | 'paused' | 'done';
};

const STATUS_DOT = {
  active: 'bg-green-500',
  paused: 'bg-muted-foreground/50',
  done: 'bg-muted-foreground/50',
};

export function createColumns(
  t: (key: string, values?: Record<string, unknown>) => string,
  text: ScheduleText,
  onEdit?: (item: ScheduleItem) => void,
  onDelete?: (item: ScheduleItem) => void,
  onToggle?: (item: ScheduleItem) => void
): ColumnDef<ScheduleItem>[] {
  return [
    {
      accessorKey: 'scheduleIdentifier',
      header: () => t('schedules.scheduleId'),
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'taskIdentifier',
      header: () => t('schedules.form.task'),
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'taskName',
      header: () => t('schedules.taskName'),
      cell: (info) => info.getValue(),
    },
    {
      id: 'when',
      header: () => t('schedules.when'),
      cell: (info) => {
        const row = info.row.original;
        return h('div', { class: 'flex flex-col gap-0.5' }, [
          h('span', { class: 'text-sm' }, text.describe(row)),
          row.cron
            ? h('code', { class: 'font-mono text-xs text-muted-foreground' }, row.cron)
            : null,
        ]);
      },
    },
    {
      id: 'nextRun',
      header: () => t('schedules.nextRun'),
      cell: (info) => {
        const row = info.row.original;
        if (row.nextRunAt) return h('span', { class: 'text-sm tabular-nums' }, text.formatTime(row.nextRunAt));
        if (text.status(row) === 'done' && row.lastRunAt) {
          return h('span', { class: 'text-sm text-muted-foreground' }, t('schedules.ranAt', { date: text.formatTime(row.lastRunAt) }));
        }
        return h('span', { class: 'text-muted-foreground' }, '—');
      },
    },
    {
      accessorKey: 'enabled',
      header: () => t('common.status'),
      cell: (info) => {
        const status = text.status(info.row.original);
        return h(
          'span',
          {
            class:
              status === 'active'
                ? 'inline-flex items-center gap-1 text-xs font-medium text-green-600'
                : 'inline-flex items-center gap-1 text-xs font-medium text-muted-foreground',
          },
          [
            h('span', { class: `inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}` }),
            status === 'active' ? t('schedules.active') : t(`schedules.${status}`),
          ]
        );
      },
    },
    {
      id: 'actions',
      header: () => t('common.actions'),
      cell: (info) => {
        const row = info.row.original as ScheduleItem;
        const done = text.status(row) === 'done';
        return h('div', { class: 'flex items-center gap-2' }, [
          // A one-time schedule that ran can't be switched back on; edit it for a new time.
          done
            ? null
            : h(
                'button',
                {
                  class: 'p-1 hover:bg-accent rounded transition-colors',
                  onClick: () => onToggle?.(row),
                  title: row.enabled ? t('common.disable') : t('common.enable'),
                },
                [h(getIconComponent(row.enabled ? 'PauseCircle' : 'PlayCircle'), { class: 'size-4' })]
              ),
          h(
            'button',
            {
              class: 'p-1 hover:bg-accent rounded transition-colors',
              onClick: () => onEdit?.(row),
              title: t('common.edit'),
            },
            [h(getIconComponent('Pencil'), { class: 'size-4' })]
          ),
          h(
            'button',
            {
              class: 'p-1 hover:bg-accent rounded transition-colors',
              onClick: () => onDelete?.(row),
              title: t('common.delete'),
            },
            [h(getIconComponent('Trash2'), { class: 'size-4' })]
          ),
        ]);
      },
    },
  ];
}
