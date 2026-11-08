import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import type { Router } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import type { Item } from '@/config/tables/HomeRecentActivity';
import { ExternalLink } from 'lucide-vue-next';
import { openInWindow, windowPaths } from '@/utils/detachedWindows';
import CancelRunButton from '@/components/CancelRunButton.vue';
import { TRIGGER_BADGE } from '@/config/entityColors';

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
      h('span', {
        class: 'animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75',
      }),
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


function failureReasonLabel(metadata: Item['metadata']): string | null {
  if (!metadata?.reason) return null;
  if (metadata.reason === 'crashed') return 'Crashed — safe to resume';
  if (metadata.reason === 'action_error') return metadata.message ? `Error: ${metadata.message}` : 'Action error';
  return null;
}

export function createColumns(
  t: (key: string, params?: Record<string, unknown>) => string,
  router: Router,
  showTrigger = false,
  /** After a cancel request: re-read the rows. */
  onCanceled: () => void = () => {}
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
            h('div', { class: 'flex items-center gap-1' }, [
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
              // Watch this run in its own window (focuses it if already open).
              row.task_identifier
                ? h(
                    'button',
                    {
                      class: 'p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
                      title: t('common.openInWindow'),
                      'aria-label': t('common.openInWindow'),
                      onClick: () =>
                        openInWindow(
                          windowPaths.run(row.task_identifier!, row.identifier),
                          t('runWindow.title', { id: row.identifier })
                        ),
                    },
                    [h(ExternalLink, { class: 'size-3' })]
                  )
                : null,
            ]),
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
        const badge = h(
          'span',
          { class: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.class}` },
          cfg.label
        );
        const reason = row.status === 'failed' ? failureReasonLabel(row.metadata) : null;
        if (!reason) return badge;
        return h('div', { class: 'flex flex-col gap-0.5 items-start' }, [
          badge,
          h('span', { class: 'text-xs text-muted-foreground truncate max-w-[220px]', title: reason }, reason),
        ]);
      },
    },

    {
      accessorKey: 'started_at',
      header: () => t('activityTable.started'),
      cell: (info) => {
        const row = info.row.original as Item;
        if (!row.started_at) return h('span', { class: 'text-muted-foreground' }, '—');
        return h(
          'span',
          { class: 'text-sm text-muted-foreground' },
          `${formatDistanceToNow(new Date(row.started_at))} ago`
        );
      },
    },

    {
      id: 'duration',
      header: () => t('activityTable.duration'),
      cell: (info) => {
        const row = info.row.original as Item;
        if (row.status === 'running') {
          return h('span', { class: 'text-sm text-muted-foreground' }, '—');
        }
        if (!row.finished_at) return h('span', { class: 'text-muted-foreground' }, '—');
        return h(
          'span',
          { class: 'text-sm text-muted-foreground font-mono' },
          formatDuration(row.started_at, row.finished_at)
        );
      },
    },

    { accessorKey: 'finished_at' } as ColumnDef<Item>,

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
      id: 'actions',
      header: () => '',
      cell: (info) => {
        const row = info.row.original as Item;
        const waiting = row.status === 'paused' && !!row.metadata?.approval;
        if (!waiting && row.status !== 'running' && row.status !== 'pending') return null;
        return h('div', { class: 'flex justify-end' }, [
          h(CancelRunButton, {
            target: { pipelineIdentifier: row.identifier },
            waiting,
            variant: 'icon',
            onDone: onCanceled,
          }),
        ]);
      },
    },
  ];
}
