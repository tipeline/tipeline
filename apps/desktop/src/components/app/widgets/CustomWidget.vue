<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useColorMode } from '@vueuse/core';
import { Code2 } from 'lucide-vue-next';
import { embedSandbox } from '@/utils/appEmbed';
import { appThemeColors, customDocument, customMessage } from '@/utils/appCustom';

// A component written in HTML, CSS and JavaScript (the `code` prop, kept as written).
// It gets `data` (any value, live) and talks back through the `tipeline` bridge (see
// appCustom): `tipeline.emit(name, payload)` fires `event:<name>` — when `name` is one of
// `eventNames` — with `<id>.lastEvent` = { name, payload }; `tipeline.setValue(v)` sets
// `<id>.value`. It runs sandboxed like an Embed's HTML (own origin, no app access). New
// data reaches the page without reloading it; new code (or the theme) reloads it.
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
const colorMode = useColorMode();
const mode = computed<'light' | 'dark'>(() => (colorMode.value === 'dark' ? 'dark' : 'light'));

const code = computed(() => (typeof props.props.code === 'string' ? props.props.code : ''));
// In the builder `data` is usually still a binding: the code gets null until the app runs.
const data = computed(() =>
  props.editable && typeof props.props.data === 'string' && /\{[{=%]/.test(props.props.data) ? null : props.props.data
);
const plain = (value: unknown) => {
  try {
    return JSON.parse(JSON.stringify(toRaw(value) ?? null));
  } catch {
    return null;
  }
};

// The page: rebuilt (and reloaded) only when the code changes — new data and a new
// theme are posted to it. It starts with the data and colors of that moment.
const srcdoc = ref('');
watch(
  code,
  () => {
    srcdoc.value = code.value.trim()
      ? customDocument(code.value, plain(data.value), { mode: mode.value, colors: appThemeColors() })
      : '';
  },
  { immediate: true }
);

const frame = ref<HTMLIFrameElement | null>(null);
// Posted on every change, and once the page has loaded (a change before that would be lost).
const sendData = () => frame.value?.contentWindow?.postMessage({ __tipeline: true, kind: 'data', data: plain(data.value) }, '*');
watch(data, sendData, { deep: true });
// Light / dark: the colors are read once the app has switched (its class is set after this).
watch(mode, async () => {
  await nextTick();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  frame.value?.contentWindow?.postMessage({ __tipeline: true, kind: 'theme', mode: mode.value, colors: appThemeColors() }, '*');
});

const names = computed<string[]>(() => (Array.isArray(props.props.eventNames) ? props.props.eventNames : []));
function onMessage(e: MessageEvent) {
  if (props.editable || !frame.value || e.source !== frame.value.contentWindow) return;
  const message = customMessage(e.data);
  if (!message) return;
  if (message.kind === 'value') {
    emit('state', { value: message.value });
    return;
  }
  if (!names.value.includes(message.name)) {
    console.warn(`[app] custom component "${props.componentId}" emitted "${message.name}" — add it to its eventNames to use it`);
    return;
  }
  const lastEvent = { name: message.name, payload: message.payload };
  emit('state', { lastEvent });
  emit('event', `event:${message.name}`, { lastEvent });
}
onMounted(() => window.addEventListener('message', onMessage));
onBeforeUnmount(() => window.removeEventListener('message', onMessage));
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div v-if="props.props.title" class="px-(--app-pad) pt-2.5 pb-1 text-sm font-medium truncate shrink-0">{{ props.props.title }}</div>
    <div class="relative flex-1 min-h-0">
      <div
        v-if="!srcdoc"
        class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-4 text-xs text-muted-foreground text-center"
      >
        <Code2 class="size-5" />
        {{ t('apps.custom.empty') }}
      </div>
      <iframe
        v-else
        ref="frame"
        :key="srcdoc"
        class="absolute inset-0 size-full border-0 bg-transparent"
        :class="editable && 'pointer-events-none'"
        :title="props.props.title || componentId"
        :srcdoc="srcdoc"
        :sandbox="embedSandbox('html')"
        allow=""
        referrerpolicy="no-referrer"
        data-testid="custom-frame"
        @load="sendData"
      />
    </div>
  </div>
</template>
