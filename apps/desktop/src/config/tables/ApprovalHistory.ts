import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import type { Router } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { Check, Clock, X } from 'lucide-vue-next';

/** A decision already made (Core.approvalHistory). */
export interface ApprovalDecisionItem {
  key: string;
  pipelineIdentifier: string;
  taskIdentifier: string;
  workflowName: string;
  title: string;
  requestedAt: string | null;
  approved: boolean;
  comment: string;
  /** An email (server), `desktop`, `app:<name>`, `<email> (app:<name>)` or `timeout`. */
  decidedBy: string;
  decidedAt: string | null;
  trigger?: { type: 'app'; appName: string } | null;
}

const ago = (iso: string | null) =>
  iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '—';

export function createColumns(
  t: (key: string, params?: Record<string, unknown>) => string,
  router: Router
): ColumnDef<ApprovalDecisionItem>[] {
  return [
    // Filter-only column: "approved" / "rejected".
    {
      id: 'decision',
      accessorFn: (row) => (row.approved ? 'approved' : 'rejected'),
    } as ColumnDef<ApprovalDecisionItem>,

    {
      id: 'decisionBadge',
      header: () => t('approvals.history.decision'),
      cell: (info) => {
        const row = info.row.original;
        const cls = row.approved
          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-500 border border-red-500/20';
        return h('div', { class: 'flex flex-col gap-0.5 items-start' }, [
          h(
            'span',
            {
              class: `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cls}`,
            },
            [
              h(row.approved ? Check : X, { class: 'size-3' }),
              t(
                row.approved
                  ? 'approvals.history.approved'
                  : 'approvals.history.rejected'
              ),
            ]
          ),
          row.decidedBy === 'timeout'
            ? h(
                'span',
                {
                  class:
                    'inline-flex items-center gap-1 text-xs text-muted-foreground',
                },
                [
                  h(Clock, { class: 'size-3' }),
                  t('approvals.history.automatic'),
                ]
              )
            : null,
        ]);
      },
    },

    {
      accessorKey: 'title',
      header: () => t('approvals.history.request'),
      cell: (info) => {
        const row = info.row.original;
        return h('div', { class: 'flex flex-col gap-0.5 min-w-0' }, [
          h(
            'span',
            {
              class: 'text-sm font-medium truncate block max-w-[240px]',
              title: row.title,
            },
            row.title || '—'
          ),
          h(
            'a',
            {
              href: '#',
              class: 'text-xs text-muted-foreground hover:underline w-fit',
              onClick: (e: Event) => {
                e.preventDefault();
                router.push(
                  `/tasks/${row.taskIdentifier}/pipelines/${row.pipelineIdentifier}`
                );
              },
            },
            row.trigger?.type === 'app'
              ? `${row.workflowName} · ${row.trigger.appName}`
              : row.workflowName
          ),
        ]);
      },
    },

    {
      accessorKey: 'decidedBy',
      header: () => t('approvals.history.decidedBy'),
      cell: (info) => {
        const by = info.row.original.decidedBy;
        const label = by === 'timeout' ? t('approvals.history.byTimeout') : by || '—';
        return h('span', { class: 'text-sm truncate block max-w-[200px]', title: label }, label);
      },
    },

    {
      accessorKey: 'comment',
      header: () => t('approvals.history.comment'),
      cell: (info) => {
        const comment = info.row.original.comment;
        return comment
          ? h(
              'span',
              {
                class:
                  'text-sm text-muted-foreground truncate block max-w-[180px]',
                title: comment,
              },
              comment
            )
          : h('span', { class: 'text-sm text-muted-foreground' }, '—');
      },
    },

    {
      accessorKey: 'decidedAt',
      header: () => t('approvals.history.decidedAt'),
      cell: (info) => {
        const row = info.row.original;
        return h('div', { class: 'flex flex-col gap-0.5' }, [
          h(
            'span',
            {
              class: 'text-sm text-muted-foreground',
              title: row.decidedAt ?? '',
            },
            ago(row.decidedAt)
          ),
          row.requestedAt
            ? h(
                'span',
                { class: 'text-xs text-muted-foreground/60' },
                t('approvals.history.requested', { when: ago(row.requestedAt) })
              )
            : null,
        ]);
      },
    },
  ];
}
