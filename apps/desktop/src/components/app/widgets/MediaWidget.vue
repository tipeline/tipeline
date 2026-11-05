<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Film, Music, RotateCw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { mediaFileUrl, mediaKind, mediaSource } from '@/utils/appMedia';
import { APP_RUNTIME } from '../appRuntimeKey';
import AppSkeleton from './AppSkeleton.vue';

// Plays a video or an audio file: a web link, a data URL a workflow made, or a file a
// workflow wrote (streamed by the main process — see electron appMedia; same rules as
// an Image's file). Video or audio follows the file's type unless `kind` says. A file
// is played again from the start when a run it depends on ends (a workflow often
// rewrites the same recording). State: playing, currentTime, duration, ended; events:
// play, pause, ended.
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

const source = computed(() => mediaSource(props.props.src));
const kind = computed(() => mediaKind(source.value, props.props.kind));
const isBinding = computed(() => typeof props.props.src === 'string' && /\{[{=%]/.test(props.props.src));

// Bumped when a run this player depends on ends: same path, maybe a new file.
const version = ref(0);
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now && source.value.kind === 'file') {
      retried = false;
      version.value++;
    }
  }
);

// A file is checked first (so the component can say why it won't play), then streamed.
const fileError = ref<string | null>(null);
const fileOk = ref(false);
watch(
  [() => (source.value.kind === 'file' ? source.value.path : ''), () => props.editable],
  async ([path]) => {
    fileError.value = null;
    fileOk.value = false;
    if (!path || props.editable) return;
    if (!window.ipcRenderer) {
      fileError.value = 'desktopOnly';
      return;
    }
    const result = await window.ipcRenderer.invoke('app:media-check', { path, appIdentifier: runtime?.appIdentifier() });
    if (result?.ok) fileOk.value = true;
    else fileError.value = result?.error ?? 'notFound';
  },
  { immediate: true }
);

const url = computed(() => {
  const s = source.value;
  if (s.kind === 'url' || s.kind === 'data') return s.url;
  if (s.kind === 'file' && fileOk.value) return mediaFileUrl(s.path, runtime?.appIdentifier() ?? '', version.value);
  return null;
});

// Why the player failed, by its error code: 2 network (couldn't be loaded), 3 decode
// (damaged — or read while a workflow was still writing it), 4 format not supported.
const failed = ref<number | null>(null);
watch(url, () => (failed.value = null));
const FAILURES: Record<number, string> = { 2: 'loadFailed', 3: 'decodeFailed', 4: 'unsupported' };
// A file may be read just while a workflow rewrites it: then it's tried once more.
let retried = false;
function onError(e: Event) {
  const el = e.target as HTMLMediaElement;
  if (el !== player.value) return; // a player already replaced by the next file
  const code = el.error?.code ?? 0;
  console.warn('[app media] could not play', el.currentSrc, code, el.error?.message ?? '');
  if (source.value.kind === 'file' && !retried) {
    retried = true;
    setTimeout(() => version.value++, 500);
    return;
  }
  failed.value = code;
}
function retry() {
  retried = false;
  failed.value = null;
  version.value++;
}
const error = computed(() => {
  if (source.value.kind === 'invalid') return t('apps.media.errors.badSource');
  if (fileError.value) return t(`apps.media.errors.${fileError.value}`, t('apps.media.errors.notFound'));
  if (failed.value !== null) return t(`apps.media.errors.${FAILURES[failed.value] ?? 'playFailed'}`);
  return null;
});

// ---- what the app can read: playing, currentTime (every second or so), duration, ended
const player = ref<HTMLMediaElement | null>(null);
let lastSent = -1;
function report(patch: Record<string, unknown>) {
  if (!props.editable) emit('state', patch);
}
function onTime() {
  const time = player.value?.currentTime ?? 0;
  if (Math.abs(time - lastSent) < 1) return;
  lastSent = time;
  report({ currentTime: Math.round(time * 10) / 10 });
}
function onLoaded() {
  const el = player.value;
  if (!el) return;
  retried = false;
  const start = Number(props.props.startAt);
  if (Number.isFinite(start) && start > 0 && start < el.duration) el.currentTime = start;
  // A new file (or the same one rewritten) starts over: no time left over from the last one.
  lastSent = el.currentTime;
  report({
    duration: Number.isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : null,
    currentTime: Math.round(el.currentTime * 10) / 10,
    playing: false,
    ended: false,
  });
}
function onPlay() {
  report({ playing: true, ended: false });
  if (!props.editable) emit('event', 'play');
}
function onPause() {
  report({ playing: false, currentTime: Math.round((player.value?.currentTime ?? 0) * 10) / 10 });
  if (!props.editable && !player.value?.ended) emit('event', 'pause');
}
function onEnded() {
  report({ playing: false, ended: true });
  if (!props.editable) emit('event', 'ended');
}

const attrs = computed(() => ({
  src: url.value ?? undefined,
  controls: !props.props.hideControls,
  autoplay: !props.editable && !!props.props.autoplay,
  loop: !!props.props.loop,
  muted: !!props.props.muted,
  preload: 'metadata',
}));
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div v-if="props.props.title" class="flex items-center gap-2 px-(--app-pad) pt-2.5 pb-1.5 text-sm shrink-0">
      <component :is="kind === 'audio' ? Music : Film" class="size-3.5 text-muted-foreground shrink-0" />
      <span class="font-medium truncate">{{ props.props.title }}</span>
    </div>
    <div
      class="relative flex-1 min-h-0 flex items-center justify-center"
      :class="kind === 'video' ? 'bg-black/90' : 'px-(--app-pad) pb-2'"
    >
      <p v-if="editable && isBinding" class="m-0 p-4 text-xs text-center" :class="kind === 'video' ? 'text-white/70' : 'text-muted-foreground'">
        {{ t('apps.media.bound', { value: props.props.src }) }}
      </p>
      <div v-else-if="error" class="m-2 p-3 flex flex-col items-center gap-2 bg-background rounded text-center">
        <p class="m-0 text-xs text-destructive" data-testid="media-error">{{ error }}</p>
        <Button v-if="failed !== null" variant="outline" size="sm" class="h-7" data-testid="media-retry" @click="retry">
          <RotateCw class="size-3.5" /> {{ t('apps.media.retry') }}
        </Button>
      </div>
      <AppSkeleton v-else-if="source.kind === 'none' && busy" variant="block" />
      <p v-else-if="source.kind === 'none'" class="m-0 p-4 text-xs text-center" :class="kind === 'video' ? 'text-white/70' : 'text-muted-foreground'">
        {{ props.props.emptyText || t('apps.media.empty') }}
      </p>
      <video
        v-else-if="kind === 'video' && url"
        ref="player"
        :key="url"
        v-bind="attrs"
        :poster="typeof props.props.poster === 'string' && /^(https?:|data:image\/)/i.test(props.props.poster) ? props.props.poster : undefined"
        playsinline
        class="max-h-full max-w-full size-full object-contain"
        :class="editable && 'pointer-events-none'"
        data-testid="media-video"
        @loadedmetadata="onLoaded"
        @timeupdate="onTime"
        @play="onPlay"
        @pause="onPause"
        @ended="onEnded"
        @error="onError"
      />
      <audio
        v-else-if="kind === 'audio' && url"
        ref="player"
        :key="url"
        v-bind="attrs"
        class="w-full"
        :class="editable && 'pointer-events-none'"
        data-testid="media-audio"
        @loadedmetadata="onLoaded"
        @timeupdate="onTime"
        @play="onPlay"
        @pause="onPause"
        @ended="onEnded"
        @error="onError"
      />
    </div>
  </div>
</template>
