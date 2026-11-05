<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronLeft, ChevronRight, FileText, FileWarning, Loader2, Minus, MoveHorizontal, MoveVertical, Plus } from 'lucide-vue-next';
import { loadPdfBytes, pdfSource, PdfLoadError } from '@/utils/appPdf';
import { APP_RUNTIME } from '../appRuntimeKey';
// Only the worker's URL here; pdf.js itself loads when a PDF is first shown.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import AppSkeleton from './AppSkeleton.vue';

// A PDF — a web link, a file a workflow wrote (inside ~/Tipeline), or base64 — drawn
// by pdf.js: pages one under the other, each drawn when it scrolls into view, at the
// width of the component times the zoom. `<id>.page` / `<id>.pages`; `pageChange`
// fires as the reader moves. Like an Image, a file reloads when a run it depends on
// ends (the workflow may have rewritten it).
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
const { t } = useI18n();
const runtime = inject(APP_RUNTIME, null);

type PdfDoc = { numPages: number; getPage(n: number): Promise<any>; destroy(): Promise<void> };

const source = computed(() => pdfSource(props.props.src));
const isBinding = computed(() => typeof props.props.src === 'string' && /\{[{=%]/.test(props.props.src));

const doc = shallowRef<PdfDoc | null>(null);
const pages = ref(0);
const page = ref(1);
const loading = ref(false);
const error = ref<string | null>(null);
const zoom = ref(1); // × the width that fits
const aspect = ref(1.414); // height / width of page 1, for the not-yet-drawn ones

const scroller = ref<HTMLElement | null>(null);
const width = ref(0);
const height = ref(0);
// What zoom 100% means: the page as wide as the viewer, or the whole page in view.
const fit = ref<'width' | 'page'>('width');
const canvases = new Map<number, HTMLCanvasElement>();
const drawn = new Map<number, number>(); // page → the width it was drawn at
// Each drawn page's height / width (pages may differ); others use page 1's.
const shapes = reactive<Record<number, number>>({});
const visible = new Set<number>();

// Bumped when a run this viewer depends on ends: same path, maybe a new file. Only a
// file can change behind the same `src`; a link or base64 is reloaded only when the
// text changes.
const version = ref(0);
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now && source.value.kind === 'file') version.value++;
  }
);

let pdfjs: typeof import('pdfjs-dist') | null = null;
async function lib() {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

let loadId = 0;
async function load() {
  const id = ++loadId;
  const old = doc.value;
  doc.value = null;
  pages.value = 0;
  drawn.clear();
  for (const key of Object.keys(shapes)) delete shapes[Number(key)];
  void old?.destroy();
  error.value = null;
  if (props.editable || !['url', 'file', 'data'].includes(source.value.kind)) return;
  loading.value = true;
  try {
    const bytes = await loadPdfBytes(source.value, version.value, runtime?.appIdentifier());
    const { getDocument } = await lib();
    const next = (await getDocument({ data: bytes }).promise) as unknown as PdfDoc;
    if (id !== loadId) return void next.destroy();
    const first = await next.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    aspect.value = vp.height / vp.width;
    doc.value = next;
    pages.value = next.numPages;
    const start = Math.min(Math.max(Number(props.props.page) || 1, 1), next.numPages);
    page.value = start;
    emit('state', { pages: next.numPages, page: start });
    await nextTick();
    if (start > 1) goTo(start, 'auto');
    void drawVisible();
  } catch (e: any) {
    if (id !== loadId) return;
    error.value =
      e instanceof PdfLoadError
        ? t(`apps.pdf.errors.${e.code}`)
        : e?.name === 'InvalidPDFException'
          ? t('apps.pdf.errors.invalid')
          : String(e?.message ?? e);
  } finally {
    if (id === loadId) loading.value = false;
  }
}
// Keyed on the text of `src`, not on `source`: that object is rebuilt whenever the
// props are re-read (e.g. after this viewer reports its page), which would reload the
// document — and jump back to page 1 — on every scroll.
watch([() => String(props.props.src ?? ''), version, () => props.editable], load, { immediate: true });

// ---- drawing
const pageWidth = computed(() => {
  const byWidth = width.value - 24;
  // Fit page: as wide as lets the whole (first) page fit the viewer's height.
  const base = fit.value === 'page' ? Math.min(byWidth, (height.value - 24) / aspect.value) : byWidth;
  return Math.max(120, Math.floor(base * zoom.value));
});

async function draw(n: number) {
  const current = doc.value;
  const canvas = canvases.get(n);
  if (!current || !canvas || drawn.get(n) === pageWidth.value) return;
  drawn.set(n, pageWidth.value);
  let pdfPage;
  try {
    pdfPage = await current.getPage(n);
  } catch {
    drawn.delete(n); // the document was closed meanwhile (a new one is loading)
    return;
  }
  if (current !== doc.value) return;
  const base = pdfPage.getViewport({ scale: 1 });
  const ratio = window.devicePixelRatio || 1;
  const viewport = pdfPage.getViewport({ scale: (pageWidth.value / base.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  shapes[n] = base.height / base.width;
  try {
    await pdfPage.render({ canvas, viewport }).promise;
  } catch {
    drawn.delete(n); // cancelled or failed: try again next time it shows
  }
}
async function drawVisible() {
  for (const n of [...visible].sort((a, b) => a - b)) await draw(n);
}
// A new width (zoom, resize) changes every page's height: stay on the same page.
watch(pageWidth, async () => {
  const keep = page.value;
  drawn.clear();
  await nextTick();
  if (keep > 1) goTo(keep, 'auto');
  void drawVisible();
});

// Which pages are on screen (drawn), and which one is mostly in view (the page).
let io: IntersectionObserver | null = null;
const ratios = new Map<number, number>();
function observe(n: number, el: HTMLCanvasElement | null) {
  if (!el) {
    canvases.delete(n);
    return;
  }
  if (canvases.get(n) === el) return;
  canvases.set(n, el);
  io?.observe(el);
}
let ro: ResizeObserver | null = null;
onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const n = Number((entry.target as HTMLElement).dataset.page);
        if (entry.isIntersecting) visible.add(n);
        else visible.delete(n);
        ratios.set(n, entry.intersectionRatio);
      }
      void drawVisible();
      const best = [...ratios.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (best && best[1] > 0 && best[0] !== page.value) {
        page.value = best[0];
        emit('state', { page: best[0] });
        emit('event', 'pageChange', { page: best[0] });
      }
    },
    { root: scroller.value, threshold: [0, 0.25, 0.5, 0.75, 1] }
  );
  for (const el of canvases.values()) io.observe(el);
  ro = new ResizeObserver(([entry]) => {
    width.value = entry.contentRect.width;
    height.value = entry.contentRect.height;
  });
  if (scroller.value) ro.observe(scroller.value);
});
onBeforeUnmount(() => {
  io?.disconnect();
  ro?.disconnect();
  void doc.value?.destroy();
});

// ---- toolbar
function goTo(n: number, behavior: ScrollBehavior = 'smooth') {
  const target = Math.min(Math.max(Math.round(n) || 1, 1), pages.value || 1);
  canvases.get(target)?.scrollIntoView({ behavior, block: 'start' });
}
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
function zoomBy(step: 1 | -1) {
  const i = ZOOMS.findIndex((z) => z >= zoom.value - 1e-9);
  zoom.value = ZOOMS[Math.min(Math.max((i < 0 ? ZOOMS.length - 1 : i) + step, 0), ZOOMS.length - 1)];
}
const pageInput = ref('');
watch(page, (n) => (pageInput.value = String(n)), { immediate: true });
const button =
  'p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent';
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div
      v-if="!props.props.hideToolbar"
      class="flex items-center gap-1 border-b px-(--app-pad-tight) py-1.5 text-xs shrink-0"
    >
      <FileText class="size-3.5 text-muted-foreground ml-1" />
      <span class="font-medium truncate mr-auto">{{ props.props.title || t('apps.pdf.title') }}</span>
      <template v-if="pages">
        <button type="button" :class="button" :disabled="page <= 1" :aria-label="t('apps.pdf.previous')" @click="goTo(page - 1)">
          <ChevronLeft class="size-3.5" />
        </button>
        <input
          v-model="pageInput"
          class="w-9 rounded border bg-transparent px-1 py-0.5 text-center tabular-nums"
          :aria-label="t('apps.pdf.page')"
          @keydown.enter="goTo(Number(pageInput))"
          @blur="pageInput = String(page)"
        />
        <span class="text-muted-foreground tabular-nums" data-testid="pdf-pages">/ {{ pages }}</span>
        <button type="button" :class="button" :disabled="page >= pages" :aria-label="t('apps.pdf.next')" @click="goTo(page + 1)">
          <ChevronRight class="size-3.5" />
        </button>
        <span class="mx-1 h-4 w-px bg-border" />
        <button type="button" :class="button" :disabled="zoom <= ZOOMS[0]" :aria-label="t('apps.pdf.zoomOut')" @click="zoomBy(-1)">
          <Minus class="size-3.5" />
        </button>
        <span class="w-9 text-center tabular-nums text-muted-foreground" data-testid="pdf-zoom">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" :class="button" :disabled="zoom >= ZOOMS[ZOOMS.length - 1]" :aria-label="t('apps.pdf.zoomIn')" @click="zoomBy(1)">
          <Plus class="size-3.5" />
        </button>
        <!-- Switches what fits: the page's width, or the whole page (and back to 100%). -->
        <button
          type="button"
          :class="button"
          :aria-label="fit === 'width' ? t('apps.pdf.fitPage') : t('apps.pdf.fitWidth')"
          :title="fit === 'width' ? t('apps.pdf.fitPage') : t('apps.pdf.fitWidth')"
          data-testid="pdf-fit"
          @click="fit = fit === 'width' ? 'page' : 'width'; zoom = 1"
        >
          <component :is="fit === 'width' ? MoveVertical : MoveHorizontal" class="size-3.5" />
        </button>
      </template>
    </div>

    <div ref="scroller" class="flex-1 min-h-0 overflow-auto bg-muted/40" data-testid="pdf-scroller">
      <div v-if="editable" class="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground p-(--app-pad)">
        <FileText class="size-6" />
        <span class="text-xs font-mono truncate max-w-full" :title="isBinding ? props.props.src : ''">
          {{ isBinding ? props.props.src : props.props.src || t('apps.pdf.noSource') }}
        </span>
      </div>
      <div v-else-if="error" class="h-full flex flex-col items-center justify-center gap-1.5 text-destructive text-xs p-(--app-pad) text-center" data-testid="pdf-error">
        <FileWarning class="size-6" />
        {{ error }}
      </div>
      <div v-else-if="loading" class="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 class="size-5 animate-spin" />
      </div>
      <AppSkeleton v-else-if="!pages && source.kind === 'none' && busy" variant="block" />
      <div
        v-else-if="!pages"
        class="h-full flex items-center justify-center text-xs text-muted-foreground p-(--app-pad) text-center"
      >
        {{ source.kind === 'invalid' ? t('apps.pdf.errors.invalid') : props.props.emptyText || t('apps.pdf.noSource') }}
      </div>
      <div v-else class="flex flex-col items-center gap-3 py-3 min-w-fit px-3">
        <canvas
          v-for="n in pages"
          :key="n"
          :ref="(el) => observe(n, el as HTMLCanvasElement | null)"
          :data-page="n"
          class="bg-white shadow-sm block"
          :style="{ width: `${pageWidth}px`, height: `${Math.floor(pageWidth * (shapes[n] ?? aspect))}px` }"
        />
      </div>
    </div>
  </div>
</template>
