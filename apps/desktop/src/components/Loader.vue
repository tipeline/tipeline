<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useColorMode } from '@vueuse/core';
import { animate } from 'animejs';

const props = defineProps<{
  statusKey: string;
  errorText: string;
  ready: boolean;
  // A downloaded update, which may be the only way past the error on this screen.
  updateVersion?: string | null;
}>();

const emit = defineEmits<{
  done: [];
  retry: [];
  installUpdate: [];
}>();

const { t } = useI18n();
const colorMode = useColorMode();
const container = ref<HTMLDivElement | null>(null);
const logoEl = ref<SVGSVGElement | null>(null);
const rectTop = ref<SVGRectElement | null>(null);
const rectMid = ref<SVGRectElement | null>(null);
const rectBot = ref<SVGRectElement | null>(null);
const isDone = ref(false);

// One continuous clock drives all bars: each reads the same pulse curve shifted
// by a phase offset, so the light flows through the logo as a wave instead of
// three separate tweens switching on and off.
const PERIOD = 1500; // ms for one full sweep, bottom to top
const GAP = 0.14; // phase offset between bars (fraction of PERIOD)
const WIDTH = 0.62; // how long one bar's pulse lasts; > GAP so neighbours overlap
const FLOOR = 0.14; // resting opacity, the shape never disappears
const SCALE_MIN = 0.92; // bars swell slightly from the centre as the wave passes
const SETTLE = 450; // ms to ease every bar to full when loading completes
const HOLD = 1400; // ms the logo stays on screen after loading completes (includes SETTLE)
const GLOW = 900; // ms for the glow to bloom out
const LOGO_FADE = 700; // ms for the logo to fade to invisible inside the glow
const FADE_OVERLAP = 200; // ms before the glow ends that the screen starts fading
const GLOW_RADIUS = 18; // px of the outer glow at its peak
const GLOW_SCALE = 0.05; // the logo grows 5% while it glows
const FADE_OUT = 500; // ms for the loader screen to fade away

let frameId = 0;
let startedAt = 0;
let settleFrom = 0;

// Raised cosine bump over [0, WIDTH], flat zero for the rest of the cycle.
// Zero slope at both ends, so there is no visible start or stop.
function pulse(phase: number) {
  const p = ((phase % 1) + 1) % 1;
  return p < WIDTH ? 0.5 - 0.5 * Math.cos((p / WIDTH) * Math.PI * 2) : 0;
}

function frame(now: number) {
  const bars = [rectBot.value, rectMid.value, rectTop.value];
  const t = (now - startedAt) / PERIOD;
  const settle = settleFrom ? Math.min((now - settleFrom) / SETTLE, 1) : 0;
  const settleEased = 0.5 - 0.5 * Math.cos(settle * Math.PI);

  bars.forEach((el, i) => {
    if (!el) return;
    const v = pulse(t - i * GAP);
    const lit = v + (1 - v) * settleEased;
    el.style.opacity = String(FLOOR + (1 - FLOOR) * lit);
    el.style.transform = `scaleX(${SCALE_MIN + (1 - SCALE_MIN) * lit})`;
  });

  if (settle < 1) frameId = requestAnimationFrame(frame);
}

function start() {
  cancelAnimationFrame(frameId);
  startedAt = performance.now();
  settleFrom = 0;
  frameId = requestAnimationFrame(frame);
}

function stop() {
  cancelAnimationFrame(frameId);
}

// Two stacked drop-shadows in the logo's own colour: a tight core and a wide bloom.
// Dark mode only: on a light background a dark glow reads as a smudge, so light
// mode keeps just the scale and the fade.
function applyGlow(g: number) {
  const el = logoEl.value;
  if (!el) return;
  const core = `drop-shadow(0 0 ${g * GLOW_RADIUS * 0.3}px color-mix(in srgb, currentColor ${g * 70}%, transparent))`;
  const bloom = `drop-shadow(0 0 ${g * GLOW_RADIUS}px color-mix(in srgb, currentColor ${g * 45}%, transparent))`;
  if (colorMode.value === 'dark') el.style.filter = `${core} ${bloom}`;
  el.style.transform = `scale(${1 + g * GLOW_SCALE})`;
}

// The glow blooms out-quad (fast, then easing off) while the logo fades in-cubic:
// it stays solid inside the glow, then drops away to invisible at the end.
function glowUp() {
  return new Promise<void>((resolve) => {
    const from = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - from) / GLOW, 1);
      applyGlow(1 - (1 - p) * (1 - p));
      const q = Math.min((now - from) / LOGO_FADE, 1);
      if (logoEl.value) logoEl.value.style.opacity = String(1 - q * q * q);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

onMounted(start);

onUnmounted(stop);

watch(() => props.errorText, (val) => {
  if (val) {
    stop();
    animate(logoEl.value!, { opacity: [1, 0], duration: 300, ease: 'outSine' });
  } else {
    animate(logoEl.value!, { opacity: [0, 1], duration: 300, ease: 'inSine' }).then(() => {
      start();
    });
  }
});

watch(() => props.ready, async (val) => {
  if (!val) return;
  isDone.value = true;
  settleFrom = performance.now();
  await wait(HOLD);
  stop();
  const glow = glowUp();
  await wait(GLOW - FADE_OVERLAP);
  await Promise.all([
    glow,
    animate(container.value!, { opacity: [1, 0], duration: FADE_OUT, ease: 'outSine' }),
  ]);
  emit('done');
});
</script>

<template>
  <div
    ref="container"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background"
  >
    <svg
      ref="logoEl"
      width="100"
      height="80"
      viewBox="0 0 100 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="text-foreground"
    >
      <rect
        ref="rectTop"
        width="100"
        height="22"
        rx="6"
        fill="currentColor"
        class="loader-bar"
      />
      <rect
        ref="rectMid"
        x="22"
        y="29"
        width="56"
        height="22"
        rx="6"
        fill="currentColor"
        class="loader-bar"
      />
      <rect
        ref="rectBot"
        x="31"
        y="58"
        width="38"
        height="22"
        rx="6"
        fill="currentColor"
        class="loader-bar"
      />
    </svg>

    <template v-if="errorText">
      <p class="text-sm text-foreground/70">{{ t(errorText) }}</p>
      <button
        class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        @click="emit('retry')"
      >
        {{ t('loader.retry') }}
      </button>
      <button
        v-if="updateVersion"
        class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        @click="emit('installUpdate')"
      >
        {{ t('loader.updateInstall') }}
      </button>
    </template>
    <p v-else class="text-sm font-bold text-muted-foreground tracking-wide">
      {{ isDone ? t('common.complete') : (statusKey ? t(statusKey) : '') }}
    </p>
  </div>
</template>

<style scoped>
.loader-bar {
  opacity: 0.14;
  transform-box: fill-box;
  transform-origin: center;
}
</style>
