<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVueFlow } from '@vue-flow/core';
import { GripHorizontal, Trash2 } from 'lucide-vue-next';
import { NOTE_COLORS, type StickyNote } from '@tipeline/utils';

/**
 * A sticky note on the map. Typed straight into; dragged by its top bar (the text area
 * is `nodrag`, so selecting text doesn't move the note).
 */
const props = defineProps<{ note: StickyNote }>();
const emit = defineEmits<{
  (e: 'update', patch: Partial<Pick<StickyNote, 'text' | 'color' | 'w' | 'h'>>): void;
  (e: 'remove'): void;
}>();

const { t } = useI18n();
const text = ref(props.note.text);
watch(
  () => props.note.text,
  (value) => {
    if (value !== text.value) text.value = value;
  }
);

let timer: ReturnType<typeof setTimeout> | null = null;
function onInput() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => commit(), 500);
}
function commit() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (text.value !== props.note.text) emit('update', { text: text.value });
}
// Leaving the page (or switching layout) right after typing must not drop the last words.
onBeforeUnmount(commit);

// Resized from the bottom-right corner, both ways. The size follows the pointer while
// dragging (in map units, so zoom doesn't matter) and is saved when it's let go.
const { viewport } = useVueFlow();
const box = ref<HTMLElement | null>(null);
const live = ref<{ w: number; h: number } | null>(null);
const size = computed(() => live.value ?? { w: props.note.w, h: props.note.h });
const clamp = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)));

function startResize(event: PointerEvent) {
  const el = box.value;
  if (!el) return;
  const zoom = viewport.value.zoom || 1;
  const start = { x: event.clientX, y: event.clientY, w: props.note.w, h: props.note.h ?? el.offsetHeight };
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => {
    live.value = {
      w: clamp(start.w + (e.clientX - start.x) / zoom, 120, 800),
      h: clamp(start.h + (e.clientY - start.y) / zoom, 80, 1200),
    };
  };
  const end = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    if (live.value && (live.value.w !== props.note.w || live.value.h !== props.note.h)) emit('update', { ...live.value });
    live.value = null;
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

const TONE: Record<string, string> = {
  yellow: 'bg-yellow-100 border-yellow-300 dark:bg-yellow-950 dark:border-yellow-800',
  blue: 'bg-sky-100 border-sky-300 dark:bg-sky-950 dark:border-sky-800',
  green: 'bg-emerald-100 border-emerald-300 dark:bg-emerald-950 dark:border-emerald-800',
  pink: 'bg-pink-100 border-pink-300 dark:bg-pink-950 dark:border-pink-800',
};
const SWATCH: Record<string, string> = {
  yellow: 'bg-yellow-300',
  blue: 'bg-sky-300',
  green: 'bg-emerald-300',
  pink: 'bg-pink-300',
};
</script>

<template>
  <div
    ref="box"
    class="group relative flex flex-col rounded-lg border shadow-sm text-sm text-foreground"
    :class="TONE[note.color]"
    :style="{ width: `${size.w}px`, height: size.h ? `${size.h}px` : undefined }"
  >
    <div class="flex h-6 cursor-grab items-center justify-between px-2 active:cursor-grabbing">
      <GripHorizontal class="size-3.5 text-muted-foreground" />
      <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          v-for="color in NOTE_COLORS"
          :key="color"
          type="button"
          class="nodrag size-3 rounded-full border border-black/10"
          :class="[SWATCH[color], note.color === color ? 'ring-2 ring-foreground/40' : '']"
          :aria-label="t(`projectMap.notes.color.${color}`)"
          :aria-pressed="note.color === color"
          @click.stop="emit('update', { color })"
        />
        <button
          type="button"
          class="nodrag ml-1 rounded p-0.5 text-muted-foreground hover:text-destructive"
          :aria-label="t('projectMap.notes.remove')"
          :title="t('projectMap.notes.remove')"
          @click.stop="emit('remove')"
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>
    </div>
    <textarea
      v-model="text"
      class="nodrag nowheel min-h-16 flex-1 resize-none bg-transparent px-3 pb-2.5 leading-snug outline-none placeholder:text-muted-foreground"
      rows="3"
      :aria-label="t('projectMap.notes.label')"
      :placeholder="t('projectMap.notes.placeholder')"
      @input="onInput"
      @blur="commit"
    />
    <span
      class="nodrag absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none opacity-0 transition-opacity group-hover:opacity-100"
      :aria-label="t('projectMap.notes.resize')"
      :title="t('projectMap.notes.resize')"
      @pointerdown.stop.prevent="startResize"
    >
      <svg viewBox="0 0 16 16" class="size-4 text-muted-foreground" aria-hidden="true">
        <path d="M14 6 6 14M14 10l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" />
      </svg>
    </span>
  </div>
</template>
