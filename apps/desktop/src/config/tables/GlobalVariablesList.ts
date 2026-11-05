import { h } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { useIcon } from '@/composables/useIcon';

const { getIconComponent } = useIcon();

export type VariableItem = {
  identifier: string;
  name: string;
  description?: string;
  type: string | null;
  value: string;
  secret: boolean;
};

export function createColumns(
  t: (key: string) => string,
  onEdit?: (item: VariableItem) => void,
  onDelete?: (item: VariableItem) => void,
  onDuplicate?: (item: VariableItem) => void
): ColumnDef<VariableItem>[] {
  return [
    {
      accessorKey: 'name',
      header: () => t('variable.columns.name'),
      cell: (info) => {
        const row = info.row.original as VariableItem;
        return h('div', [
          h('span', { class: 'font-medium' }, row.name),
          row.description
            ? h('p', { class: 'text-xs text-muted-foreground mt-0.5' }, row.description)
            : null,
        ]);
      },
    },
    {
      accessorKey: 'type',
      header: () => t('variable.columns.type'),
      cell: (info) => {
        const type = info.getValue() as string | null;
        return h(
          'span',
          { class: 'inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium' },
          type ?? '—'
        );
      },
    },
    {
      accessorKey: 'value',
      header: () => t('variable.columns.value'),
      cell: (info) => {
        const row = info.row.original as VariableItem;
        if (row.secret) {
          return h('span', { class: 'text-muted-foreground italic' }, '••••••••');
        }
        const val = info.getValue() as string;
        const display = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—');
        return h('span', { class: 'font-mono text-xs' }, display.length > 40 ? display.slice(0, 40) + '…' : display);
      },
    },
    {
      accessorKey: 'secret',
      header: () => t('variable.columns.secret'),
      cell: (info) => {
        const val = info.getValue() as boolean;
        return val
          ? h('span', { class: 'inline-flex items-center gap-1 text-xs text-amber-600' }, [
              h(getIconComponent('ShieldAlert'), { class: 'size-3' }),
              t('common.yes'),
            ])
          : h('span', { class: 'text-xs text-muted-foreground' }, t('common.no'));
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original as VariableItem;
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
              class: 'p-1 hover:bg-accent rounded transition-colors',
              onClick: () => onDuplicate?.(row),
              title: t('variable.duplicate'),
            },
            [h(getIconComponent('Copy'), { class: 'size-4' })]
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
