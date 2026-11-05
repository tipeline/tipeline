<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRightLeft } from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { BADGE_HEX } from '@/utils/appBadge';
import { formatValue, valueAt, type ValueFormat } from '@/utils/appFormat';
import { kanbanBoard, resolveDrop, type KanbanCard, type KanbanColumn, type KanbanMove } from '@/utils/appKanban';
import AppBadge from '../AppBadge.vue';
import AppColorChip from './AppColorChip.vue';
import AppSkeleton from './AppSkeleton.vue';

// Rows as cards in columns by a key (default `status`): to do / doing / done. Drag a
// card to another column (or place) — or use its "Move to" menu — and it moves at once
// and fires `cardMove`, with `<id>.lastMove` = { card, from, to, fromIndex, index } for
// the workflow that saves it. The move is kept until the board's data is replaced (the
// list read again): saved, it stays; failed, the card goes back. A click fires
// `cardClick` (`selectedCard`). `limit` on a column turns its count red past it.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t, locale } = useI18n();

const SAMPLE = [
  { id: 1, title: 'Write the brief', status: 'todo', owner: 'Ana' },
  { id: 2, title: 'Design the form', status: 'doing', owner: 'Luis' },
  { id: 3, title: 'Review the copy', status: 'doing', owner: 'Ana' },
  { id: 4, title: 'Publish', status: 'done', owner: 'Sam' },
];
const sample = computed(() => props.editable && typeof props.props.data === 'string');

// Local moves, until the data is replaced (not compared by content: a list read again
// after a failed save is the same as before, and the card must go back).
const moves = ref<KanbanMove[]>([]);
watch(
  () => props.props.data,
  () => (moves.value = [])
);

const board = computed(() =>
  kanbanBoard(
    sample.value ? SAMPLE : props.props.data,
    {
      groupKey: sample.value ? 'status' : props.props.groupKey,
      columns: props.props.columns,
      titleKey: props.props.titleKey,
      rowKey: props.props.rowKey,
      colorKey: props.props.colorKey,
      colors: props.props.colors,
    },
    moves.value
  )
);
const canMove = computed(() => !props.editable && !props.props.readOnly);
const total = computed(() => board.value.reduce((n, c) => n + c.cards.length, 0));

type Field = { key: string; label?: string; format?: ValueFormat; currency?: string; colors?: Record<string, unknown> };
const fields = computed<Field[]>(() =>
  Array.isArray(props.props.fields) ? props.props.fields.filter((f: any) => f && typeof f.key === 'string') : []
);
const shown = (card: KanbanCard, f: Field) => {
  const value = valueAt(card.row, f.key);
  return f.format === 'badge' || f.format === 'color' ? value : formatValue(value, { format: f.format, currency: f.currency }, locale.value);
};
const filled = (card: KanbanCard) => fields.value.filter((f) => {
  const v = valueAt(card.row, f.key);
  return v !== undefined && v !== null && v !== '';
});

function move(key: string, to: string, index: number) {
  const drop = resolveDrop(board.value, key, to, index);
  if (!drop) return;
  const card = drop.from.cards[drop.fromIndex];
  moves.value = [...moves.value, { key, to: drop.to.id, index: drop.index }];
  const lastMove = { card: card.row, from: drop.from.other ? null : drop.from.value, to: drop.to.value, fromIndex: drop.fromIndex, index: drop.index };
  emit('state', { lastMove });
  emit('event', 'cardMove', { lastMove });
}

function open(card: KanbanCard) {
  if (props.editable) return;
  emit('state', { selectedCard: card.row, selectedIndex: card.index });
  emit('event', 'cardClick', { selectedCard: card.row, selectedIndex: card.index });
}

// ---- drag and drop (native): where it would land is shown as a line
const dragging = ref<string | null>(null);
const target = ref<{ column: string; index: number } | null>(null);

function onDragStart(e: DragEvent, card: KanbanCard) {
  if (!canMove.value) return e.preventDefault();
  dragging.value = card.key;
  e.dataTransfer?.setData('text/plain', card.key);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e: DragEvent, column: KanbanColumn) {
  if (!dragging.value || column.other) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const list = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-card]');
  let index = list.length;
  for (let i = 0; i < list.length; i++) {
    const box = list[i].getBoundingClientRect();
    if (e.clientY < box.top + box.height / 2) {
      index = i;
      break;
    }
  }
  target.value = { column: column.id, index };
}
function onDragLeave(e: DragEvent) {
  const to = e.relatedTarget as Node | null;
  if (!to || !(e.currentTarget as HTMLElement).contains(to)) target.value = null;
}
function onDrop(e: DragEvent) {
  e.preventDefault();
  if (dragging.value && target.value) move(dragging.value, target.value.column, target.value.index);
  onDragEnd();
}
function onDragEnd() {
  dragging.value = null;
  target.value = null;
}
const lineAt = (column: KanbanColumn, i: number) => target.value?.column === column.id && target.value.index === i;
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div v-if="props.props.title" class="flex items-center gap-2 px-(--app-pad) pt-2.5 pb-1 text-sm shrink-0">
      <span class="font-medium truncate">{{ props.props.title }}</span>
      <span class="ml-auto text-xs text-muted-foreground tabular-nums">{{ t('apps.kanban.cards', { count: total }, total) }}</span>
    </div>
    <AppSkeleton v-if="!total && busy && !editable" variant="board" class="flex-1" />
    <div v-else class="flex-1 min-h-0 flex gap-2.5 overflow-x-auto p-(--app-pad-tight)" data-testid="kanban">
      <section
        v-for="column in board"
        :key="column.id"
        class="flex flex-col min-h-0 flex-1 basis-0 min-w-48 max-w-80 rounded-lg bg-muted/50 border"
        :class="target?.column === column.id && 'ring-2 ring-primary/40'"
        :data-column="column.other ? 'other' : column.id"
        :aria-label="column.other ? t('apps.kanban.other') : column.label"
      >
        <header class="flex items-center gap-2 px-3 py-2 text-xs font-medium shrink-0">
          <span v-if="column.color" class="size-2 rounded-full shrink-0" :style="{ background: BADGE_HEX[column.color] }" />
          <span class="truncate">{{ column.other ? t('apps.kanban.other') : column.label }}</span>
          <span
            class="ml-auto tabular-nums rounded-full px-1.5"
            :class="column.limit && column.cards.length > column.limit ? 'bg-destructive/15 text-destructive' : 'text-muted-foreground'"
            :title="column.limit ? t('apps.kanban.limit', { limit: column.limit }) : undefined"
            data-testid="column-count"
          >{{ column.limit ? `${column.cards.length} / ${column.limit}` : column.cards.length }}</span>
        </header>
        <div
          class="flex-1 min-h-12 overflow-y-auto scroll-fade px-2 pb-2 flex flex-col gap-1.5"
          @dragover="onDragOver($event, column)"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <template v-for="(card, i) in column.cards" :key="card.key">
            <div v-if="lineAt(column, i)" class="h-0.5 -my-0.5 rounded bg-primary shrink-0" data-testid="drop-line" />
            <article
              data-card
              :data-key="card.key"
              :draggable="canMove"
              role="button"
              tabindex="0"
              :class="
                cn(
                  'group/card relative rounded-md border bg-background px-2.5 py-2 text-sm shadow-xs text-left',
                  canMove && 'cursor-grab active:cursor-grabbing',
                  !editable && 'hover:border-primary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  dragging === card.key && 'opacity-40'
                )
              "
              :style="card.color ? { borderLeft: `3px solid ${BADGE_HEX[card.color]}` } : undefined"
              @click="open(card)"
              @keydown.enter.prevent="open(card)"
              @dragstart="onDragStart($event, card)"
              @dragend="onDragEnd"
            >
              <div class="flex items-start gap-1.5">
                <span class="flex-1 min-w-0 font-medium leading-snug break-words">{{ card.title }}</span>
                <DropdownMenu v-if="canMove && board.filter((c) => !c.other).length > 1">
                  <DropdownMenuTrigger as-child>
                    <button
                      type="button"
                      class="-mr-1 -mt-0.5 p-1 rounded text-muted-foreground opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground"
                      :aria-label="t('apps.kanban.moveTo')"
                      :title="t('apps.kanban.moveTo')"
                      data-testid="move-menu"
                      @click.stop
                    >
                      <ArrowRightLeft class="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel class="text-xs">{{ t('apps.kanban.moveTo') }}</DropdownMenuLabel>
                    <DropdownMenuItem
                      v-for="other in board.filter((c) => !c.other && c.id !== column.id)"
                      :key="other.id"
                      @select="move(card.key, other.id, other.cards.length)"
                    >
                      {{ other.label }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <dl v-if="filled(card).length" class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground m-0">
                <div v-for="f in filled(card)" :key="f.key" class="flex items-center gap-1 min-w-0">
                  <dt v-if="f.label" class="m-0">{{ f.label }}</dt>
                  <dd class="m-0 min-w-0 truncate text-foreground/80">
                    <AppBadge v-if="f.format === 'badge'" :value="shown(card, f)" :colors="f.colors" />
                    <AppColorChip v-else-if="f.format === 'color'" :value="shown(card, f)" />
                    <template v-else>{{ shown(card, f) }}</template>
                  </dd>
                </div>
              </dl>
            </article>
          </template>
          <div v-if="lineAt(column, column.cards.length)" class="h-0.5 rounded bg-primary shrink-0" data-testid="drop-line" />
          <p v-if="!column.cards.length && !lineAt(column, 0)" class="m-0 py-3 text-center text-xs text-muted-foreground">
            {{ props.props.emptyText || t('apps.kanban.noCards') }}
          </p>
        </div>
      </section>
      <p v-if="!board.length" class="m-auto text-xs text-muted-foreground">{{ t('apps.kanban.noColumns') }}</p>
    </div>
  </div>
</template>
