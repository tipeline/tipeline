import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { formatDistanceToNow } from 'date-fns';
import { AppWindow, RotateCcw, Trash2, Workflow } from 'lucide-vue-next';
import { toAssetUrl } from '@/utils/assetUrl';

export type TrashItem = {
  id: number;
  kind: 'task' | 'app';
  identifier: string;
  name: string;
  image: string | null;
  projectName: string | null;
  schedules: number;
  versions: number;
  deletedAt: string;
  expiresAt: string;
};

type T = (key: string, named?: Record<string, unknown> | number) => string;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysLeft = (expiresAt: string) => Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / DAY_MS));

export function createColumns(
  t: T,
  formatDate: (date: string) => string,
  busyId: () => number | null,
  onRestore: (item: TrashItem) => void,
  onDelete: (item: TrashItem) => void
): ColumnDef<TrashItem>[] {
  return [
    {
      accessorKey: 'name',
      header: () => t('trash.columns.name'),
      cell: (info) => {
        const item = info.row.original;
        const image = toAssetUrl(item.image ?? undefined);
        const details = [
          item.projectName,
          item.versions ? t('trash.versions', item.versions) : null,
          item.schedules ? t('trash.schedules', item.schedules) : null,
        ].filter(Boolean);
        return h('div', { class: 'flex items-center gap-2 min-w-0' }, [
          h('div', { class: 'size-7 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0' }, [
            image
              ? h('img', { src: image, class: 'w-full h-full object-cover' })
              : h(item.kind === 'app' ? AppWindow : Workflow, { class: 'size-3.5 text-muted-foreground/60' }),
          ]),
          h('div', { class: 'min-w-0' }, [
            h('div', { class: 'font-medium truncate' }, item.name),
            details.length ? h('div', { class: 'text-xs text-muted-foreground truncate' }, details.join(' · ')) : null,
          ]),
        ]);
      },
    },
    {
      accessorKey: 'kind',
      header: () => t('trash.columns.kind'),
      cell: (info) => h('span', { class: 'text-sm' }, t(`trash.kind.${info.getValue() as string}`)),
    },
    {
      accessorKey: 'deletedAt',
      header: () => t('trash.columns.deleted'),
      cell: (info) => {
        const value = info.getValue() as string;
        return h(
          'span',
          { class: 'text-sm', title: formatDate(value) },
          formatDistanceToNow(new Date(value), { addSuffix: true })
        );
      },
    },
    {
      accessorKey: 'expiresAt',
      header: () => t('trash.columns.removed'),
      cell: (info) => {
        const days = daysLeft(info.getValue() as string);
        return h(
          'span',
          { class: days <= 3 ? 'text-sm text-amber-600 dark:text-amber-500' : 'text-sm text-muted-foreground' },
          days === 0 ? t('trash.removedToday') : t('trash.removedIn', days)
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const item = info.row.original;
        const busy = busyId() === item.id;
        return h('div', { class: 'flex items-center justify-end gap-1' }, [
          h(
            'button',
            {
              type: 'button',
              class:
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default',
              disabled: busy,
              onClick: () => onRestore(item),
            },
            [h(RotateCcw, { class: 'size-3.5' }), t('trash.restore')]
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'p-1.5 hover:bg-accent rounded transition-colors text-destructive cursor-pointer disabled:opacity-50',
              title: t('trash.deleteForever'),
              disabled: busy,
              onClick: () => onDelete(item),
            },
            [h(Trash2, { class: 'size-4' })]
          ),
        ]);
      },
    },
  ];
}
