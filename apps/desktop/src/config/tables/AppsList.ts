import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import type { Router } from 'vue-router';
import AppListActions from '@/components/app/AppListActions.vue';
import { AppWindow } from 'lucide-vue-next';
import { toAssetUrl } from '@/utils/assetUrl';
import { descriptionSummary } from '@tipeline/utils';

export type AppItem = {
  identifier: string;
  name: string;
  description: string | null;
  author: string;
  version: string | null;
  source_type?: 'local' | 'hub';
  project_id: number | null;
  project_identifier: string | null;
  image?: string | null;
};

export function thumbnail(image: string | null | undefined, size = 'size-8') {
  const src = toAssetUrl(image);
  return h(
    'div',
    { class: `${size} rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0` },
    src
      ? [h('img', { src, class: 'w-full h-full object-cover' })]
      : [h(AppWindow, { class: 'size-4 text-muted-foreground/50' })]
  );
}

export function createColumns(
  t: (key: string) => string,
  router: Router,
  onDeleted: () => void,
  onUpdated?: () => void
): ColumnDef<AppItem>[] {
  return [
    {
      accessorKey: 'name',
      header: () => t('apps.columns.name'),
      cell: (info) => {
        const row = info.row.original as AppItem;
        return h('div', { class: 'flex items-center gap-3 py-0.5' }, [
          thumbnail(row.image),
          h(
            'a',
            {
              href: '#',
              class: 'text-[var(--primary)] hover:underline',
              onClick: (e: Event) => {
                e.preventDefault();
                router.push(`/apps/${row.identifier}`);
              },
            },
            row.name
          ),
        ]);
      },
    },
    {
      accessorKey: 'description',
      header: () => t('apps.columns.description'),
      cell: (info) => {
        const value = descriptionSummary(info.getValue() as string | null);
        return value
          ? h('span', { class: 'text-sm text-muted-foreground truncate max-w-sm block', title: value }, value)
          : h('span', { class: 'text-muted-foreground' }, '—');
      },
    },
    {
      accessorKey: 'author',
      header: () => t('apps.columns.author'),
      cell: (info) => info.getValue() ?? '—',
    },
    {
      accessorKey: 'version',
      header: () => t('apps.columns.version'),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => {
        const value = info.getValue() as string | null;
        return value
          ? h('span', { class: 'font-mono text-xs' }, value)
          : h('span', { class: 'text-muted-foreground' }, '—');
      },
    },
    {
      id: 'actions',
      header: () => h('div', { class: 'flex justify-end' }),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => {
        const row = info.row.original as AppItem;
        return h('div', { class: 'flex justify-end' }, [h(AppListActions, { item: row, onDeleted, onUpdated })]);
      },
    },
  ];
}
