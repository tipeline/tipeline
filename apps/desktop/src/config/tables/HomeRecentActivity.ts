import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import type { Router } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';

const TRIGGER_BADGE: Record<string, string> = {
  webhook: 'bg-violet-500/10 text-violet-600 border border-violet-500/20',
  schedule: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  user: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  app: 'bg-teal-500/10 text-teal-600 border border-teal-500/20',
};

export type Item = {
  identifier: string;
  status: 'running' | 'completed' | 'pending' | 'failed' | 'paused' | 'canceled';
  started_at: string;
  finished_at: string | null;
  task_name?: string;
  task_identifier?: string;
  metadata?: {
    reason?: 'crashed' | 'action_error' | 'approval_rejected' | 'user_canceled';
    message?: string;
    /** Set while the run waits at an approval step. */
    approval?: { title: string } | null;
  } | null;
  // Populated when connected to a server (from pipeline_audit table)
  triggered_by_type?: 'user' | 'webhook' | 'schedule' | 'app';
  triggered_by_name?: string | null;
};

function formatDuration(startedAt: string, finishedAt: string): string {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return '< 1s';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function statusDot(status: string) {
  if (status === 'running') {
    return h('span', { class: 'relative flex h-2 w-2 shrink-0' }, [
      h('span', { class: 'animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75' }),
      h('span', { class: 'relative inline-flex h-2 w-2 rounded-full bg-blue-500' }),
    ]);
  }
  const colors: Record<string, string> = {
    completed: 'bg-emerald-500',
    failed: 'bg-red-500',
    pending: 'bg-gray-400',
    paused: 'bg-amber-500',
    canceled: 'bg-gray-500',
  };
  return h('span', { class: `h-2 w-2 rounded-full shrink-0 ${colors[status] ?? 'bg-gray-400'}` });
}

export function createColumns(
  t: (key: string) => string,
  router: Router,
  showTrigger = false
): ColumnDef<Item>[] {
  const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
    running: {
      label: t('activityTable.running'),
      class: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
    },
    completed: {
      label: t('activityTable.completed'),
      class: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
    },
    failed: {
      label: t('activityTable.failed'),
      class: 'bg-red-500/10 text-red-500 border border-red-500/20',
    },
    pending: {
      label: t('activityTable.pending'),
      class: 'bg-gray-400/10 text-gray-500 border border-gray-400/20',
    },
    paused: {
      label: t('activityTable.paused'),
      class: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
    },
    canceled: {
      label: t('activityTable.canceled'),
      class: 'bg-gray-500/10 text-gray-600 border border-gray-500/20',
    },
  };

  return [
    { accessorKey: 'status' } as ColumnDef<Item>,
    {
      accessorKey: 'task_name',
      header: () => t('activityTable.task'),
      cell: (info) => {
        const row = info.row.original as Item;
        return h('div', { class: 'flex items-center gap-3' }, [
          statusDot(row.status),
          h('div', { class: 'flex flex-col gap-0.5' }, [
            h(
              'a',
              {
                href: '#',
                class: 'font-medium leading-none hover:underline',
                onClick: (e: Event) => {
                  e.preventDefault();
                  router.push(`/tasks/${row.task_identifier}`);
                },
              },
              row.task_name ?? row.task_identifier ?? '—'
            ),
            h(
              'a',
              {
                href: '#',
                class: 'text-xs text-muted-foreground font-mono hover:underline',
                onClick: (e: Event) => {
                  e.preventDefault();
                  router.push(`/tasks/${row.task_identifier}/pipelines/${row.identifier}`);
                },
              },
              row.identifier
            ),
          ]),
        ]);
      },
    },
    {
      id: 'status_badge',
      header: () => t('activityTable.status'),
      cell: (info) => {
        const row = info.row.original as Item;
        const cfg = STATUS_CONFIG[row.status] ?? {
          label: row.status,
          class: 'bg-gray-400/10 text-gray-500 border border-gray-400/20',
        };
        return h(
          'span',
          { class: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.class}` },
          cfg.label
        );
      },
    },
    ...(showTrigger
      ? [
          {
            id: 'trigger_type',
            header: () => t('activityTable.triggerType'),
            cell: (info: any) => {
              const row = info.row.original as Item;
              if (!row.triggered_by_type) {
                return h('span', { class: 'text-muted-foreground text-sm' }, '—');
              }
              const cls =
                TRIGGER_BADGE[row.triggered_by_type] ??
                'bg-gray-400/10 text-gray-500 border border-gray-400/20';
              return h(
                'span',
                { class: `inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}` },
                row.triggered_by_type
              );
            },
          } as ColumnDef<Item>,
          {
            id: 'trigger_source',
            header: () => t('activityTable.triggerSource'),
            cell: (info: any) => {
              const row = info.row.original as Item;
              if (!row.triggered_by_name) {
                return h('span', { class: 'text-muted-foreground text-sm' }, '—');
              }
              return h('span', { class: 'text-sm text-muted-foreground truncate max-w-[180px] block' }, row.triggered_by_name);
            },
          } as ColumnDef<Item>,
        ]
      : []),

    {
      accessorKey: 'finished_at',
      header: () => t('activityTable.started'),
      cell: (info) => {
        const row = info.row.original as Item;

        if (row.status === 'running') {
          return h(
            'span',
            { class: 'text-sm text-muted-foreground' },
            `${formatDistanceToNow(new Date(row.started_at))} ago`
          );
        }

        const finishedAt = info.getValue() as string | null;
        if (!finishedAt) return h('span', { class: 'text-muted-foreground' }, '—');

        return h('div', { class: 'flex flex-col gap-0.5' }, [
          h('span', { class: 'text-sm text-muted-foreground' }, `${formatDistanceToNow(new Date(finishedAt))} ago`),
          h('span', { class: 'text-xs text-muted-foreground/60' }, `took ${formatDuration(row.started_at, finishedAt)}`),
        ]);
      },
    },
  ];
}
