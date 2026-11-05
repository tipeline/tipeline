<script setup lang="ts">
import { computed, h, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Plus, Trash2, Undo2 } from 'lucide-vue-next';
import DataTable from '@/components/DataTable.vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import TableCellEditor from './TableCellEditor.vue';
import AppBadge from '../AppBadge.vue';
import AppColorChip from './AppColorChip.vue';
import AppAvatar from './AppAvatar.vue';
import KeyValueWidget from './KeyValueWidget.vue';
import { highlightColor } from '@/utils/appHighlight';
import { imageSource } from '@/utils/appImage';
import type { BadgeColor } from '@/utils/appBadge';
import { formatValue, valueAt, type ValueFormat } from '@/utils/appFormat';
import type { TableColumnSize, TableFit } from '@/utils/tableFit';
import { compareTableValues, initialTableSort, type TableSort } from '@/utils/tableSort';
import {
  addRow,
  changeCount,
  editorOf,
  emptyTableEdits,
  emptyTableSelection,
  invalidCells,
  rowKeyOf,
  setCell,
  tableChanges,
  toggleDelete,
  viewRows,
  type EditableColumn,
  type TableEditState,
  type TableViewRow,
} from '@/utils/tableEdits';
import AppSkeleton from './AppSkeleton.vue';

// Rows come from `props.data` — an array literal or a binding such as
// `{= runnables.invoices.data =}` (already resolved by the runtime). A single
// object is shown as one row. Columns declared in `props.columns` fix the order,
// header, sortability and value format; otherwise every key of the first row is shown.
//
// A click on a header sorts by that column's raw values (unless `sortable: false` on the
// table or the column); `sortBy` / `sortOrder` set the sort it starts with. Editing
// tables and server-paged ones don't sort (rows would move while typed in / only one
// page would be in order).
//
// Editable tables (editable columns, allowAdd or allowDelete) keep unsaved edits in
// their runtime state and expose them as `changes` / `hasChanges`; Save fires `save`.
// New `data` (e.g. the refresh after a save) or a `reset` drops the edits.
//
// multiSelect (or bulkActions) adds a checkbox column: the checked rows are
// `selectedRows`, and each bulk action fires `bulk:<id>` with them. Checked rows are
// known by `rowKey`, so they stay checked when the data is refreshed; without one
// new data unchecks everything.

interface ColumnDef extends EditableColumn {
  key: string;
  header?: string;
  sortable?: boolean;
  format?: ValueFormat | 'link' | 'image' | 'avatar';
  currency?: string;
  options?: unknown;
  /** format: badge — each value's color. */
  colors?: Record<string, unknown>;
  /** format: link — the same text for every link, instead of the URL. */
  linkText?: string;
  /** format: avatar — the row's key with the person's picture. */
  srcKey?: string;
  /** A filter above the table for this column. */
  filter?: 'text' | 'select' | 'date';
  /** A hover button that copies the cell's raw value. */
  copy?: boolean;
  /** Colors a cell by its value (first matching rule). */
  highlight?: unknown;
  /** Exact / smallest width in px. */
  width?: number;
  minWidth?: number;
}

const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t, locale } = useI18n();

const rows = computed<Record<string, unknown>[]>(() => {
  const data = props.props.data;
  if (Array.isArray(data))
    return data.filter((row) => row && typeof row === 'object');
  if (data && typeof data === 'object') return [data];
  return [];
});

const configured = computed<ColumnDef[]>(() =>
  Array.isArray(props.props.columns)
    ? props.props.columns.filter((c: any) => c && typeof c.key === 'string')
    : []
);

const keys = computed<ColumnDef[]>(() =>
  configured.value.length
    ? configured.value
    : Object.keys(rows.value[0] ?? {}).map((key) => ({ key }))
);

// ---- editing (runtime only; the builder shows the configured columns)
const rowKey = computed(() =>
  typeof props.props.rowKey === 'string' && props.props.rowKey ? props.props.rowKey : undefined
);
const editing = computed(
  () =>
    !props.editable &&
    (configured.value.some((c) => c.editable) || !!props.props.allowAdd || !!props.props.allowDelete)
);
const editState = computed<TableEditState>(() => ({
  edits: (props.state?.edits as TableEditState['edits']) ?? {},
  added: (props.state?.added as TableEditState['added']) ?? [],
  deleted: (props.state?.deleted as string[]) ?? [],
}));
const view = computed(() => viewRows(rows.value, editState.value, rowKey.value));
const viewOf = computed(() => new Map<unknown, TableViewRow>(view.value.map((v) => [v.row, v])));
const originals = computed(
  () => new Map(view.value.filter((v) => v.status !== 'added').map((v, i) => [v.key, rows.value[i]]))
);
const changes = computed(() => tableChanges(view.value, rows.value));
const count = computed(() => changeCount(changes.value));
const invalid = computed(() => invalidCells(view.value, configured.value));

/** Stores new edits, with what they add up to, in the table's state. */
function updateEdits(next: TableEditState) {
  const c = tableChanges(viewRows(rows.value, next, rowKey.value), rows.value);
  emit('state', { ...next, changes: c, hasChanges: changeCount(c) > 0 });
}

const discard = () => emit('state', { ...emptyTableEdits() });

// "Add row" highlights the new row like a clicked one, shows its page, scrolls to it
// and focuses its first editable cell.
const rootEl = ref<HTMLElement | null>(null);
const dataTable = ref<{ revealRow: (row: unknown) => boolean } | null>(null);
let focusKey: string | null = null;

function onAddRow() {
  const next = addRow(editState.value, keys.value);
  focusKey = next.added[next.added.length - 1].key;
  updateEdits(next);
}

watch(
  view,
  async (current) => {
    const key = focusKey;
    const added = key ? current.find((v) => v.key === key) : undefined;
    if (!added) return;
    focusKey = null;
    selectedKey.value = added.key;
    dataTable.value?.revealRow(added.row);
    await nextTick();
    rootEl.value
      ?.querySelector('tr[data-state="selected"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    rootEl.value
      ?.querySelector<HTMLElement>(
        `[data-row-key="${CSS.escape(added.key)}"] :is(input, select, button)`
      )
      ?.focus({ preventScroll: true });
  },
  { flush: 'post' }
);

function save() {
  if (count.value && !invalid.value.size && !props.busy) emit('event', 'save', { changes: changes.value });
}

// New data replaces what the edits were made on.
watch(
  () => JSON.stringify(rows.value),
  () => {
    if (props.state?.hasChanges) discard();
  }
);

const shownRows = computed(() => (editing.value ? view.value.map((v) => v.row) : rows.value));

// ---- multi-select
const bulkActions = computed<Array<{ id: string; label: string; variant?: string }>>(() =>
  Array.isArray(props.props.bulkActions)
    ? props.props.bulkActions.filter((a: any) => a?.id && a?.label)
    : []
);
const selectable = computed(
  () => !props.editable && (!!props.props.multiSelect || bulkActions.value.length > 0)
);
/** Every shown row with its key (the same keys edits use). */
const keyOf = computed(() =>
  editing.value
    ? new Map<unknown, string>(view.value.map((v) => [v.row, v.key]))
    : new Map<unknown, string>(rows.value.map((r, i) => [r, rowKeyOf(r, i, rowKey.value)]))
);
const checked = computed(() => new Set((props.state?.selectedKeys as string[] | undefined) ?? []));
const isChecked = (row: Record<string, unknown>) => checked.value.has(keyOf.value.get(row) ?? '');
/** The checked rows as they are now (edited values included), in table order. */
const liveSelection = computed(() =>
  shownRows.value.filter((row) => checked.value.has(keyOf.value.get(row) ?? ''))
);

function setChecked(keys: Set<string>) {
  const selectedRows = shownRows.value.filter((row) => keys.has(keyOf.value.get(row) ?? ''));
  const selectedKeys = selectedRows.map((row) => keyOf.value.get(row)!);
  emit('state', { selectedKeys, selectedRows });
  emit('event', 'selectionChange', { selectedKeys, selectedRows });
}

function toggleRow(row: Record<string, unknown>, on: boolean) {
  const keys = new Set(checked.value);
  const key = keyOf.value.get(row);
  if (!key) return;
  if (on) keys.add(key);
  else keys.delete(key);
  setChecked(keys);
}

/** Header checkbox: checks every row the search shows, or unchecks them all. */
function toggleAll(visible: Array<Record<string, unknown>>, on: boolean) {
  const keys = new Set(checked.value);
  for (const row of visible) {
    const key = keyOf.value.get(row);
    if (key) on ? keys.add(key) : keys.delete(key);
  }
  setChecked(keys);
}

// Bulk actions work on saved rows: the refresh after one would drop unsaved edits.
const bulkBlocked = computed(() => props.busy || liveSelection.value.length === 0 || !!props.state?.hasChanges);

function runBulk(id: string) {
  if (!bulkBlocked.value)
    emit('event', `bulk:${id}`, { selectedRows: liveSelection.value });
}

// Keep `selectedRows` current: rows that are gone drop out, edited ones show their
// new values. Without a rowKey a row is only known by its position, so new data
// unchecks everything instead.
// One watcher for both, so a positional "still checked" can never win over the
// uncheck that new data means without a rowKey.
watch(
  () => [JSON.stringify(rows.value), JSON.stringify(liveSelection.value)] as const,
  ([data], previous) => {
    if (!rowKey.value && previous && data !== previous[0]) {
      if (checked.value.size) emit('state', emptyTableSelection());
      return;
    }
    const selectedRows = liveSelection.value;
    if (JSON.stringify(selectedRows) === JSON.stringify(props.state?.selectedRows ?? [])) return;
    emit('state', { selectedKeys: selectedRows.map((row) => keyOf.value.get(row)!), selectedRows });
  }
);

function rowClass(row: Record<string, unknown>) {
  const status = editing.value ? viewOf.value.get(row)?.status : undefined;
  if (status === 'added') return 'bg-emerald-500/5';
  if (status === 'deleted') return 'opacity-50 line-through';
  if (selectable.value && isChecked(row)) return 'bg-muted/60';
  return undefined;
}

const rowActions = computed<
  Array<{ id: string; label: string; variant?: string }>
>(() =>
  Array.isArray(props.props.rowActions)
    ? props.props.rowActions.filter((a: any) => a?.id && a?.label)
    : []
);

// ---- how a (non-edited) cell shows its value
const HIGHLIGHT: Record<BadgeColor, string> = {
  gray: 'bg-muted text-muted-foreground',
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  red: 'bg-red-500/10 text-red-700 dark:text-red-300',
  purple: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
};
const SAFE_LINK = /^(https?:|mailto:)/i;

function displayCell(value: unknown, col: ColumnDef, row?: Record<string, unknown>) {
  let content: any;
  if (col.format === 'badge') content = h(AppBadge, { value, colors: col.colors });
  else if (col.format === 'color') content = h(AppColorChip, { value });
  else if (col.format === 'avatar') {
    // The person's picture (srcKey) — or their initials — and their name.
    const name = formatValue(value, { format: 'text' }, locale.value);
    content = h('span', { class: 'inline-flex items-center gap-2 min-w-0' }, [
      h(AppAvatar, { name, src: col.srcKey && row ? valueAt(row, col.srcKey) : null, size: 'xs' }),
      h('span', { class: 'truncate' }, name),
    ]);
  }
  else if (col.format === 'link') {
    const url = typeof value === 'string' ? value.trim() : '';
    // Opens in the system browser (target=_blank); anything but http(s)/mailto stays text.
    content = SAFE_LINK.test(url)
      ? h(
          'a',
          {
            href: url,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'text-primary underline underline-offset-2 break-all',
            onClick: (e: MouseEvent) => e.stopPropagation(),
          },
          col.linkText || url
        )
      : formatValue(value, { format: 'text' }, locale.value);
  } else if (col.format === 'image') {
    const src = imageSource(value);
    content =
      'url' in src
        ? h('img', { src: src.url, alt: '', loading: 'lazy', class: 'h-8 w-8 rounded object-cover border' })
        : formatValue(value, { format: 'text' }, locale.value);
  } else content = formatValue(value, col as { format?: ValueFormat; currency?: string }, locale.value);
  const color = highlightColor(value, col.highlight);
  return color ? h('span', { class: `rounded px-1.5 py-0.5 ${HIGHLIGHT[color]}`, 'data-highlight': color }, [content]) : content;
}

// ---- copy columns: a button on hover copies the raw value (not the formatted text)
const copiedCell = ref<string | null>(null);
async function copyCell(id: string, value: unknown) {
  await navigator.clipboard.writeText(
    value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  );
  copiedCell.value = id;
  setTimeout(() => {
    if (copiedCell.value === id) copiedCell.value = null;
  }, 1500);
}

function withCopy(content: any, value: unknown, id: string) {
  if (value === null || value === undefined || value === '') return content;
  return h('span', { class: 'group/copy inline-flex items-center gap-1 max-w-full' }, [
    h('span', { class: 'min-w-0 overflow-hidden text-ellipsis' }, [content]),
    h(
      'button',
      {
        type: 'button',
        class:
          'shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover/copy:opacity-100 focus-visible:opacity-100 transition-opacity',
        title: t('apps.details.copy'),
        'data-copy-cell': id,
        // The row's click / selection stays untouched.
        onClick: (e: MouseEvent) => {
          e.stopPropagation();
          copyCell(id, value);
        },
      },
      [h(copiedCell.value === id ? Check : Copy, { class: 'size-3.5' })]
    ),
  ]);
}

// ---- column filters: text (contains), select (the column's own values), date
const columnFilters = computed(() =>
  props.editable
    ? []
    : configured.value
        .filter((c) => c.filter)
        .map((c) => {
          const header = c.header ?? c.key;
          if (c.filter === 'select') {
            const values = [...new Set(shownRows.value.map((r) => r[c.key]).filter((v) => v !== null && v !== undefined && v !== ''))]
              .map(String)
              .sort()
              .slice(0, 100);
            return {
              column: c.key,
              type: 'select' as const,
              placeholder: header,
              allLabel: t('apps.table.allOf', { column: header }),
              options: values.map((v) => ({ value: v, label: v })),
            };
          }
          if (c.filter === 'date') return { column: c.key, type: 'date' as const, placeholder: header };
          return { column: c.key, placeholder: t('apps.table.filterBy', { column: header }) };
        })
);

// ---- sorting: clicked headers, starting from sortBy / sortOrder
const startSort = computed(() => initialTableSort(props.props.sortBy, props.props.sortOrder));
const sorting = ref<TableSort[]>(startSort.value);
// Only a changed sortBy / sortOrder starts over — not new data (props are rebuilt then).
watch(
  () => JSON.stringify(startSort.value),
  () => (sorting.value = startSort.value)
);
const canSort = computed(() => !props.editable && !editing.value && !serverPaging.value);
const columnSortable = (col: ColumnDef) => col.sortable ?? props.props.sortable !== false;
/** Headers are buttons when a column can be sorted by a click. */
const sortableHeaders = computed(() => canSort.value && keys.value.some(columnSortable));

function sortingFnOf(col: ColumnDef) {
  return (a: any, b: any, id: string) =>
    compareTableValues(a.getValue(id), b.getValue(id), {
      format: col.format,
      desc: sorting.value.find((s) => s.id === id)?.desc,
      locale: locale.value,
    });
}

// ---- expandable rows: a chevron that shows the row's fields underneath
const expandable = computed(() => !props.editable && !!props.props.expandable);

// ---- fitting the columns to the width (default scroll: tables made before `fit` keep it)
const fit = computed<TableFit>(() =>
  props.props.fit === 'wrap' || props.props.fit === 'truncate' ? props.props.fit : 'scroll'
);
const positive = (n: unknown) => (typeof n === 'number' && n > 0 ? n : undefined);
/** A button / checkbox column: as wide as what it holds (scroll sizes it by itself). */
const fixedSize = (px: number): TableColumnSize => (fit.value === 'scroll' ? {} : { width: px });
// Cell padding (12px a side) plus what the cell holds.
const PAD = 24;
/** Row action buttons (h-7 px-2 text-xs) side by side: about 7px a character. */
const actionsWidth = (labels: string[]) =>
  PAD + labels.reduce((sum, label) => sum + label.length * 7 + 18, 0) + 4 * (labels.length - 1);

/** The characters a column's value takes as shown (wrap / truncate share the width by it). */
function measureCell(col: ColumnDef) {
  return (value: unknown): number => {
    const text = (v: unknown) => formatValue(v, { format: 'text' }, locale.value).length;
    let chars: number;
    if (col.format === 'badge')
      chars = (Array.isArray(value) ? value : [value]).reduce<number>((sum, v) => sum + text(v) + 3, 0);
    else if (col.format === 'avatar') chars = text(value) + 4;
    else if (col.format === 'color') chars = text(value) + 3;
    else if (col.format === 'image') chars = 5;
    else if (col.format === 'link') chars = col.linkText ? col.linkText.length : text(value);
    else chars = formatValue(value, col as { format?: ValueFormat; currency?: string }, locale.value).length;
    return col.highlight ? chars + 1 : chars;
  };
}

function columnSize(col: ColumnDef): TableColumnSize {
  // An editing cell needs room for its input.
  const minWidth = Math.max(positive(col.minWidth) ?? 0, editing.value && col.editable ? 96 : 0);
  return {
    width: positive(col.width),
    minWidth: minWidth || undefined,
    measure: measureCell(col),
  };
}

const columnDefs = computed(() => {
  const cols: any[] = [];
  if (expandable.value) {
    cols.push({
      id: '__expand',
      header: '',
      enableSorting: false,
      meta: fixedSize(PAD + 24),
      cell: (info: any) =>
        h(
          'button',
          {
            type: 'button',
            class: 'inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent text-muted-foreground',
            'aria-expanded': info.row.getIsExpanded(),
            title: info.row.getIsExpanded() ? t('apps.table.collapse') : t('apps.table.expand'),
            onClick: (e: MouseEvent) => {
              e.stopPropagation();
              info.row.toggleExpanded();
            },
          },
          h(info.row.getIsExpanded() ? ChevronDown : ChevronRight, { class: 'size-4' })
        ),
    });
  }
  if (selectable.value) {
    cols.push({
      id: '__select',
      enableSorting: false,
      meta: fixedSize(PAD + 16),
      header: (ctx: any) => {
        const visible = ctx.table.getFilteredRowModel().rows.map((r: any) => r.original);
        const on = visible.filter(isChecked).length;
        return h(Checkbox, {
          'aria-label': t('apps.table.selectAll'),
          modelValue: on === 0 ? false : on === visible.length ? true : 'indeterminate',
          disabled: visible.length === 0,
          'onUpdate:modelValue': () => toggleAll(visible, on < visible.length),
        });
      },
      cell: (info: any) =>
        h(
          'div',
          { class: 'flex items-center', onClick: (e: MouseEvent) => e.stopPropagation() },
          h(Checkbox, {
            'aria-label': t('apps.table.selectRow'),
            modelValue: isChecked(info.row.original),
            'onUpdate:modelValue': (v: boolean | 'indeterminate') => toggleRow(info.row.original, v === true),
          })
        ),
    });
  }
  cols.push(...keys.value.map((col) => ({
    id: col.key,
    accessorKey: col.key,
    header: col.header ?? col.key,
    meta: columnSize(col),
    ...(col.filter === 'select' ? { filterFn: 'equalsString' } : {}),
    // The column it starts sorted by sorts even when headers don't.
    enableSorting: canSort.value && (columnSortable(col) || startSort.value.some((s) => s.id === col.key)),
    sortingFn: sortingFnOf(col),
    // compareTableValues keeps every empty cell last.
    sortUndefined: false,
    cell: (info: any) => {
      const v = editing.value && col.editable ? viewOf.value.get(info.row.original) : undefined;
      if (!v) {
        const shown = displayCell(info.getValue(), col, info.row.original);
        return col.copy && !props.editable ? withCopy(shown, info.getValue(), `${info.row.id}/${col.key}`) : shown;
      }
      return h(TableCellEditor, {
        'data-row-key': v.key,
        editor: editorOf(col),
        value: info.getValue(),
        options: col.options,
        changed: v.changed.has(col.key),
        invalid: invalid.value.has(`${v.key}/${col.key}`),
        disabled: v.status === 'deleted' || props.busy,
        onUpdate: (value: unknown) =>
          updateEdits(setCell(editState.value, v.key, col.key, value, originals.value.get(v.key))),
      });
    },
  })));
  if (editing.value && props.props.allowDelete) {
    cols.push({
      id: '__delete',
      header: '',
      enableSorting: false,
      meta: fixedSize(PAD + 28),
      cell: (info: any) => {
        const v = viewOf.value.get(info.row.original);
        if (!v) return null;
        const restore = v.status === 'deleted';
        return h(
          Button,
          {
            size: 'icon',
            variant: 'ghost',
            class: 'h-7 w-7',
            disabled: props.busy,
            title: restore ? t('apps.table.restoreRow') : t('apps.table.deleteRow'),
            onClick: (e: MouseEvent) => {
              e.stopPropagation();
              updateEdits(toggleDelete(editState.value, v.key));
            },
          },
          () => h(restore ? Undo2 : Trash2, { class: restore ? 'size-3.5' : 'size-3.5 text-destructive' })
        );
      },
    });
  }
  if (rowActions.value.length) {
    cols.push({
      id: '__actions',
      header: '',
      enableSorting: false,
      meta: fixedSize(actionsWidth(rowActions.value.map((a) => a.label))),
      cell: (info: any) =>
        h(
          'div',
          { class: 'flex justify-end gap-1' },
          rowActions.value.map((action) =>
            h(
              Button,
              {
                size: 'sm',
                variant: (action.variant ?? 'outline') as any,
                class: 'h-7 px-2 text-xs',
                disabled: props.editable,
                onClick: (e: MouseEvent) => {
                  e.stopPropagation();
                  emit('event', `action:${action.id}`, {
                    selectedRow: info.row.original,
                  });
                },
              },
              () => action.label
            )
          )
        ),
    });
  }
  return cols;
});

// While editing, rows are rebuilt on every change — selection follows the row's key.
const selectedKey = ref<string | null>(null);

function onRowClick(row: Record<string, unknown>) {
  if (props.editable) return;
  selectedKey.value = viewOf.value.get(row)?.key ?? null;
  emit('event', 'rowClick', { selectedRow: row });
}

// ---- pagination
const pageSize = computed<number | undefined>(() => {
  const n = Number(props.props.pageSize);
  return Number.isInteger(n) && n > 0 ? n : undefined;
});
const serverPaging = computed(
  () => props.props.pagination === 'server' && !!pageSize.value
);
const page = computed(() => Math.max(1, Number(props.state?.page) || 1));
const total = computed(() => {
  const n = Number(props.props.total);
  return Number.isFinite(n) && n >= 0 ? n : null;
});
const lastPage = computed(() =>
  total.value !== null && pageSize.value
    ? Math.max(1, Math.ceil(total.value / pageSize.value))
    : null
);
// Without a total, "next" stays available while a full page came back.
const hasNext = computed(() =>
  lastPage.value !== null
    ? page.value < lastPage.value
    : rows.value.length >= (pageSize.value ?? Infinity)
);

function goTo(next: number) {
  if (props.editable || next < 1 || next === page.value) return;
  emit('event', 'pageChange', { page: next, pageSize: pageSize.value });
}

const isRowSelected = (row: Record<string, unknown>) =>
  editing.value
    ? !!selectedKey.value && viewOf.value.get(row)?.key === selectedKey.value
    : !!props.state?.selectedRow && props.state.selectedRow === row;

function csvCell(value: unknown): string {
  const text =
    value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  const header = keys.value.map((c) => csvCell(c.header ?? c.key)).join(',');
  const exported = editing.value
    ? view.value.filter((v) => v.status !== 'deleted').map((v) => v.row)
    : rows.value;
  const lines = exported.map((row) =>
    keys.value.map((c) => csvCell(row[c.key])).join(',')
  );
  const blob = new Blob([[header, ...lines].join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'export.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div ref="rootEl" class="h-full flex flex-col overflow-hidden">
    <!-- Builder: real headers when configured, placeholder rows -->
    <template v-if="editable">
      <p
        class="text-xs text-center text-muted-foreground py-1 shrink-0 border-b border-dashed"
      >
        {{ t('builder.table.preview') }}
      </p>
      <div class="flex-1 overflow-hidden opacity-50 pointer-events-none">
        <DataTable
          v-if="columnDefs.length"
          :columns="columnDefs"
          :data="[]"
          :filters="[]"
          :fit="fit"
          dense
          :empty-text="String(props.props.data ?? '')"
          class="h-full"
        />
      </div>
    </template>

    <AppSkeleton v-else-if="busy && shownRows.length === 0" variant="table" />

    <template v-else>
      <!-- Toolbar: add a row, unsaved changes (discard / save), CSV export -->
      <div
        v-if="editing || selectable || (props.props.exportable && shownRows.length > 0)"
        class="flex items-center gap-2 px-2 pt-2 shrink-0"
      >
        <!-- Checked rows: how many, the bulk actions, and uncheck all -->
        <template v-if="selectable">
          <span class="text-xs text-muted-foreground whitespace-nowrap">
            {{
              liveSelection.length
                ? t('apps.table.selected', { count: liveSelection.length }, liveSelection.length)
                : t('apps.table.noneSelected')
            }}
          </span>
          <Button
            v-for="action in bulkActions"
            :key="action.id"
            size="sm"
            :variant="(action.variant ?? 'outline') as any"
            class="h-7 text-xs"
            :disabled="bulkBlocked"
            :title="state?.hasChanges ? t('apps.table.saveFirst') : undefined"
            @click="runBulk(action.id)"
          >
            {{ action.label }}
          </Button>
          <Button
            v-if="liveSelection.length"
            size="sm"
            variant="ghost"
            class="h-7 text-xs"
            @click="setChecked(new Set())"
          >
            {{ t('apps.table.clearSelection') }}
          </Button>
        </template>
        <Button
          v-if="editing && props.props.allowAdd"
          size="sm"
          variant="outline"
          class="h-7 text-xs"
          :disabled="busy"
          @click="onAddRow"
        >
          <Plus class="size-3.5" /> {{ t('apps.table.addRow') }}
        </Button>
        <div class="flex-1" />
        <template v-if="editing && count > 0">
          <span class="text-xs text-muted-foreground">
            {{ t('apps.table.unsaved', { count }, count) }}
          </span>
          <Button size="sm" variant="ghost" class="h-7 text-xs" :disabled="busy" @click="discard">
            {{ t('apps.table.discard') }}
          </Button>
          <Button
            size="sm"
            class="h-7 text-xs"
            :disabled="busy || invalid.size > 0"
            :title="invalid.size > 0 ? t('apps.table.fillRequired') : undefined"
            @click="save"
          >
            {{ props.props.saveLabel || t('apps.table.save') }}
          </Button>
        </template>
        <Button
          v-if="props.props.exportable && shownRows.length > 0"
          size="sm"
          variant="ghost"
          class="h-7 text-xs"
          @click="exportCsv"
        >
          <Download class="size-3.5" /> {{ t('apps.table.exportCsv') }}
        </Button>
      </div>
      <template v-if="shownRows.length > 0">
        <DataTable
          ref="dataTable"
          :columns="columnDefs"
          :data="shownRows"
          :filters="columnFilters"
          :global-filter="!!props.props.searchable"
          :is-row-selected="isRowSelected"
          :row-class="editing || selectable ? rowClass : undefined"
          :page-size="serverPaging ? undefined : pageSize"
          :expandable="expandable"
          :fit="fit"
          :size-data="rows"
          :sortable="sortableHeaders"
          v-model:sorting="sorting"
          dense
          class="flex-1 min-h-0"
          @row-click="onRowClick"
        >
          <!-- An expanded row: its fields, like a Details component -->
          <template #expanded="{ row }">
            <div class="bg-muted/30 border-t">
              <KeyValueWidget
                :props="{ data: row, fields: props.props.detailFields, display: 'grid', hideEmpty: true }"
              />
            </div>
          </template>
        </DataTable>
      </template>
      <div
        v-else
        class="flex-1 flex items-center justify-center text-xs text-muted-foreground p-4"
      >
        {{ t('builder.table.noData') }}
      </div>

      <!-- Server paging: rows are the current page; the pager asks for another one. -->
      <div
        v-if="!editable && serverPaging && (rows.length > 0 || page > 1)"
        class="flex items-center justify-end gap-2 border-t px-(--app-pad) py-2 text-xs text-muted-foreground shrink-0"
      >
        <span v-if="total !== null">
          {{
            t('dataTable.range', {
              from: (page - 1) * (pageSize ?? 0) + (rows.length ? 1 : 0),
              to: (page - 1) * (pageSize ?? 0) + rows.length,
              total,
            })
          }}
        </span>
        <span v-else>{{ t('apps.table.pageN', { page }) }}</span>
        <Button
          size="icon"
          variant="ghost"
          class="h-7 w-7"
          :disabled="page <= 1 || busy || !!state?.hasChanges"
          :title="state?.hasChanges ? t('apps.table.saveFirst') : t('dataTable.previousPage')"
          @click="goTo(page - 1)"
        >
          <ChevronLeft class="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          class="h-7 w-7"
          :disabled="!hasNext || busy || !!state?.hasChanges"
          :title="state?.hasChanges ? t('apps.table.saveFirst') : t('dataTable.nextPage')"
          @click="goTo(page + 1)"
        >
          <ChevronRight class="size-4" />
        </Button>
      </div>
    </template>
  </div>
</template>
