<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronLeft, ChevronRight, Images } from 'lucide-vue-next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { galleryItems, wrapIndex, type GalleryItem } from '@/utils/appGallery';
import GalleryImage from './GalleryImage.vue';
import AppSkeleton from './AppSkeleton.vue';

// Pictures from rows (or plain srcs): a grid of thumbnails (`display: grid`, the
// default) or a carousel, one at a time with arrows and dots (`autoplay` seconds turns
// it by itself, pausing while hovered). A click opens the picture big with `zoomable`
// (as an Image's), with previous / next and the arrow keys, and fires `itemClick`
// (`selectedItem`, `selectedIndex`). The carousel's picture is `<id>.index`; turning it
// fires `change`. Each picture loads like an Image component's, files read again when
// a run they depend on ends.
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

// Builder samples: drawn pictures, so nothing is fetched.
const swatch = (hue: number, label: string) =>
  `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="hsl(${hue} 60% 62%)"/><text x="160" y="112" font-family="sans-serif" font-size="28" fill="white" text-anchor="middle">${label}</text></svg>`
  )}`;
const SAMPLE = [0, 60, 140, 210, 280, 330].map((hue, i) => ({ src: swatch(hue, `Photo ${i + 1}`), caption: `Photo ${i + 1}` }));
const sample = computed(() => props.editable && typeof props.props.data === 'string');

const items = computed(() =>
  galleryItems(sample.value ? SAMPLE : props.props.data, { srcKey: props.props.srcKey, captionKey: props.props.captionKey })
);
const carousel = computed(() => props.props.display === 'carousel');
const columns = computed(() => {
  const n = Number(props.props.columns);
  return Number.isInteger(n) ? Math.min(6, Math.max(1, n)) : 3;
});
const zoomable = computed(() => props.props.zoomable === true || props.props.zoomable === 'true');
const fit = computed(() =>
  ['contain', 'cover', 'fill'].includes(props.props.fit) ? props.props.fit : carousel.value ? 'contain' : 'cover'
);

// Files read again when a run the gallery depends on ends.
const version = ref(0);
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now) version.value++;
  }
);

// ---- carousel
const index = ref(0);
watch(
  () => items.value.length,
  (n) => {
    if (index.value >= n) index.value = Math.max(0, n - 1);
  }
);
function show(i: number) {
  const next = wrapIndex(i, items.value.length);
  if (next === index.value) return;
  index.value = next;
  if (props.editable) return;
  emit('state', { index: next });
  emit('event', 'change', { index: next });
}
const hovered = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  [() => props.props.autoplay, carousel, () => props.editable, () => items.value.length],
  () => {
    clearInterval(timer);
    const seconds = Number(props.props.autoplay);
    if (!carousel.value || props.editable || !(seconds > 0) || items.value.length < 2) return;
    timer = setInterval(() => !hovered.value && !open.value && show(index.value + 1), Math.max(1, seconds) * 1000);
  },
  { immediate: true }
);
onBeforeUnmount(() => clearInterval(timer));

// ---- click: select, and the lightbox
const open = ref(false);
const big = ref(0);
function pick(item: GalleryItem) {
  if (props.editable) return;
  emit('state', { selectedItem: item.row, selectedIndex: item.index });
  emit('event', 'itemClick', { selectedItem: item.row, selectedIndex: item.index });
  if (zoomable.value) {
    big.value = items.value.indexOf(item);
    open.value = true;
  }
}
const current = computed(() => items.value[big.value]);
function step(by: number) {
  big.value = wrapIndex(big.value + by, items.value.length);
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div v-if="props.props.title" class="flex items-center gap-2 px-(--app-pad) pt-2.5 pb-1.5 text-sm shrink-0">
      <Images class="size-3.5 text-muted-foreground" />
      <span class="font-medium truncate">{{ props.props.title }}</span>
      <span class="ml-auto text-xs text-muted-foreground tabular-nums">{{ t('apps.gallery.count', { count: items.length }, items.length) }}</span>
    </div>

    <AppSkeleton v-if="!items.length && busy && !editable" variant="grid" class="flex-1" />
    <p v-else-if="!items.length" class="m-auto p-4 text-xs text-muted-foreground">{{ props.props.emptyText || t('apps.gallery.empty') }}</p>

    <!-- grid -->
    <div
      v-else-if="!carousel"
      class="flex-1 min-h-0 overflow-y-auto grid gap-2 p-(--app-pad-tight) content-start"
      :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
      data-testid="gallery-grid"
    >
      <figure v-for="item in items" :key="item.key" class="m-0 min-w-0">
        <button
          type="button"
          :class="cn('block w-full aspect-[3/2] overflow-hidden rounded-md border bg-muted', !editable && 'hover:ring-2 hover:ring-ring/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', zoomable && !editable && 'cursor-zoom-in')"
          :aria-label="item.caption || t('apps.gallery.picture', { n: item.index + 1 })"
          :disabled="editable"
          data-item
          @click="pick(item)"
        >
          <GalleryImage :src="item.src" :alt="item.caption" :fit="fit" :version="version" :editable="editable" />
        </button>
        <figcaption v-if="item.caption && !props.props.hideCaptions" class="mt-1 text-xs text-muted-foreground truncate">{{ item.caption }}</figcaption>
      </figure>
    </div>

    <!-- carousel -->
    <div
      v-else
      class="relative flex-1 min-h-0 flex flex-col"
      role="group"
      :aria-roledescription="t('apps.gallery.carousel')"
      data-testid="gallery-carousel"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <button
        type="button"
        :class="cn('relative flex-1 min-h-0 overflow-hidden bg-muted/40', zoomable && !editable && 'cursor-zoom-in')"
        :aria-label="items[index]?.caption || t('apps.gallery.picture', { n: index + 1 })"
        :disabled="editable"
        data-item
        @click="items[index] && pick(items[index])"
      >
        <GalleryImage
          v-if="items[index]"
          :key="items[index].key"
          :src="items[index].src"
          :alt="items[index].caption"
          :fit="fit"
          :version="version"
          :editable="editable"
        />
      </button>
      <template v-if="items.length > 1">
        <button
          type="button"
          class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 border p-1.5 shadow-sm hover:bg-background"
          :aria-label="t('apps.gallery.previous')"
          data-testid="carousel-prev"
          @click="show(index - 1)"
        >
          <ChevronLeft class="size-4" />
        </button>
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 border p-1.5 shadow-sm hover:bg-background"
          :aria-label="t('apps.gallery.next')"
          data-testid="carousel-next"
          @click="show(index + 1)"
        >
          <ChevronRight class="size-4" />
        </button>
      </template>
      <div class="flex items-center gap-2 px-(--app-pad-tight) py-1.5 shrink-0 min-h-8">
        <span v-if="!props.props.hideCaptions" class="text-xs text-muted-foreground truncate flex-1" data-testid="carousel-caption">
          {{ items[index]?.caption }}
        </span>
        <div v-if="items.length > 1" class="flex items-center gap-1 ml-auto" role="tablist">
          <button
            v-for="(item, i) in items"
            :key="item.key"
            type="button"
            role="tab"
            :aria-selected="i === index"
            :aria-label="t('apps.gallery.picture', { n: i + 1 })"
            :class="cn('size-1.5 rounded-full transition-colors', i === index ? 'bg-foreground' : 'bg-muted-foreground/40 hover:bg-muted-foreground')"
            @click="show(i)"
          />
        </div>
      </div>
    </div>

    <Dialog v-if="zoomable" v-model:open="open">
      <DialogContent class="w-auto max-w-[calc(100vw-4rem)] sm:max-w-[calc(100vw-4rem)] p-3" @keydown="onKey">
        <DialogTitle class="sr-only">{{ current?.caption || props.props.title || t('apps.gallery.title') }}</DialogTitle>
        <DialogDescription class="text-xs text-center tabular-nums" data-testid="lightbox-caption">
          {{ current?.caption }}<template v-if="items.length > 1"> · {{ big + 1 }} / {{ items.length }}</template>
        </DialogDescription>
        <div class="relative h-[calc(100vh-9rem)] w-[calc(100vw-6rem)] max-w-full mx-auto">
          <GalleryImage v-if="current" :key="current.key" :src="current.src" :alt="current.caption" fit="contain" :version="version" />
          <template v-if="items.length > 1">
            <button
              type="button"
              class="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 border p-2 shadow-sm hover:bg-background"
              :aria-label="t('apps.gallery.previous')"
              @click="step(-1)"
            >
              <ChevronLeft class="size-5" />
            </button>
            <button
              type="button"
              class="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 border p-2 shadow-sm hover:bg-background"
              :aria-label="t('apps.gallery.next')"
              data-testid="lightbox-next"
              @click="step(1)"
            >
              <ChevronRight class="size-5" />
            </button>
          </template>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
