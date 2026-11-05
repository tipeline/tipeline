import { h, type Ref } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import type { Router } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { RotateCcwIcon, Loader2Icon, AppWindow, Check, X, ExternalLink } from 'lucide-vue-next';
import { openInWindow, windowPaths } from '@/utils/detachedWindows';
import CancelRunButton from '@/components/CancelRunButton.vue';

export type TaskHistoryItem = {
  identifier: string;
  status: 'running' | 'completed' | 'pending' | 'failed' | 'paused' | 'canceled';
  started_at: string;
  finished_at: string | null;
  metadata?: {
    /**
     * approval_rejected: canceled because an approval was rejected (onReject: stop);
     * user_canceled: someone canceled it (`canceledBy` says who, when known).
     */
    reason?: 'crashed' | 'action_error' | 'approval_rejected' | 'user_canceled';
    canceledBy?: string;
    message?: string;
    /** Set when an App started the run (see Core.appRun). */
    trigger?: { type: 'app'; appIdentifier: string; appName: string; pageId: string; runnable: string };
    /** Set while the run waits at an approval step (see approval.request). */
    approval?: { title: string; details?: string; requestedAt?: string };
  } | null;
};

/** A paused run that waits for someone to approve or reject it (not a debugger pause). */
export const isAwaitingApproval = (row: TaskHistoryItem) => row.status === 'paused' && !!row.metadata?.approval;

function failureReasonLabel(metadata: TaskHistoryItem['metadata']): string | null {
  if (!metadata?.reason) return null;
  if (metadata.reason === 'crashed') return 'Crashed — safe to resume';
  if (metadata.reason === 'action_error') return metadata.message ? `Error: ${metadata.message}` : 'Action error';
  if (metadata.reason === 'approval_rejected') return metadata.message ?? null;
  if (metadata.reason === 'user_canceled') return metadata.message ?? null;
  return null;
}

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

const STATUS_CLASSES: Record<string, string> = {
  running:   'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  failed:    'bg-red-500/10 text-red-500 border border-red-500/20',
  pending:   'bg-gray-400/10 text-gray-500 border border-gray-400/20',
  paused:    'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  canceled:  'bg-gray-500/10 text-gray-600 border border-gray-500/20',
};

export function createColumns(
  t: (key: string, params?: Record<string, unknown>) => string,
  router: Router,
  taskIdentifier: string,
  onResume: (pipelineIdentifier: string) => void,
  resumingIdentifier: Ref<string | null>,
  onDecide: (pipelineIdentifier: string, approved: boolean) => void,
  decidingIdentifier: Ref<string | null>,
  /** After a cancel request: re-read the rows. */
  onCanceled: () => void
): ColumnDef<TaskHistoryItem>[] {
  return [
    { accessorKey: 'status' } as ColumnDef<TaskHistoryItem>,

    {
      accessorKey: 'identifier',
      header: () => t('taskHistory.run'),
      cell: (info) => {
        const row = info.row.original as TaskHistoryItem;
        return h('div', { class: 'flex items-center gap-3' }, [
          statusDot(row.status),
          h(
            'a',
            {
              href: '#',
              class: 'font-mono text-sm font-medium hover:underline',
              onClick: (e: Event) => {
                e.preventDefault();
                router.push(`/tasks/${taskIdentifier}/pipelines/${row.identifier}`);
              },
            },
            row.identifier
          ),
          // Watch this run in its own window (focuses it if already open).
          h(
            'button',
            {
              class: 'p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
              title: t('common.openInWindow'),
              'aria-label': t('common.openInWindow'),
              onClick: () =>
                openInWindow(windowPaths.run(taskIdentifier, row.identifier), t('runWindow.title', { id: row.identifier })),
            },
            [h(ExternalLink, { class: 'size-3.5' })]
          ),
        ]);
      },
    },

    {
      id: 'status_badge',
      header: () => t('common.status'),
      cell: (info) => {
        const row = info.row.original as TaskHistoryItem;
        const awaiting = isAwaitingApproval(row);
        const statusKey = awaiting ? 'taskHistory.awaitingApproval' : `taskHistory.${row.status}`;
        const label = t(statusKey) !== statusKey ? t(statusKey) : row.status;
        const cls = STATUS_CLASSES[row.status] ?? 'bg-gray-400/10 text-gray-500 border border-gray-400/20';
        const badge = h(
          'span',
          { class: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}` },
          label
        );
        const reason = awaiting
          ? (row.metadata?.approval?.title ?? null)
          : row.status === 'failed' || row.status === 'canceled'
            ? failureReasonLabel(row.metadata)
            : null;
        if (!reason) return badge;
        return h('div', { class: 'flex flex-col gap-0.5 items-start' }, [
          badge,
          h('span', { class: 'text-xs text-muted-foreground truncate max-w-[220px]', title: reason }, reason),
        ]);
      },
    },

    {
      id: 'trigger',
      header: () => t('taskHistory.startedBy'),
      cell: (info) => {
        const trigger = (info.row.original as TaskHistoryItem).metadata?.trigger;
        if (trigger?.type !== 'app') return h('span', { class: 'text-sm text-muted-foreground' }, '—');
        return h('div', { class: 'flex flex-col gap-0.5' }, [
          h(
            'a',
            {
              href: '#',
              class: 'inline-flex items-center gap-1 text-sm hover:underline',
              onClick: (e: Event) => {
                e.preventDefault();
                router.push(`/apps/${trigger.appIdentifier}`);
              },
            },
            [h(AppWindow, { class: 'size-3.5 text-muted-foreground' }), trigger.appName]
          ),
          h('span', { class: 'text-xs text-muted-foreground font-mono' }, `${trigger.pageId} › ${trigger.runnable}`),
        ]);
      },
    },

    {
      accessorKey: 'finished_at',
      header: () => t('taskHistory.when'),
      cell: (info) => {
        const row = info.row.original as TaskHistoryItem;

        if (row.status === 'running' || row.status === 'paused') {
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

    {
      id: 'actions',
      header: () => '',
      cell: (info) => {
        const row = info.row.original as TaskHistoryItem;
        if (isAwaitingApproval(row)) {
          const deciding = decidingIdentifier.value !== null;
          const spinning = decidingIdentifier.value === row.identifier;
          return h('div', { class: 'flex gap-2 justify-end items-center' }, [
            h(CancelRunButton, {
              target: { pipelineIdentifier: row.identifier },
              waiting: true,
              variant: 'icon',
              onDone: onCanceled,
            }),
            h(
              Button,
              { variant: 'outline', size: 'sm', disabled: deciding, onClick: () => onDecide(row.identifier, false) },
              () => [h(X, { class: 'w-4 h-4' }), t('taskHistory.reject')]
            ),
            h(
              Button,
              { size: 'sm', disabled: deciding, onClick: () => onDecide(row.identifier, true) },
              () => [
                spinning ? h(Loader2Icon, { class: 'w-4 h-4 animate-spin' }) : h(Check, { class: 'w-4 h-4' }),
                t('taskHistory.approve'),
              ]
            ),
          ]);
        }
        if (row.status === 'running' || row.status === 'pending') {
          return h('div', { class: 'flex justify-end' }, [
            h(CancelRunButton, {
              target: { pipelineIdentifier: row.identifier },
              onDone: onCanceled,
            }),
          ]);
        }
        if (row.status !== 'failed') return null;

        const isResuming = resumingIdentifier.value === row.identifier;
        return h(
          Button,
          {
            variant: 'outline',
            size: 'sm',
            disabled: isResuming,
            onClick: () => onResume(row.identifier),
          },
          () => [
            isResuming
              ? h(Loader2Icon, { class: 'w-4 h-4 animate-spin' })
              : h(RotateCcwIcon, { class: 'w-4 h-4' }),
            t('taskHistory.resume'),
          ]
        );
      },
    },
  ];
}
