import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { format, formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import type { AlertItem } from '@/store/alertsStore';

type T = (key: string, params?: Record<string, unknown>) => string;

export interface AlertRowActions {
  openRun: (alert: AlertItem) => void;
  openWorkflow: (alert: AlertItem) => void;
  dismiss: (alert: AlertItem) => void;
  reopen: (alert: AlertItem) => void;
  resolve: (alert: AlertItem) => void;
  /** The alert being dismissed or reopened right now. */
  busy: () => string | null;
  /** The workflow's name, with its short identifier when another workflow has the same name. */
  workflowLabel: (alert: AlertItem) => string;
  /** A resolved alert's successor: the same workflow and key raised again after it closed. */
  cameBack: (alert: AlertItem) => AlertItem | null;
  /** Shows an alert on its own tab (the successor's). */
  show: (alert: AlertItem) => void;
}

export const LEVEL_DOT: Record<string, string> = {
  info: 'bg-blue-500',
  warning: 'bg-orange-500',
  critical: 'bg-red-600',
};

const ago = (iso: string | null) =>
  iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '—';
const exact = (iso: string | null) =>
  iso ? format(new Date(iso), 'PPpp') : '';

/** The message's first line as plain text (it's often Markdown: a heading, a list). */
export function messagePreview(message: string | null): string {
  const line = (message ?? '')
    .split('\n')
    .map((l) =>
      l
        .replace(/^[\s#>*\-+]+/, '')
        .replace(/[*_`]/g, '')
        .trim()
    )
    .find(Boolean);
  return line ?? '';
}

/** Who closed it: `desktop`, `workflow` (alert.resolve), an email on a server… */
function closedByLabel(by: string | null, t: T): string {
  if (!by) return '';
  if (by === 'desktop') return t('alerts.page.byYou');
  if (by === 'workflow') return t('alerts.page.byWorkflow');
  return by;
}

/**
 * The alerts table on the Alerts page. `level` and `workflow` are filter-only columns
 * (hidden); `closed` only shows on the Dismissed and Resolved tabs.
 */
export function createColumns(
  t: T,
  actions: AlertRowActions
): ColumnDef<AlertItem>[] {
  return [
    {
      id: 'expand',
      header: '',
      enableSorting: false,
      cell: (info) =>
        info.row.original.message
          ? h(
              'button',
              {
                type: 'button',
                class:
                  'inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent text-muted-foreground',
                'aria-expanded': info.row.getIsExpanded(),
                title: t(
                  info.row.getIsExpanded()
                    ? 'alerts.page.hideMessage'
                    : 'alerts.page.showMessage'
                ),
                onClick: (e: MouseEvent) => {
                  e.stopPropagation();
                  info.row.toggleExpanded();
                },
              },
              h(info.row.getIsExpanded() ? ChevronDown : ChevronRight, {
                class: 'size-4',
              })
            )
          : null,
    },

    // Filter-only columns.
    { id: 'level', accessorFn: (row) => row.level } as ColumnDef<AlertItem>,
    {
      id: 'workflow',
      accessorFn: (row) => row.taskIdentifier,
      filterFn: 'equalsString',
    } as ColumnDef<AlertItem>,

    {
      accessorKey: 'title',
      header: () => t('alerts.page.alert'),
      enableSorting: false,
      cell: (info) => {
        const row = info.row.original;
        const preview = messagePreview(row.message);
        return h(
          'div',
          { class: 'flex items-start gap-2.5 min-w-0 max-w-[560px]' },
          [
            h('span', {
              class: `mt-1.5 size-2 rounded-full shrink-0 ${LEVEL_DOT[row.level] ?? 'bg-gray-400'}`,
              title: t(`alerts.level.${row.level}`),
            }),
            h('div', { class: 'flex flex-col gap-0.5 min-w-0' }, [
              h('span', { class: 'text-sm font-medium wrap-break-word' }, [
                row.title,
                row.count > 1
                  ? h(
                      'span',
                      {
                        class:
                          'ml-1.5 font-normal text-muted-foreground tabular-nums',
                      },
                      `×${row.count}`
                    )
                  : null,
              ]),
              preview && preview !== row.title
                ? h(
                    'span',
                    {
                      class: 'text-xs text-muted-foreground truncate',
                      title: preview,
                    },
                    preview
                  )
                : null,
              h(
                'a',
                {
                  href: '#',
                  class: 'text-xs text-muted-foreground hover:underline w-fit',
                  onClick: (e: Event) => {
                    e.preventDefault();
                    actions.openWorkflow(row);
                  },
                },
                actions.workflowLabel(row)
              ),
            ]),
          ]
        );
      },
    },

    {
      accessorKey: 'lastRaisedAt',
      header: () => t('alerts.page.lastRaised'),
      sortingFn: (a, b) =>
        Date.parse(a.original.lastRaisedAt) -
        Date.parse(b.original.lastRaisedAt),
      cell: (info) => {
        const row = info.row.original;
        return h('div', { class: 'flex flex-col gap-0.5 whitespace-nowrap' }, [
          h(
            'span',
            { class: 'text-sm', title: exact(row.lastRaisedAt) },
            ago(row.lastRaisedAt)
          ),
          row.count > 1
            ? h(
                'span',
                {
                  class: 'text-xs text-muted-foreground',
                  title: exact(row.firstRaisedAt),
                },
                t('alerts.page.since', { when: ago(row.firstRaisedAt) })
              )
            : null,
        ]);
      },
    },

    {
      id: 'closed',
      accessorFn: (row) => row.closedAt,
      header: () => t('alerts.page.closed'),
      sortingFn: (a, b) =>
        Date.parse(a.original.closedAt ?? '0') -
        Date.parse(b.original.closedAt ?? '0'),
      cell: (info) => {
        const row = info.row.original;
        const by = closedByLabel(row.closedBy, t);
        const raisedSince =
          row.status === 'dismissed' &&
          !!row.closedAt &&
          Date.parse(row.lastRaisedAt) > Date.parse(row.closedAt);
        const next = row.status === 'resolved' ? actions.cameBack(row) : null;
        return h('div', { class: 'flex flex-col gap-0.5 whitespace-nowrap' }, [
          h(
            'span',
            { class: 'text-sm', title: exact(row.closedAt) },
            ago(row.closedAt)
          ),
          by ? h('span', { class: 'text-xs text-muted-foreground' }, by) : null,
          raisedSince
            ? h(
                'span',
                { class: 'text-xs text-orange-700 dark:text-orange-400' },
                t('alerts.page.stillHappening')
              )
            : null,
          next
            ? h(
                'a',
                {
                  href: '#',
                  class:
                    'text-xs text-orange-700 dark:text-orange-400 hover:underline w-fit',
                  'data-testid': 'alert-came-back',
                  onClick: (e: Event) => {
                    e.preventDefault();
                    actions.show(next);
                  },
                },
                t(
                  next.status === 'open'
                    ? 'alerts.page.cameBackOpen'
                    : 'alerts.page.cameBackDismissed'
                )
              )
            : null,
        ]);
      },
    },

    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: (info) => {
        const row = info.row.original;
        const busy = actions.busy() === row.id;
        return h('div', { class: 'flex items-center justify-end gap-1.5' }, [
          row.pipelineIdentifier
            ? h(
                Button,
                {
                  size: 'sm',
                  variant: 'outline',
                  onClick: () => actions.openRun(row),
                },
                () => t('dashboard.needs.openRun')
              )
            : null,
          row.status === 'open'
            ? h(
                Button,
                {
                  size: 'sm',
                  variant: 'ghost',
                  disabled: busy,
                  onClick: () => actions.dismiss(row),
                },
                () => t('dashboard.needs.dismiss')
              )
            : row.status === 'dismissed'
              ? h(
                  Button,
                  {
                    size: 'sm',
                    variant: 'ghost',
                    disabled: busy,
                    onClick: () => actions.reopen(row),
                  },
                  () => t('alerts.reopen')
                )
              : null,
          row.status !== 'resolved'
            ? h(
                Button,
                {
                  size: 'sm',
                  variant: 'ghost',
                  disabled: busy,
                  title: t('alerts.resolveHint'),
                  onClick: () => actions.resolve(row),
                },
                () => t('alerts.resolve')
              )
            : null,
        ]);
      },
    },
  ];
}
