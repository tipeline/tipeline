<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Columns2, Eye, SquarePen } from 'lucide-vue-next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// The near-full-screen editor both builders open from a field (workflow action code
// fields, app builder text fields). With a preview it shows Editor | Split | Preview —
// split side by side, or one at full width — and remembers the choice. The preview
// can be dragged narrower (centered, with its size shown) to try layouts at another
// width; double-click the handle to fill again. The editor stays mounted in every mode,
// so switching never loses the cursor or the undo history.
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    /** Show the preview slot and the mode switch. */
    previewable?: boolean;
    /** e.g. "Real data from last run — 2 hours ago". */
    previewLabel?: string;
  }>(),
  { description: '', previewable: false, previewLabel: '' }
);
const emit = defineEmits<{ 'update:open': [open: boolean] }>();
const { t } = useI18n();

type Mode = 'editor' | 'split' | 'preview';
const MODES: Array<{ id: Mode; icon: typeof Eye }> = [
  { id: 'editor', icon: SquarePen },
  { id: 'split', icon: Columns2 },
  { id: 'preview', icon: Eye },
];
const STORAGE_KEY = 'tipeline.editorDialog.mode';

function savedMode(): Mode {
  try {
    const m = localStorage.getItem(STORAGE_KEY);
    return m === 'editor' || m === 'preview' || m === 'split' ? m : 'split';
  } catch {
    return 'split';
  }
}
const chosen = ref<Mode>(savedMode());
watch(chosen, (m) => {
  try {
    localStorage.setItem(STORAGE_KEY, m);
  } catch {
    // Not remembered (storage unavailable) — still works for this dialog.
  }
});
// Without a preview there is only the editor.
const mode = computed<Mode>(() => (props.previewable ? chosen.value : 'editor'));
const showEditor = computed(() => mode.value !== 'preview');
const showPreview = computed(() => props.previewable && mode.value !== 'editor');

// ---- preview width: drag the handle; the box stays centered as it shrinks
const MIN_PREVIEW_WIDTH = 280;
const groupRef = ref<HTMLElement | null>(null);
const boxRef = ref<HTMLElement | null>(null);
const widthPx = ref<number | null>(null); // null = fill
const size = ref<{ width: number; height: number } | null>(null);
// The preview may be an iframe (its own document): while dragging, a transparent
// overlay keeps mousemove / mouseup on this window, so the drag can't get stuck.
const dragging = ref(false);

let observer: ResizeObserver | null = null;
watch(boxRef, (el) => {
  observer?.disconnect();
  observer = null;
  size.value = null;
  if (!el) return;
  observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    size.value = { width: Math.round(width), height: Math.round(height) };
  });
  observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());
// A pane that changes size (switching modes) starts filling again.
watch(mode, () => (widthPx.value = null));

function startResize(e: MouseEvent) {
  e.preventDefault();
  // A double-click fills again. Checked here, on the second press: the first press
  // already put the drag overlay over the handle, so a dblclick listener on the handle
  // would never hear it.
  if (e.detail >= 2) {
    widthPx.value = null;
    return;
  }
  const box = boxRef.value;
  const group = groupRef.value;
  if (!box || !group) return;
  dragging.value = true;
  let lastX = e.clientX;
  let width = widthPx.value ?? box.getBoundingClientRect().width;
  const max = group.getBoundingClientRect().width;
  function onMove(ev: MouseEvent) {
    // ×2: both edges move to stay centered, the handle tracks one edge 1:1.
    width = Math.min(max, Math.max(MIN_PREVIEW_WIDTH, width + (ev.clientX - lastX) * 2));
    lastX = ev.clientX;
    widthPx.value = width;
  }
  function onUp() {
    dragging.value = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent
      class="flex h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-[calc(100vw-4rem)] sm:max-w-[calc(100vw-4rem)] flex-col"
    >
      <!-- One header row for both panes, so they start level. -->
      <div class="flex items-center gap-3 shrink-0 pr-8">
        <DialogHeader class="flex-1 min-w-0">
          <DialogTitle class="truncate">{{ title }}</DialogTitle>
          <DialogDescription class="sr-only">{{ description || t('editorDialog.description') }}</DialogDescription>
        </DialogHeader>
        <span v-if="showPreview && previewLabel" class="text-[11px] text-muted-foreground truncate">{{ previewLabel }}</span>
        <span v-if="showPreview && size" class="font-mono text-[11px] text-muted-foreground shrink-0">
          {{ size.width }} × {{ size.height }}
        </span>
        <div v-if="showEditor" class="flex items-center gap-0.5 shrink-0">
          <slot name="actions" />
        </div>
        <div
          v-if="previewable"
          role="radiogroup"
          :aria-label="t('editorDialog.layout')"
          class="flex items-center rounded-md border p-0.5 shrink-0"
        >
          <button
            v-for="m in MODES"
            :key="m.id"
            type="button"
            role="radio"
            :aria-checked="mode === m.id"
            :title="t(`editorDialog.modes.${m.id}`)"
            :class="
              cn(
                'inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors',
                mode === m.id ? 'bg-secondary text-secondary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              )
            "
            @click="chosen = m.id"
          >
            <component :is="m.icon" class="size-3.5" />
            {{ t(`editorDialog.modes.${m.id}`) }}
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 flex gap-4">
        <div v-show="showEditor" class="min-w-0 min-h-0 flex-1 flex flex-col">
          <slot name="editor" />
        </div>
        <div v-if="showPreview" ref="groupRef" class="min-w-0 min-h-0 flex-1 flex px-2">
          <div class="flex-1" />
          <div ref="boxRef" class="relative shrink-0 h-full" :style="{ width: widthPx ? `${widthPx}px` : '100%' }">
            <div class="h-full w-full overflow-hidden rounded-md border bg-card">
              <slot name="preview" />
            </div>
            <div
              class="absolute inset-y-0 right-0 flex w-3 translate-x-1/2 cursor-col-resize items-center justify-center"
              :title="t('editorDialog.resize')"
              @mousedown="startResize"
            >
              <div class="h-10 w-1.5 rounded-full bg-border transition-colors hover:bg-primary/40" />
            </div>
            <div v-if="dragging" class="fixed inset-0 z-100 cursor-col-resize" />
          </div>
          <div class="flex-1" />
        </div>
      </div>

      <div v-if="$slots.footer" class="flex justify-end shrink-0">
        <slot name="footer" />
      </div>
    </DialogContent>
  </Dialog>
</template>
