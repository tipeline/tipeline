<script setup lang="ts" generic="TData, TValue">
import type { ColumnDef, SortingState } from '@tanstack/vue-table';
import { TZDate } from '@date-fns/tz';
import { useTimezone } from '@/composables/useTimezone';
import { h, ref, computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  FlexRender,
  getCoreRowModel,
  useVueTable,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
} from '@tanstack/vue-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ArrowDown,
  ArrowUp,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from 'lucide-vue-next';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  columnSizeStyle,
  fitLayout,
  type TableColumnSize,
  type TableFit,
} from '@/utils/tableFit';

// Define filter configuration type
interface FilterOption {
  label: string;
  value: string;
}

interface FilterConfig {
  column: string;
  placeholder?: string;
  type?: 'text' | 'select' | 'date';
  options?: FilterOption[]; // For select type
  dateMode?: 'exact' | 'after' | 'before'; // For date type, default is 'exact'
  /** Select type: what the "no filter" choice reads (default "All") — e.g. "Status: all". */
  allLabel?: string;
}

const props = defineProps<{
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filters?: FilterConfig[];
  globalFilter?: boolean;
  editableColumns?: string[];
  flat?: boolean;
  compact?: boolean;
  hideHeader?: boolean;
  animated?: boolean;
  hiddenColumns?: string[];
  emptyText?: string;
  initialFilters?: { id: string; value: unknown }[];
  /** Marks rows as selected (highlighted) without TanStack's selection model. */
  isRowSelected?: (row: TData) => boolean;
  /** Extra classes for a row (e.g. added or deleted rows of an editable table). */
  rowClass?: (row: TData) => string | undefined;
  /**
   * Rows can be expanded (row.toggleExpanded(), e.g. from a chevron cell): an expanded
   * row is followed by a full-width row with the `expanded` slot ({ row }).
   */
  expandable?: boolean;
  /** Shows this many rows per page with a pager (after search and sort). Omit for one long list. */
  pageSize?: number;
  /**
   * How the columns fit the width (default scroll) — see TableFit. Columns can carry
   * `width` / `minWidth` (px) and, for truncate, `measure` in their `meta`.
   */
  fit?: TableFit;
  /** truncate: the rows that size the columns (default `data`) — e.g. without unsaved edits. */
  sizeData?: TData[];
  /** Tighter cell padding (8px 12px). */
  dense?: boolean;
  /**
   * Headers of columns that can sort (TanStack's `enableSorting`) are buttons: a click
   * sorts ascending, then descending, then not at all; Shift+click adds a column.
   */
  sortable?: boolean;
  /**
   * Adds a checkbox column (bind v-model:selection). The header box ticks every row the
   * filters show; ticked rows that are filtered out or leave `data` drop out.
   */
  selectable?: boolean;
  /** selectable: a row's key in `selection` (e.g. its identifier). */
  rowKey?: (row: TData) => string;
}>();

/** selectable: the keys (rowKey) of the ticked rows. */
const selection = defineModel<string[]>('selection', { default: () => [] });

/** The sorted columns — bind it (v-model:sorting) to keep or start with a sort. */
const sorting = defineModel<SortingState>('sorting', { default: () => [] });

const { t } = useI18n();

const emit = defineEmits<{
  rowClick: [item: TData];
  cellUpdate: [rowIndex: number, columnId: string, value: any]; // New emit for cell updates
  /** A filter changed — for pages that load rows a page at a time and filter on the server. */
  filtersChange: [filters: { id: string; value: unknown }[]];
}>();

// Track currently editing cell
const editingCell = ref<{ rowIndex: number; columnId: string } | null>(null);
const editValue = ref<string>('');

const tableWrapperRef = ref<HTMLElement | null>(null);

const defaultFilters = computed<FilterConfig[]>(() =>
  props.filters !== undefined
    ? props.filters
    : props.globalFilter
      ? []
      : [{ column: 'name', placeholder: 'Filter...' }]
);

const { appTimezone } = useTimezone();

// Inject filterFn for date columns so callers don't have to declare it themselves
const processedColumns = computed(() => {
  const dateColumnIds = new Set(
    (props.filters ?? []).filter((f) => f.type === 'date').map((f) => f.column)
  );
  const columns =
    dateColumnIds.size === 0
      ? props.columns
      : props.columns.map((col) => {
          const id = (col as any).id ?? (col as any).accessorKey;
          return dateColumnIds.has(id) ? { ...col, filterFn: 'dateFilter' as any } : col;
        });
  return props.selectable ? [selectColumn as ColumnDef<TData, TValue>, ...columns] : columns;
});

const keyOf = (row: TData) => props.rowKey?.(row) ?? String((row as any).identifier ?? (row as any).id);

function setSelected(keys: string[], on: boolean) {
  const next = new Set(selection.value);
  for (const key of keys) {
    if (on) next.add(key);
    else next.delete(key);
  }
  selection.value = [...next];
}

const selectColumn: ColumnDef<TData> = {
  id: '__select',
  enableSorting: false,
  meta: { width: 44 },
  header: (ctx) => {
    const shown = ctx.table.getFilteredRowModel().rows.map((r) => keyOf(r.original));
    const ticked = new Set(selection.value);
    const on = shown.filter((key) => ticked.has(key)).length;
    return h(Checkbox, {
      'aria-label': t('dataTable.selectAll'),
      modelValue: on === 0 ? false : on === shown.length ? true : 'indeterminate',
      disabled: shown.length === 0,
      'onUpdate:modelValue': () => setSelected(shown, on < shown.length),
    });
  },
  cell: (info) =>
    h(
      'div',
      { class: 'flex items-center', onClick: (e: MouseEvent) => e.stopPropagation() },
      h(Checkbox, {
        'aria-label': t('dataTable.selectRow'),
        modelValue: selection.value.includes(keyOf(info.row.original)),
        'onUpdate:modelValue': (v: boolean | 'indeterminate') =>
          setSelected([keyOf(info.row.original)], v === true),
      })
    ),
};

const table = useVueTable({
  get data() {
    return props.data;
  },
  get columns() {
    return processedColumns.value;
  },
  state: {
    get sorting() {
      return sorting.value;
    },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  // Every column starts ascending (TanStack would start number columns descending).
  sortDescFirst: false,
  initialState: {
    pagination: { pageSize: props.pageSize ?? 100000 },
    columnVisibility: Object.fromEntries((props.hiddenColumns ?? []).map((id) => [id, false])),
    columnFilters: props.initialFilters ?? [],
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  getRowCanExpand: () => !!props.expandable,
  filterFns: {
    dateFilter: (row, columnId, filterValue) => {
      if (!filterValue) return true;
      const cellValue = row.getValue(columnId);
      if (!cellValue) return false;

      // filterValue is a CalendarDate ({year, month, day}, no timezone) from the
      // Calendar component. Passing it straight to `new Date()`/`new TZDate()` lets
      // it coerce via `.toString()` into a bare "YYYY-MM-DD" string, which JS parses
      // as UTC midnight -- shifting it a day back in negative-offset zones. Build
      // both dates explicitly in the app timezone instead.
      const cellDate = new TZDate(new Date(cellValue as string), appTimezone.value);
      const filterDate = new TZDate(
        filterValue.year,
        filterValue.month - 1,
        filterValue.day,
        appTimezone.value
      );

      const filterConfig = props.filters?.find((f) => f.column === columnId);
      const mode = filterConfig?.dateMode || 'exact';

      // Compare dates based on mode
      if (mode === 'exact') {
        // Compare only date parts (ignore time). toDateString() reads the system
        // timezone off the raw timestamp and ignores TZDate's zone override, so
        // compare the (correctly zone-aware) getters instead.
        return (
          cellDate.getFullYear() === filterDate.getFullYear() &&
          cellDate.getMonth() === filterDate.getMonth() &&
          cellDate.getDate() === filterDate.getDate()
        );
      } else if (mode === 'after') {
        return cellDate >= filterDate;
      } else if (mode === 'before') {
        return cellDate <= filterDate;
      }

      return true;
    },
  },
});

watch(
  () => table.getState().columnFilters,
  (filters) => emit('filtersChange', filters.map((f) => ({ id: f.id, value: f.value })))
);

/**
 * Shows the page a row is on (after sorting and filtering). Returns false when the
 * row is filtered out or not in `data`.
 */
function revealRow(original: unknown): boolean {
  const index = table.getPrePaginationRowModel().rows.findIndex((r) => r.original === original);
  if (index < 0) return false;
  const { pageSize } = table.getState().pagination;
  table.setPageIndex(Math.floor(index / pageSize));
  return true;
}

// Ticked rows the user can no longer see (filtered out, deleted) drop out, so an action
// on the selection never reaches a row that isn't on screen.
watch(
  () => [props.data, table.getState().columnFilters, table.getState().globalFilter],
  () => {
    if (!props.selectable || selection.value.length === 0) return;
    const shown = new Set(table.getFilteredRowModel().rows.map((r) => keyOf(r.original)));
    const kept = selection.value.filter((key) => shown.has(key));
    if (kept.length !== selection.value.length) selection.value = kept;
  }
);

defineExpose({ revealRow });

// ---- fitting the columns to the width
const fitMode = computed<TableFit>(() => props.fit ?? 'scroll');
const sizeOf = (column: { columnDef: unknown }) =>
  ((column.columnDef as { meta?: TableColumnSize }).meta ?? {}) as TableColumnSize;

// The table's width, for sharing it between the columns.
const availableWidth = ref(0);
// The sticky header's height: the scroll fade starts below it so the column names stay solid.
const headerHeight = ref(0);
let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  const el = tableWrapperRef.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  const thead = el.querySelector('thead');
  resizeObserver = new ResizeObserver(() => {
    availableWidth.value = el.clientWidth;
    headerHeight.value = thead?.offsetHeight ?? 0;
  });
  resizeObserver.observe(el);
  if (thead) resizeObserver.observe(thead);
});
onBeforeUnmount(() => resizeObserver?.disconnect());

// wrap / truncate: a fixed layout — one <col> width per visible column, from the rows' text.
const columnLayout = computed(() => {
  if (fitMode.value === 'scroll') return null;
  const columns = table.getVisibleLeafColumns().map((column) => {
    const header = column.columnDef.header;
    const text = typeof header === 'string' ? header : '';
    // A sortable header also holds its arrow (about two characters).
    const shown = sortableHeader(column) ? text.padEnd(text.length + 2) : text;
    return { id: column.id, header: shown, ...sizeOf(column) };
  });
  return fitLayout(
    columns,
    props.sizeData ?? props.data,
    (row, id) => table.getColumn(id)?.accessorFn?.(row as TData, 0),
    availableWidth.value
  );
});

// ---- sorting by a header
const sortableHeader = (column: { getCanSort: () => boolean }) => !!props.sortable && column.getCanSort();
const ariaSort = (column: { getIsSorted: () => false | 'asc' | 'desc' }) => {
  const dir = column.getIsSorted();
  return dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined;
};

// scroll: a column's width / minWidth go on each of its cells.
const cellStyle = (column: { columnDef: unknown }) =>
  fitMode.value === 'scroll' ? columnSizeStyle(sizeOf(column)) : undefined;

// truncate: the full text of a cut-off cell or header shows on hover.
function showFullText(event: MouseEvent) {
  const el = event.currentTarget as HTMLElement;
  const cut = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))].some(
    (n) => n.scrollWidth > n.clientWidth + 1
  );
  const text = el.textContent?.trim() ?? '';
  if (cut && text) el.title = text;
  else el.removeAttribute('title');
}

// Handle select filter change
const handleSelectChange = (column: string, value: any) => {
  // Use undefined instead of empty string to clear the filter
  table.getColumn(column)?.setFilterValue(value === 'all' ? undefined : value);
};

// Handle date filter change
const handleDateChange = (column: string, value: any) => {
  table.getColumn(column)?.setFilterValue(value);
};

// Format a column's CalendarDate filter value for display. Building the Date from
// its year/month/day fields directly (rather than via `new Date(calendarDateObj)`,
// which stringifies to a bare "YYYY-MM-DD" and gets parsed as UTC midnight) keeps
// the label matching the day the user actually clicked, regardless of timezone.
const getDateFilterLabel = (column: string) => {
  const value = table.getColumn(column)?.getFilterValue() as
    | { year: number; month: number; day: number }
    | undefined;
  if (!value) return null;
  return format(new Date(value.year, value.month - 1, value.day), 'PPP');
};

// Editable cell functions
// Only an editable cell swallows the click (it starts editing instead). Every other
// cell lets it bubble to the row, so `rowClick` fires wherever in the row you click.
const onCellClick = (event: MouseEvent, rowIndex: number, columnId: string, currentValue: any) => {
  if (!props.editableColumns?.includes(columnId)) return;
  event.stopPropagation();
  startEditing(rowIndex, columnId, currentValue);
};

const startEditing = (
  rowIndex: number,
  columnId: string,
  currentValue: any
) => {
  if (props.editableColumns?.includes(columnId)) {
    editingCell.value = { rowIndex, columnId };
    editValue.value = currentValue;
  }
};

// cancelEdit clears editingCell first, so a subsequent blur-triggered saveEdit is a no-op
const saveEdit = () => {
  if (!editingCell.value) return;
  emit('cellUpdate', editingCell.value.rowIndex, editingCell.value.columnId, editValue.value);
  editingCell.value = null;
};

const cancelEdit = () => {
  editingCell.value = null;
};

const isEditing = (rowIndex: number, columnId: string) => {
  return (
    editingCell.value?.rowIndex === rowIndex &&
    editingCell.value?.columnId === columnId
  );
};
</script>

<template>
  <div class="table-container">
    <div
      :class="['table-controls', { 'table-controls-flat': flat, 'table-controls-dense': dense }]"
      v-if="globalFilter || defaultFilters.length > 0 || $slots['extra-filters']"
    >
      <!-- Global filter -->
      <Input
        v-if="globalFilter"
        class="filter-input"
        :placeholder="t('dataTable.searchAll')"
        :model-value="(table.getState().globalFilter as string) ?? ''"
        @update:modelValue="table.setGlobalFilter(String($event))"
      />

      <!-- Column-specific filters -->
      <template v-for="filter in defaultFilters" :key="filter.column">
        <!-- Text filter (default) -->
        <Input
          v-if="!filter.type || filter.type === 'text'"
          class="filter-input"
          :placeholder="filter.placeholder || `Filter by ${filter.column}...`"
          :model-value="
            (table.getColumn(filter.column)?.getFilterValue() as string) ?? ''
          "
          @update:modelValue="
            table.getColumn(filter.column)?.setFilterValue($event)
          "
        />

        <!-- Select filter -->
        <Select
          v-else-if="filter.type === 'select' && filter.options"
          :model-value="
            (table.getColumn(filter.column)?.getFilterValue() as string) ||
            'all'
          "
          @update:modelValue="handleSelectChange(filter.column, $event)"
        >
          <SelectTrigger class="filter-select">
            <SelectValue
              :placeholder="filter.placeholder || `Select ${filter.column}...`"
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{{ filter.allLabel || t('dataTable.all') }}</SelectItem>
            <SelectItem
              v-for="option in filter.options"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- Date filter -->
        <Popover v-else-if="filter.type === 'date'">
          <PopoverTrigger as-child>
            <Button
              variant="outline"
              :class="
                cn(
                  'filter-date justify-start text-left font-normal',
                  !table.getColumn(filter.column)?.getFilterValue() &&
                    'text-muted-foreground'
                )
              "
            >
              <CalendarIcon class="mr-2 h-4 w-4" />
              <span>
                {{
                  getDateFilterLabel(filter.column) ||
                  filter.placeholder ||
                  t('dataTable.pickDate')
                }}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent class="p-0" align="start">
            <Calendar
              :model-value="
                table.getColumn(filter.column)?.getFilterValue() as any
              "
              @update:modelValue="handleDateChange(filter.column, $event)"
            />
            <div
              class="p-3 border-t"
              v-if="table.getColumn(filter.column)?.getFilterValue()"
            >
              <Button
                variant="ghost"
                size="sm"
                class="w-full"
                @click="handleDateChange(filter.column, undefined)"
              >
                {{ t('dataTable.clearDate') }}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </template>

      <slot name="extra-filters" />
    </div>

    <div
      :class="[
        'table-wrapper',
        'scroll-fade',
        `table-fit-${fitMode}`,
        { 'table-wrapper-flat': flat, 'table-wrapper-compact': compact, 'table-wrapper-dense': dense },
      ]"
      :style="{
        '--scroll-fade-offset': `${headerHeight}px`,
        ...(columnLayout?.minWidth ? { '--table-min-width': `${columnLayout.minWidth}px` } : {}),
      }"
      ref="tableWrapperRef"
    >
      <Table>
        <colgroup v-if="columnLayout">
          <col
            v-for="column in table.getVisibleLeafColumns()"
            :key="column.id"
            :style="{ width: columnLayout.widths[column.id] }"
          />
        </colgroup>
        <TableHeader v-if="!hideHeader">
          <TableRow
            v-for="headerGroup in table.getHeaderGroups()"
            :key="headerGroup.id"
            :class="['header-row', { 'header-row-flat': flat }]"
          >
            <TableHead
              v-for="header in headerGroup.headers"
              :key="header.id"
              class="header-cell"
              :class="(header.column.columnDef.meta as any)?.class"
              :style="cellStyle(header.column)"
              :aria-sort="sortableHeader(header.column) ? ariaSort(header.column) : undefined"
              @mouseenter="fitMode === 'truncate' && showFullText($event)"
            >
              <button
                v-if="!header.isPlaceholder && sortableHeader(header.column)"
                type="button"
                class="sort-button"
                :class="{ 'sort-button-active': header.column.getIsSorted() }"
                :title="t('dataTable.sortHint')"
                :data-sort-column="header.column.id"
                @click="header.column.getToggleSortingHandler()?.($event)"
              >
                <span class="sort-label">
                  <FlexRender
                    :render="header.column.columnDef.header"
                    :props="header.getContext()"
                  />
                </span>
                <ArrowUp v-if="header.column.getIsSorted() === 'asc'" class="sort-icon" />
                <ArrowDown v-else-if="header.column.getIsSorted() === 'desc'" class="sort-icon" />
                <ChevronsUpDown v-else class="sort-icon sort-icon-idle" />
                <span
                  v-if="sorting.length > 1 && header.column.getSortIndex() >= 0"
                  class="sort-index"
                >{{ header.column.getSortIndex() + 1 }}</span>
              </button>
              <FlexRender
                v-else-if="!header.isPlaceholder"
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <!-- Animated tbody for flat/card mode -->
        <TransitionGroup
          v-if="flat && animated"
          tag="tbody"
          name="activity-row"
        >
          <TableRow
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :data-state="row.getIsSelected() || isRowSelected?.(row.original) || (selectable && selection.includes(keyOf(row.original))) ? 'selected' : undefined"
            class="data-row clickable-row"
            :class="rowClass?.(row.original)"
            :style="{ '--row-index': row.index }"
            @click="emit('rowClick', row.original)"
          >
            <TableCell
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              class="data-cell"
              :class="(cell.column.columnDef.meta as any)?.class"
              :style="cellStyle(cell.column)"
            >
              <FlexRender
                :render="cell.column.columnDef.cell"
                :props="cell.getContext()"
              />
            </TableCell>
          </TableRow>
          <TableRow
            v-if="!table.getRowModel().rows?.length"
            key="__empty"
            class="empty-row"
          >
            <TableCell :colspan="processedColumns.length" class="empty-cell">
              {{ emptyText ?? t('dataTable.noResults') }}
            </TableCell>
          </TableRow>
        </TransitionGroup>

        <!-- Standard tbody -->
        <TableBody v-else>
          <template v-if="table.getRowModel().rows?.length">
            <template v-for="row in table.getRowModel().rows" :key="row.id">
            <TableRow
              :data-state="row.getIsSelected() || isRowSelected?.(row.original) || (selectable && selection.includes(keyOf(row.original))) ? 'selected' : undefined"
              class="data-row clickable-row"
              :class="rowClass?.(row.original)"
              @click="emit('rowClick', row.original)"
            >
              <TableCell
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                class="data-cell"
                :class="[
                  { 'editable-cell': editableColumns?.includes(cell.column.id) },
                  (cell.column.columnDef.meta as any)?.class,
                ]"
                :style="cellStyle(cell.column)"
                @click="onCellClick($event, row.index, cell.column.id, cell.getValue())"
              >
                <div
                  v-if="isEditing(row.index, cell.column.id)"
                  class="edit-container"
                  @click.stop
                >
                  <Input
                    v-model="editValue"
                    class="edit-input"
                    @keyup.enter="saveEdit"
                    @keyup.esc="cancelEdit"
                    @blur="saveEdit"
                    autofocus
                  />
                </div>
                <div
                  class="cell-content"
                  :class="{
                    'cell-content-hidden': isEditing(row.index, cell.column.id),
                  }"
                  @mouseenter="fitMode === 'truncate' && showFullText($event)"
                >
                  <FlexRender
                    :render="cell.column.columnDef.cell"
                    :props="cell.getContext()"
                  />
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="expandable && row.getIsExpanded()" class="expanded-row hover:bg-transparent">
              <TableCell :colspan="row.getVisibleCells().length" class="p-0">
                <slot name="expanded" :row="row.original" />
              </TableCell>
            </TableRow>
            </template>
          </template>
          <template v-else>
            <TableRow class="empty-row">
              <TableCell :colspan="processedColumns.length" class="empty-cell">
                No results.
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>
    <div
      v-if="pageSize && table.getFilteredRowModel().rows.length > pageSize"
      class="flex items-center justify-end gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground shrink-0"
    >
      <span>
        {{
          t('dataTable.range', {
            from: table.getState().pagination.pageIndex * pageSize + 1,
            to: Math.min((table.getState().pagination.pageIndex + 1) * pageSize, table.getFilteredRowModel().rows.length),
            total: table.getFilteredRowModel().rows.length,
          })
        }}
      </span>
      <Button size="icon" variant="ghost" class="h-7 w-7" :disabled="!table.getCanPreviousPage()" :title="t('dataTable.previousPage')" @click="table.previousPage()">
        <ChevronLeft class="size-4" />
      </Button>
      <Button size="icon" variant="ghost" class="h-7 w-7" :disabled="!table.getCanNextPage()" :title="t('dataTable.nextPage')" @click="table.nextPage()">
        <ChevronRight class="size-4" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.table-container {
  position: relative;
  width: 100%;
  border-radius: var(--radius);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.table-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px 0;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.filter-input,
.filter-select,
.filter-date {
  max-width: 24rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
}

.filter-input:hover,
.filter-select:hover,
.filter-date:hover {
  border-color: var(--accent);
  box-shadow: 0 2px 8px oklch(0 0 0 / 0.1);
}

.filter-input:focus,
.filter-select:focus,
.filter-date:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px oklch(from var(--primary) l c h / 0.1);
}

.table-wrapper {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: auto;
  transition: all 0.2s ease;
  max-width: 100%;
  /* Shrink to the container's height (but never grow past the rows), so the rows scroll
     here and the header can stick. */
  flex: 0 1 auto;
  min-height: 0;
}

/* The ui Table's own overflow box would catch the sticky header — let this wrapper be the
   one scroll box (both directions). */
.table-wrapper :deep([data-slot='table-container']) {
  overflow: visible;
}

/* Column names stay in view while the rows scroll. Borders don't stick with collapsed
   borders, so the bottom line is a shadow. */
.table-wrapper :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--muted);
  box-shadow: inset 0 -1px 0 var(--border);
}

:deep(table) {
  table-layout: auto;
  width: 100%;
}

/* fit wrap / truncate: fixed layout from the <colgroup> (see fitLayout). */
.table-fit-wrap :deep(table),
.table-fit-truncate :deep(table) {
  table-layout: fixed;
  min-width: var(--table-min-width, 0);
}

/* fit wrap: long values (and headers) wrap onto more lines — mid-word only if a word is
   wider than its column. */
.table-fit-wrap :deep(.header-cell),
.table-fit-wrap :deep(.data-cell) {
  white-space: normal;
  overflow-wrap: anywhere;
}
.table-fit-wrap :deep(.data-cell .truncate) {
  white-space: normal;
}
.table-fit-wrap :deep(.cell-content .flex-wrap) {
  max-width: 100%;
}

/* fit truncate: every cell stays one line and ends in "…" (inline groups — tags,
   avatar + name — are clipped to the cell). */
.table-fit-truncate :deep(.header-cell),
.table-fit-truncate :deep(.data-cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-fit-truncate :deep(.cell-content) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.table-fit-truncate :deep(.cell-content > .inline-flex) {
  max-width: 100%;
  overflow: hidden;
  flex-wrap: nowrap;
  vertical-align: middle;
}
.table-fit-truncate :deep(.expanded-row > td) {
  white-space: normal;
}

/* dense (app tables, inside a card): keep the search off the card's edge */
.table-controls-dense {
  padding: 8px 8px 0;
}

/* dense: tighter padding, so more columns fit */
.table-wrapper-dense :deep(.header-cell),
.table-wrapper-dense :deep(.data-cell),
.table-wrapper-dense :deep(.edit-container) {
  padding: 8px 12px;
}

/* Header styling */
.header-row {
  background: var(--muted);
  border-bottom: 1px solid var(--border);
}

.header-cell {
  padding: 12px 24px;
  font-weight: 600;
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 14px;
  text-transform: none;
  letter-spacing: normal;
  transition: background-color 0.2s ease;
}

.header-cell:hover {
  background: var(--secondary);
}

.clickable-row {
  cursor: pointer;
}

/* Data row styling */
.data-row {
  background: var(--card);
  border-bottom: 1px solid var(--border);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.data-row:last-child {
  border-bottom: none;
}

.data-row:hover {
  background: oklch(from var(--accent) l c h / 0.05);
  box-shadow: 0 2px 8px oklch(0 0 0 / 0.05);
  position: relative;
  z-index: 1;
}

.data-row[data-state='selected'] {
  background: var(--accent);
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

/* Data cell styling */
.data-cell {
  padding: 16px 24px;
  color: var(--foreground);
  font-family: var(--font-sans);
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden; /* Add this */
  text-overflow: ellipsis; /* Add this */
  white-space: nowrap; /* Add this */
}

/* Editable cell styling */
.editable-cell {
  cursor: text;
  position: relative;
}

.editable-cell:hover::after {
  content: '✎';
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.3;
  font-size: 14px;
}

.edit-container {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: 16px 24px;
  background: var(--card);
  z-index: 2;
  overflow: hidden; /* Add this */
}

.edit-input {
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  height: auto;
  min-height: 0;
  box-shadow: none;
  flex: 1; /* Add this */
  overflow: hidden; /* Add this */
  text-overflow: ellipsis; /* Add this */
}

.edit-input:focus {
  outline: none;
  box-shadow: none;
  border: none; /* Add this */
}

.cell-content-hidden {
  visibility: hidden;
}

/* Empty state */
.empty-row {
  background: var(--card);
}

.empty-cell {
  padding: 48px 12px;
  text-align: center;
  color: var(--muted-foreground);
  font-family: var(--font-sans);
  font-size: 14px;
}

/* Sortable column header: the whole header text is the button */
.sort-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  font: inherit;
  color: inherit;
  cursor: pointer;
  user-select: none;
  border-radius: calc(var(--radius) * 0.75);
}

.sort-button:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.sort-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sort-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}

.sort-icon-idle {
  opacity: 0;
  color: var(--muted-foreground);
  transition: opacity 0.15s ease;
}

.sort-button:hover .sort-icon-idle,
.sort-button:focus-visible .sort-icon-idle {
  opacity: 1;
}

.sort-index {
  font-size: 10px;
  color: var(--muted-foreground);
}

/* Action buttons styling if needed */
:deep(.table-action-button) {
  padding: 4px 10px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: calc(var(--radius) * 1.5);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

:deep(.table-action-button:hover) {
  background: var(--primary);
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px oklch(0 0 0 / 0.1);
}

/* Badge styling for status columns */
:deep(.status-badge) {
  display: inline-block;
  padding: 4px 10px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: calc(var(--radius) * 1.5);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
}

/* Drag handle if needed for reorderable rows */
:deep(.drag-handle) {
  cursor: move;
  cursor: grab;
  color: var(--muted-foreground);
  font-size: 20px;
  user-select: none;
  padding: 4px 8px;
  background: var(--muted);
  border-radius: var(--radius);
  transition: all 0.2s ease;
  display: inline-block;
}

:deep(.drag-handle:hover) {
  color: var(--foreground);
  background: var(--secondary);
}

:deep(.drag-handle:active) {
  cursor: grabbing;
  background: var(--accent);
  color: var(--accent-foreground);
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .table-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-input,
  .filter-select,
  .filter-date {
    max-width: 100%;
  }

  .data-cell,
  .header-cell {
    padding: 8px;
    font-size: 13px;
  }
}

/* Focus visible styles for accessibility */
.data-row:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

/* Animation for row additions/removals if using transitions */
.data-row {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Flat header — transparent bg, only border-bottom, bolder text */
.header-row-flat {
  background: transparent;
  border-bottom: 1px solid var(--border);
}

.header-row-flat :deep(.header-cell) {
  font-weight: 700;
}

/* Flat variant — used when DataTable is embedded inside a Card */
.table-controls-flat {
  padding-left: 24px;
  padding-right: 24px;
  margin-bottom: 0;
}

.table-wrapper-flat {
  border: none;
  border-radius: 0;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.table-wrapper-flat :deep(.data-row) {
  background: transparent;
}

.table-wrapper-flat :deep(.data-row:first-child) {
  border-top: none;
}

/* Row enter animation (flat/card mode via TransitionGroup) */
.activity-row-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  transition-delay: calc(var(--row-index, 0) * 35ms);
}

.activity-row-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.activity-row-leave-active {
  transition: opacity 0.2s ease;
}

.activity-row-leave-to {
  opacity: 0;
}

.table-wrapper-flat :deep(.data-cell) {
  padding-left: 24px;
  padding-right: 24px;
}

/* Compact variant — tighter row height for dense widgets like the dashboard */
.table-wrapper-compact :deep(.data-cell) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.table-wrapper-compact :deep(.header-cell) {
  padding-top: 8px;
  padding-bottom: 8px;
}
</style>
