<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MapPinned } from 'lucide-vue-next';
import type * as Leaflet from 'leaflet';
import { markersFrom, MARKER_HEX, type MapMarker } from '@/utils/appMap';
import { valueAt } from '@/utils/appFormat';

// Rows with a latitude and longitude as markers on a map (Leaflet, OpenStreetMap
// tiles by default). It fits all markers in view unless `center` / `zoom` say where to
// look. A click shows the row's popup and fires `markerClick` — `<id>.selectedMarker`
// is the row. Leaflet loads only when a map is shown. Popups are built from text, never
// HTML: rows can hold anything a workflow returned.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ event: [name: string, payload?: Record<string, unknown>] }>();
const { t } = useI18n();

const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_CREDIT = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const SAMPLE = [
  { name: 'San José', lat: 9.9281, lng: -84.0907, status: 'active' },
  { name: 'Alajuela', lat: 10.0163, lng: -84.2116, status: 'pending' },
  { name: 'Cartago', lat: 9.8644, lng: -83.9194, status: 'closed' },
];

const markers = computed<MapMarker[]>(() =>
  markersFrom(props.editable && typeof props.props.data === 'string' ? SAMPLE : props.props.data, {
    latKey: props.props.latKey,
    lngKey: props.props.lngKey,
    labelKey: props.props.labelKey,
    colorKey: props.editable && typeof props.props.data === 'string' ? 'status' : props.props.colorKey,
    colors: props.props.colors,
    defaultColor: props.props.defaultColor,
  })
);

const box = ref<HTMLElement | null>(null);
const map = shallowRef<Leaflet.Map | null>(null);
let L: typeof Leaflet | null = null;
let layer: Leaflet.LayerGroup | null = null;
let ro: ResizeObserver | null = null;
const failed = ref(false);

function textElement(text: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function popupFor(m: MapMarker): HTMLElement {
  const el = document.createElement('div');
  el.className = 'text-xs';
  if (m.label) {
    const title = document.createElement('div');
    title.className = 'font-semibold text-sm';
    title.textContent = m.label;
    el.appendChild(title);
  }
  const fields: string[] = Array.isArray(props.props.popupFields) ? props.props.popupFields : [];
  for (const key of fields) {
    const value = valueAt(m.row, key);
    if (value === undefined || value === null || value === '') continue;
    const line = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'text-muted-foreground';
    name.textContent = `${key}: `;
    line.append(name, String(typeof value === 'object' ? JSON.stringify(value) : value));
    el.appendChild(line);
  }
  return el;
}

function draw(fit: boolean) {
  if (!L || !map.value) return;
  layer?.clearLayers();
  layer ??= L.layerGroup().addTo(map.value);
  for (const m of markers.value) {
    const marker = L.circleMarker([m.lat, m.lng], {
      radius: 8,
      color: '#ffffff',
      weight: 2,
      fillColor: MARKER_HEX[m.color],
      fillOpacity: 0.95,
    });
    // Leaflet treats a string as HTML: hand it an element holding text.
    if (m.label) marker.bindTooltip(textElement(m.label), { direction: 'top', offset: [0, -8] });
    marker.bindPopup(() => popupFor(m));
    marker.on('click', () => {
      if (!props.editable) emit('event', 'markerClick', { selectedMarker: m.row, selectedIndex: m.index });
    });
    marker.addTo(layer);
  }
  if (fit) view();
}

// Where to look: the given center / zoom, else all markers in view.
function view() {
  if (!L || !map.value) return;
  const center = props.props.center;
  const zoom = Number(props.props.zoom);
  if (Array.isArray(center) && center.length === 2 && center.every((n: unknown) => Number.isFinite(Number(n)))) {
    map.value.setView([Number(center[0]), Number(center[1])], Number.isFinite(zoom) ? zoom : 12);
  } else if (markers.value.length) {
    const bounds = L.latLngBounds(markers.value.map((m) => [m.lat, m.lng] as [number, number]));
    map.value.fitBounds(bounds, { padding: [24, 24], maxZoom: Number.isFinite(zoom) ? zoom : 15 });
  } else {
    map.value.setView([20, 0], 2);
  }
}

onMounted(async () => {
  try {
    const mod = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    L = (mod as any).default ?? mod;
  } catch {
    failed.value = true;
    return;
  }
  if (!box.value || !L) return;
  map.value = L.map(box.value, { zoomControl: true, attributionControl: true, scrollWheelZoom: !props.editable });
  L.tileLayer(props.props.tiles || OSM, {
    maxZoom: 19,
    // Leaflet shows the credit as HTML: an app's own is shown as text.
    attribution: props.props.tiles ? escapeHtml(String(props.props.attribution ?? '')) : OSM_CREDIT,
  }).addTo(map.value);
  draw(true);
  ro = new ResizeObserver(() => map.value?.invalidateSize());
  ro.observe(box.value);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  map.value?.remove();
});

// New rows (a workflow ran again): new markers, and fit them again unless the view is fixed.
watch(
  () => JSON.stringify(markers.value.map((m) => [m.lat, m.lng, m.color, m.label])),
  () => draw(true)
);
watch(() => [props.props.center, props.props.zoom], view, { deep: true });
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div v-if="props.props.title" class="flex items-center gap-2 border-b px-(--app-pad) py-2 text-xs shrink-0">
      <MapPinned class="size-3.5 text-muted-foreground" />
      <span class="font-medium truncate">{{ props.props.title }}</span>
      <span class="ml-auto text-muted-foreground tabular-nums" data-testid="map-count">
        {{ t('apps.map.places', { count: markers.length }, markers.length) }}
      </span>
    </div>
    <div class="relative flex-1 min-h-0">
      <div ref="box" class="app-map absolute inset-0 z-0" data-testid="map" />
      <div v-if="failed" class="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
        {{ t('apps.map.failed') }}
      </div>
    </div>
  </div>
</template>

<style>
/* Leaflet's controls and popups, in the app's look. (Leaflet's own CSS loads later,
   with the map: the extra class makes these win.) */
.app-map.leaflet-container {
  font: inherit;
  font-size: 12px;
  background: var(--muted);
}
.leaflet-popup-content-wrapper,
.leaflet-popup-tip {
  background: var(--popover);
  color: var(--popover-foreground);
}
.leaflet-popup-content {
  margin: 10px 12px;
}
</style>
