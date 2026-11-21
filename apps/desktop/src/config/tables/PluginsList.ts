import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import type { Router } from 'vue-router';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Boxes } from 'lucide-vue-next';
import { toAssetUrl } from '@/utils/assetUrl';
import { sourceLabel, sourceTitle } from '@/utils/hubSource';
import { sourceClasses } from '@/config/tables/TasksList';

export type PluginItem = {
  identifier: string;
  group: string;
  name: string;
  description: string | null;
  author: string | null;
  version: string | null;
  enabled: boolean;
  status: string;
  path: string;
  image?: string | null;
  source_type?: 'hub' | 'local';
  hub_id?: string | null;
  /** The hub it was installed from (null when local, or when that hub was removed). */
  hub_name?: string | null;
  hub_version?: string | null;
  hub_status?: 'ok' | 'missing' | 'error' | null;
  hub_update_state?: 'current' | 'available' | 'major' | 'older';
  auto_update?: boolean | number;
};

/** What the list can do about a newer hub version: install it, or open the review. */
export type PluginUpdateHandlers = {
  updating: (row: PluginItem) => boolean;
  onUpdate: (row: PluginItem) => void;
  onReview: (row: PluginItem) => void;
};

/** The hub version worth mentioning: newer, and from a hub that's answering normally. */
export function pluginUpdateFor(row: PluginItem): { version: string; major: boolean } | null {
  if (row.source_type !== 'hub' || row.hub_status !== 'ok' || !row.hub_version) return null;
  if (row.hub_update_state === 'available') return { version: row.hub_version, major: false };
  if (row.hub_update_state === 'major') return { version: row.hub_version, major: true };
  return null;
}

function thumbnail(image: string | null | undefined) {
  const src = toAssetUrl(image);
  return h(
    'div',
    { class: 'size-8 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0' },
    src
      ? [h('img', { src, class: 'w-full h-full object-cover' })]
      : [h(Boxes, { class: 'size-4 text-muted-foreground/50' })]
  );
}

export function createColumns(
  t: (key: string, params?: Record<string, unknown>) => string,
  router: Router,
  onRequestToggle: (row: PluginItem, value: boolean) => void,
  onRemove: (row: PluginItem) => void,
  updates: PluginUpdateHandlers
): ColumnDef<PluginItem>[] {
  return [
    {
      accessorKey: 'name',
      header: () => t('plugins.columns.plugin'),
      cell: (info) => {
        const row = info.row.original as PluginItem;
        return h('div', { class: 'flex items-center gap-3 py-0.5' }, [
          thumbnail(row.image),
          h('div', { class: 'flex flex-col gap-0.5 min-w-0' }, [
            h('div', { class: 'flex items-center gap-2' }, [
              h(
                'a',
                {
                  href: '#',
                  class: 'font-medium leading-tight hover:underline',
                  onClick: (e: Event) => {
                    e.preventDefault();
                    router.push(`/plugins/${row.identifier}`);
                  },
                },
                row.name
              ),
              row.status === 'conflict'
                ? h(Badge, { class: 'bg-orange-500 text-white text-xs px-1.5 py-0' }, () => t('plugins.detail.groupConflict'))
                : null,
              row.status === 'missing'
                ? h(Badge, { variant: 'destructive', class: 'text-xs px-1.5 py-0' }, () => t('plugins.detail.missing'))
                : null,
            ]),
            row.description
              ? h('span', { class: 'text-xs text-muted-foreground truncate max-w-sm' }, row.description)
              : null,
          ]),
        ]);
      },
    },
    {
      accessorKey: 'group',
      header: () => t('plugins.columns.group'),
      cell: (info) => {
        const value = info.getValue() as string;
        return h('span', { class: 'font-mono text-xs bg-muted px-1.5 py-0.5 rounded' }, value);
      },
    },
    {
      accessorKey: 'source_type',
      header: () => t('plugins.columns.source'),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => {
        const row = info.row.original as PluginItem;
        return h(
          Badge,
          { class: `${sourceClasses[row.source_type ?? 'local'] || ''} max-w-[160px]`, title: sourceTitle(row, t) },
          () => h('span', { class: 'truncate' }, sourceLabel(row, t))
        );
      },
    },
    {
      accessorKey: 'author',
      header: () => t('plugins.columns.author'),
      cell: (info) => {
        const value = info.getValue() as string | null;
        return value
          ? h('span', { class: 'text-sm' }, value)
          : h('span', { class: 'text-muted-foreground' }, '—');
      },
    },
    {
      accessorKey: 'version',
      header: () => t('plugins.columns.version'),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => {
        const row = info.row.original as PluginItem;
        const value = info.getValue() as string | null;
        const current = value
          ? h('span', { class: 'font-mono text-xs' }, value)
          : h('span', { class: 'text-muted-foreground' }, '—');
        const update = pluginUpdateFor(row);
        if (!update) return current;
        const busy = updates.updating(row);
        return h('div', { class: 'flex flex-col items-start gap-1' }, [
          current,
          h('div', { class: 'flex items-center gap-2' }, [
            h(
              'span',
              { class: 'font-mono text-xs text-amber-700 dark:text-amber-400' },
              t('hub.versionAvailable', { version: update.version })
            ),
            h(
              Button,
              {
                variant: 'outline',
                size: 'sm',
                class: 'h-6 px-2 text-xs',
                disabled: busy,
                onClick: () => (update.major ? updates.onReview(row) : updates.onUpdate(row)),
              },
              () => (busy ? t('hub.updating') : update.major ? t('hub.reviewShort') : t('hub.update'))
            ),
          ]),
        ]);
      },
    },
    {
      accessorKey: 'enabled',
      header: () => t('plugins.columns.enabled'),
      meta: { class: 'whitespace-nowrap' },
      cell: (info) => {
        const row = info.row.original as PluginItem;
        if (row.status === 'missing') {
          return h(
            Button,
            { variant: 'destructive', size: 'sm', onClick: () => onRemove(row) },
            () => t('common.remove')
          );
        }
        return h(Switch, {
          modelValue: !!row.enabled,
          disabled: row.status === 'conflict',
          'onUpdate:modelValue': (value: boolean) => onRequestToggle(row, value),
        });
      },
    },
  ];
}
