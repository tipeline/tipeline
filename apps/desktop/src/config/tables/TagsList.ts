import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { useIcon } from '@/composables/useIcon';

const { getIconComponent } = useIcon();

export type TagItem = {
  id: number;
  label: string;
  taskCount: number;
};

export function createColumns(
  t: (key: string) => string,
  onEdit?: (item: TagItem) => void,
  onDelete?: (item: TagItem) => void,
  onOpen?: (item: TagItem) => void
): ColumnDef<TagItem>[] {
  return [
    {
      accessorKey: 'label',
      header: () => t('tag.columns.label'),
      cell: (info) =>
        h(
          'button',
          {
            type: 'button',
            class: 'font-medium hover:underline underline-offset-2 text-left',
            title: t('tag.showWorkflows'),
            onClick: () => onOpen?.(info.row.original),
          },
          info.getValue() as string
        ),
    },
    {
      accessorKey: 'taskCount',
      header: () => t('tag.columns.taskCount'),
      cell: (info) =>
        h(
          'button',
          {
            type: 'button',
            class:
              'inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium hover:bg-accent transition-colors',
            title: t('tag.showWorkflows'),
            onClick: () => onOpen?.(info.row.original),
          },
          String(info.getValue() as number)
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original as TagItem;
        return h('div', { class: 'flex items-center justify-end gap-2' }, [
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
              class: 'p-1 hover:bg-accent rounded transition-colors text-destructive',
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
