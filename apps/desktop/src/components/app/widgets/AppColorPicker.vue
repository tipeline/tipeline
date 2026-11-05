<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Pipette, X } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { cssColor, hsvToRgb, normalizeColor, parseColor, rgbToHsv, swatchList, toHex, type Hsva } from '@/utils/appColor';

// A color field (Input / form field type `color`): a swatch that opens the picker — a
// saturation × brightness square, a hue strip and, with `alpha`, an opacity strip;
// the `swatches` given; the eyedropper (any color on the screen) — and the hex text,
// which can be typed. The value follows a drag; `commit` fires once it's let go, a
// swatch is picked or the text is entered (a runnable on change runs once).
const props = defineProps<{
  id: string;
  modelValue: unknown;
  alpha?: boolean;
  swatches?: unknown;
  placeholder?: string;
  editable?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  commit: [value: string | null];
  blur: [];
}>();
const { t } = useI18n();

const value = computed(() => normalizeColor(props.modelValue, props.alpha));
const swatches = computed(() => swatchList(props.swatches, props.alpha));

// The picker's own HSV — the hue survives a gray, the saturation a black.
const hsv = ref<Hsva>({ h: 0, s: 0, v: 0, a: 1 });
watch(
  value,
  (hex) => {
    const c = parseColor(hex);
    if (!c || toHex(hsvToRgb(hsv.value), props.alpha) === hex) return;
    const next = rgbToHsv(c);
    hsv.value = { ...next, h: next.s ? next.h : hsv.value.h, s: next.v ? next.s : hsv.value.s };
  },
  { immediate: true }
);
const current = computed(() => toHex(hsvToRgb(hsv.value), props.alpha));
function set(patch: Partial<Hsva>) {
  hsv.value = { ...hsv.value, ...patch };
  if (current.value !== value.value) emit('update:modelValue', current.value);
}
const commit = () => emit('commit', value.value);

// ---- the hex text: typed freely, taken when it's a color (Enter / leaving keeps it)
const text = ref('');
let typing = false; // what's being typed isn't rewritten (#abc isn't #aabbcc yet)
watch(
  value,
  (hex) => {
    if (!typing) text.value = hex ?? (typeof props.modelValue === 'string' ? props.modelValue : '');
  },
  { immediate: true }
);
function onText(v: string | number) {
  typing = true;
  text.value = String(v);
  const hex = normalizeColor(text.value, props.alpha);
  if (hex) emit('update:modelValue', hex);
  else if (!text.value.trim()) emit('update:modelValue', null);
  // Something that isn't a color is kept as typed — the field says so once it's left.
  else emit('update:modelValue', text.value as unknown as string);
}
function onTextDone() {
  typing = false;
  emit('blur');
  // Not a color: kept as typed (the field says so) and nothing fires.
  if (!value.value && text.value.trim()) return;
  if (value.value) text.value = value.value;
  commit();
}
function clear() {
  emit('update:modelValue', null);
  emit('commit', null);
}

// ---- dragging: the square and the strips
type Area = 'sv' | 'hue' | 'alpha';
function at(area: Area, e: PointerEvent) {
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
  const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
  if (area === 'sv') set({ s: x, v: 1 - y });
  else if (area === 'hue') set({ h: x * 360 });
  else set({ a: Math.round(x * 100) / 100 });
}
function down(area: Area, e: PointerEvent) {
  if (props.editable || e.button !== 0) return;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  (e.currentTarget as HTMLElement).focus();
  at(area, e);
}
function move(area: Area, e: PointerEvent) {
  if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) at(area, e);
}
function up(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  if (!el.hasPointerCapture?.(e.pointerId)) return;
  el.releasePointerCapture(e.pointerId);
  commit();
}
// Arrows (Shift: bigger steps); the change counts once the key is let go.
function key(area: Area, e: KeyboardEvent) {
  const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
  if (!dir) return;
  e.preventDefault();
  const big = e.shiftKey ? 10 : 1;
  const { h, s, v, a } = hsv.value;
  if (area === 'sv') set({ s: Math.min(1, Math.max(0, s + (dir[0] * big) / 100)), v: Math.min(1, Math.max(0, v + (dir[1] * big) / 100)) });
  else if (area === 'hue') set({ h: Math.min(360, Math.max(0, h + (dir[0] || dir[1]) * big)) });
  else set({ a: Math.min(1, Math.max(0, Math.round((a + ((dir[0] || dir[1]) * big) / 100) * 100) / 100)) });
}

const pure = computed(() => `hsl(${hsv.value.h} 100% 50%)`);
const solid = computed(() => toHex({ ...hsvToRgb(hsv.value), a: 1 }));

function pick(hex: string) {
  emit('update:modelValue', hex);
  emit('commit', hex);
}

// The screen eyedropper (Chromium's EyeDropper).
const canSample = typeof window !== 'undefined' && 'EyeDropper' in window;
async function sample() {
  try {
    const { sRGBHex } = await new (window as any).EyeDropper().open();
    const hex = normalizeColor(sRGBHex, props.alpha);
    if (hex) pick(hex);
  } catch {
    // Escape: nothing picked.
  }
}

const open = ref(false);
watch(open, (now, before) => {
  if (before && !now) emit('blur');
});
const CHECKER = 'repeating-conic-gradient(#d4d4d8 0 25%, #fff 0 50%) 0 0 / 8px 8px';
</script>

<template>
  <div class="flex items-center gap-2" data-testid="color-field">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button
          type="button"
          :class="cn('size-9 shrink-0 rounded-md border shadow-xs overflow-hidden focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', editable && 'pointer-events-none')"
          :style="{ background: CHECKER }"
          :aria-label="t('apps.field.color.open')"
          :disabled="editable"
          data-testid="color-swatch"
        >
          <span class="block size-full" :style="{ background: cssColor(value) ?? 'transparent' }" />
        </button>
      </PopoverTrigger>
      <PopoverContent class="w-64 p-3 flex flex-col gap-3" align="start" data-testid="color-picker">
        <!-- saturation (→) × brightness (↑) at the hue -->
        <div
          role="slider"
          tabindex="0"
          :aria-label="t('apps.field.color.shade')"
          :aria-valuetext="current"
          class="relative h-36 rounded-md cursor-crosshair touch-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          :style="{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }"
          data-testid="color-area"
          @pointerdown="down('sv', $event)"
          @pointermove="move('sv', $event)"
          @pointerup="up"
          @keydown="key('sv', $event)"
          @keyup="$event.key.startsWith('Arrow') && commit()"
        >
          <span
            class="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solid }"
          />
        </div>
        <!-- hue -->
        <div
          role="slider"
          tabindex="0"
          :aria-label="t('apps.field.color.hue')"
          aria-valuemin="0"
          aria-valuemax="360"
          :aria-valuenow="Math.round(hsv.h)"
          class="relative h-3 rounded-full cursor-pointer touch-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          style="background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
          data-testid="color-hue"
          @pointerdown="down('hue', $event)"
          @pointermove="move('hue', $event)"
          @pointerup="up"
          @keydown="key('hue', $event)"
          @keyup="$event.key.startsWith('Arrow') && commit()"
        >
          <span
            class="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            :style="{ left: `${(hsv.h / 360) * 100}%`, background: pure }"
          />
        </div>
        <!-- opacity -->
        <div
          v-if="alpha"
          role="slider"
          tabindex="0"
          :aria-label="t('apps.field.color.opacity')"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(hsv.a * 100)"
          class="relative h-3 rounded-full cursor-pointer touch-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          :style="{ background: `linear-gradient(to right, transparent, ${solid}), ${CHECKER}` }"
          data-testid="color-alpha"
          @pointerdown="down('alpha', $event)"
          @pointermove="move('alpha', $event)"
          @pointerup="up"
          @keydown="key('alpha', $event)"
          @keyup="$event.key.startsWith('Arrow') && commit()"
        >
          <span
            class="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            :style="{ left: `${hsv.a * 100}%`, background: solid }"
          />
        </div>
        <div v-if="swatches.length" class="flex flex-wrap gap-1.5" data-testid="color-swatches">
          <button
            v-for="hex in swatches"
            :key="hex"
            type="button"
            :class="cn('size-6 rounded-md border overflow-hidden focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', hex === value && 'ring-2 ring-ring ring-offset-1 ring-offset-background')"
            :style="{ background: CHECKER }"
            :aria-label="hex"
            :aria-pressed="hex === value"
            :title="hex"
            @click="pick(hex)"
          >
            <span class="block size-full" :style="{ background: cssColor(hex) ?? '' }" />
          </button>
        </div>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="font-mono tabular-nums text-foreground" data-testid="color-current">{{ current }}</span>
          <span v-if="alpha" class="tabular-nums">{{ Math.round(hsv.a * 100) }}%</span>
          <button
            v-if="canSample"
            type="button"
            class="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground"
            :title="t('apps.field.color.sample')"
            :aria-label="t('apps.field.color.sample')"
            data-testid="color-sample"
            @click="sample"
          >
            <Pipette class="size-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
    <div class="relative flex-1 min-w-0">
      <Input
        :id="id"
        class="font-mono pr-8"
        spellcheck="false"
        autocomplete="off"
        :model-value="text"
        :placeholder="placeholder || (alpha ? '#rrggbbaa' : '#rrggbb')"
        :disabled="editable"
        data-testid="color-text"
        @update:model-value="onText"
        @blur="onTextDone"
        @keydown.enter.prevent="onTextDone"
      />
      <button
        v-if="value && !editable"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
        :title="t('common.clear')"
        :aria-label="t('common.clear')"
        data-testid="color-clear"
        @click="clear"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </div>
</template>
