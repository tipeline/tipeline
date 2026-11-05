<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AppWindow, ExternalLink, RotateCw } from 'lucide-vue-next';
import { toast } from '@/components/ui/sonner';
import { embedMessage, embedSandbox, embedSource } from '@/utils/appEmbed';
import { openAppUrl } from '@/utils/appOpen';
import { APP_RUNTIME } from '../appRuntimeKey';

// A web page, an HTML file a workflow wrote, or HTML text, in a sandboxed frame (see
// appEmbed for the fences). The page can talk back: `parent.postMessage(data, '*')`
// fires `message` with the data as `<id>.message`. An HTML file is read again when a
// run ends (a workflow often rewrites the same report). In the builder the frame is
// shown but takes no clicks, so the component can still be picked and moved.
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

const source = computed(() => embedSource(props.props.src, props.props.html, window.location.origin));
// In the builder src / html are usually still bindings: say so instead of showing them.
const isBinding = (v: unknown) => typeof v === 'string' && /\{[{=%]/.test(v);
const bound = computed(() => props.editable && (isBinding(props.props.html) || (!props.props.html && isBinding(props.props.src))));
const sandbox = computed(() => embedSandbox(source.value.kind, !props.props.blockScripts));

// ---- an HTML file: its text, read by the main process
const fileHtml = ref<string | null>(null);
const fileError = ref<string | null>(null);
const reloads = ref(0);
async function readFile() {
  fileHtml.value = null;
  fileError.value = null;
  if (source.value.kind !== 'file' || bound.value) return;
  if (!window.ipcRenderer) {
    fileError.value = 'desktopOnly';
    return;
  }
  const result = await window.ipcRenderer.invoke('app:read-file', {
    path: source.value.path,
    appIdentifier: runtime?.appIdentifier(),
  });
  if (result?.ok) fileHtml.value = new TextDecoder().decode(result.bytes);
  else fileError.value = result?.error ?? 'notFound';
}
watch([() => (source.value.kind === 'file' ? source.value.path : ''), reloads], readFile, { immediate: true });
// A run this embed depends on ended: same path, maybe a new file.
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now && source.value.kind === 'file') reloads.value++;
  }
);

const srcdoc = computed(() =>
  source.value.kind === 'html' ? source.value.html : source.value.kind === 'file' ? fileHtml.value : null
);
const error = computed(() => {
  if (source.value.kind === 'invalid') return t(`apps.embed.errors.${source.value.reason}`);
  if (fileError.value) return t(`apps.embed.errors.${fileError.value}`, t('apps.embed.errors.notFound'));
  return null;
});
const host = computed(() => {
  const s = source.value;
  if (s.kind === 'url') return new URL(s.url).host;
  if (s.kind === 'file') return s.path.split(/[\\/]/).pop();
  return s.kind === 'html' ? 'HTML' : '';
});

// Reload: a fresh frame (and a file read again).
const frameKey = ref(0);
function reload() {
  frameKey.value++;
  if (source.value.kind === 'file') reloads.value++;
}
async function openInBrowser() {
  if (source.value.kind !== 'url') return;
  const result = await openAppUrl(source.value.url);
  if (!result.ok) toast.error(t(`apps.open.errors.${result.error}`, { target: source.value.url }));
}

// ---- messages from the page (only from this frame)
const frame = ref<HTMLIFrameElement | null>(null);
function onMessage(e: MessageEvent) {
  if (props.editable || !frame.value || e.source !== frame.value.contentWindow) return;
  const message = embedMessage(e.data);
  if (message === undefined) return;
  emit('state', { message });
  emit('event', 'message', { message });
}
onMounted(() => window.addEventListener('message', onMessage));
onBeforeUnmount(() => window.removeEventListener('message', onMessage));
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div
      v-if="!props.props.hideToolbar"
      class="flex items-center gap-2 border-b px-(--app-pad-tight) py-1.5 text-xs shrink-0"
    >
      <AppWindow class="size-3.5 text-muted-foreground shrink-0" />
      <span class="font-medium truncate">{{ props.props.title || host || t('apps.embed.title') }}</span>
      <span v-if="props.props.title && host" class="text-muted-foreground truncate" data-testid="embed-host">{{ host }}</span>
      <span class="ml-auto" />
      <button
        type="button"
        class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40"
        :title="t('apps.embed.reload')"
        :aria-label="t('apps.embed.reload')"
        :disabled="editable || source.kind === 'none'"
        data-testid="embed-reload"
        @click="reload"
      >
        <RotateCw class="size-3.5" />
      </button>
      <button
        v-if="source.kind === 'url'"
        type="button"
        class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40"
        :title="t('apps.embed.openInBrowser')"
        :aria-label="t('apps.embed.openInBrowser')"
        :disabled="editable"
        data-testid="embed-open"
        @click="openInBrowser"
      >
        <ExternalLink class="size-3.5" />
      </button>
    </div>
    <div class="relative flex-1 min-h-0 bg-white">
      <div
        v-if="bound"
        class="absolute inset-0 flex items-center justify-center p-4 text-xs text-muted-foreground bg-muted/30 text-center"
      >
        {{ t('apps.embed.bound', { value: props.props.html || props.props.src }) }}
      </div>
      <div
        v-else-if="error"
        class="absolute inset-0 flex items-center justify-center p-4 text-xs text-destructive bg-background text-center"
        data-testid="embed-error"
      >
        {{ error }}
      </div>
      <div
        v-else-if="source.kind === 'none'"
        class="absolute inset-0 flex items-center justify-center p-4 text-xs text-muted-foreground bg-background"
      >
        {{ props.props.emptyText || t('apps.embed.empty') }}
      </div>
      <iframe
        v-else-if="source.kind === 'url' || srcdoc !== null"
        ref="frame"
        :key="`${frameKey}`"
        class="absolute inset-0 size-full border-0"
        :class="editable && 'pointer-events-none'"
        :title="props.props.title || host || t('apps.embed.title')"
        :src="source.kind === 'url' ? source.url : undefined"
        :srcdoc="srcdoc ?? undefined"
        :sandbox="sandbox"
        allow=""
        referrerpolicy="no-referrer"
        data-testid="embed-frame"
      />
    </div>
  </div>
</template>
