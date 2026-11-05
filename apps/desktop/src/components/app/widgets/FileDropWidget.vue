<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { File as FileIcon, FileText, Image as ImageIcon, Upload, X } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import { addFiles, filesValue, formatBytes, type DroppedFile } from '@/utils/appFiles';

// Files dropped or picked by the user, handed to workflows as paths on disk — the
// value is `<id>.value` (a list of paths, or one path without `multiple`); `<id>.files`
// holds { name, path, size, type } each. `accept`, `maxSizeMb` and `maxFiles` turn
// files down (listed under the zone, with why). Images show a thumbnail.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t } = useI18n();

const multiple = computed(() => props.props.multiple !== false);
const files = computed<DroppedFile[]>(() => (Array.isArray(props.state?.files) ? props.state!.files : []));
const rejected = ref<Array<{ name: string; reason: string }>>([]);
// A reset gives the component a fresh state object: the old complaints go with it.
watch(
  () => props.state,
  (next, previous) => {
    if (next !== previous) rejected.value = [];
  }
);
const dragging = ref(false);
const input = ref<HTMLInputElement | null>(null);

// Thumbnails of images dropped / picked in this session (by path).
const thumbs = ref(new Map<string, string>());
onBeforeUnmount(() => thumbs.value.forEach((url) => URL.revokeObjectURL(url)));

// In the app, a file without a path (e.g. dragged out of a web page) is turned down.
// Outside Electron (tests, a browser) there are no paths: the name stands in.
const pathOf = (file: File) => (window.tipelineFiles ? window.tipelineFiles.pathFor(file) : file.name);

function take(list: FileList | File[] | null | undefined) {
  if (props.editable || !list?.length) return;
  const incoming = Array.from(list).map((file) => ({
    file,
    info: { name: file.name, path: pathOf(file), size: file.size, type: file.type } as DroppedFile,
  }));
  const result = addFiles(
    files.value,
    incoming.map((i) => i.info),
    {
      accept: props.props.accept,
      maxSizeMb: props.props.maxSizeMb,
      maxFiles: props.props.maxFiles,
      multiple: multiple.value,
    }
  );
  rejected.value = result.rejected;
  for (const { file, info } of incoming)
    if (file.type.startsWith('image/') && result.files.some((f) => f.path === info.path) && !thumbs.value.has(info.path))
      thumbs.value.set(info.path, URL.createObjectURL(file));
  publish(result.files);
}

function publish(next: DroppedFile[]) {
  const value = filesValue(next, multiple.value);
  emit('state', { files: next, value, error: null });
  emit('event', 'change', { value, files: next });
}

function remove(file: DroppedFile) {
  rejected.value = [];
  publish(files.value.filter((f) => f.path !== file.path));
}

function clear() {
  rejected.value = [];
  publish([]);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  take(e.dataTransfer?.files);
}

function browse() {
  if (!props.editable) input.value?.click();
}

function onPicked(e: Event) {
  const el = e.target as HTMLInputElement;
  take(el.files);
  el.value = ''; // picking the same file again still fires `change`
}

const hint = computed(() => {
  const parts: string[] = [];
  if (props.props.accept) parts.push(String(Array.isArray(props.props.accept) ? props.props.accept.join(', ') : props.props.accept));
  if (Number(props.props.maxSizeMb) > 0) parts.push(t('apps.files.upTo', { size: `${props.props.maxSizeMb} MB` }));
  if (multiple.value && Number(props.props.maxFiles) > 0) parts.push(t('apps.files.maxFiles', { count: Number(props.props.maxFiles) }, Number(props.props.maxFiles)));
  return parts.join(' · ');
});
// How many files it keeps (for the "only N" message).
const limit = computed(() => (multiple.value ? Number(props.props.maxFiles) || 1 : 1));
const iconFor = (f: DroppedFile) =>
  f.type.startsWith('image/') ? ImageIcon : /^text\/|pdf|json|xml|csv/.test(f.type) || /\.(txt|md|pdf|csv|json|ya?ml)$/i.test(f.name) ? FileText : FileIcon;
</script>

<template>
  <div class="h-full overflow-auto p-(--app-pad) flex flex-col gap-1.5">
    <span v-if="props.props.label" class="text-sm font-medium leading-none"
      >{{ props.props.label }}<span v-if="props.props.required" class="text-destructive"> *</span></span
    >

    <button
      type="button"
      :id="`app-${componentId}`"
      :disabled="editable"
      :class="
        cn(
          'flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors min-h-24 shrink-0',
          dragging ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/40',
          state?.error && 'border-destructive',
          editable && 'cursor-default opacity-70'
        )
      "
      data-testid="dropzone"
      @click="browse"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <Upload class="size-5 text-muted-foreground" />
      <span class="text-sm">
        {{ props.props.placeholder || (multiple ? t('apps.files.dropMany') : t('apps.files.dropOne')) }}
      </span>
      <span v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</span>
    </button>
    <input
      ref="input"
      type="file"
      class="hidden"
      :multiple="multiple"
      :accept="Array.isArray(props.props.accept) ? props.props.accept.join(',') : props.props.accept"
      @change="onPicked"
    />

    <ul v-if="files.length" class="m-0 p-0 list-none flex flex-col gap-1">
      <li
        v-for="file in files"
        :key="file.path"
        class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm min-w-0"
        :title="file.path"
      >
        <img
          v-if="thumbs.get(file.path)"
          :src="thumbs.get(file.path)"
          alt=""
          class="size-8 rounded object-cover shrink-0"
        />
        <component :is="iconFor(file)" v-else class="size-4 shrink-0 text-muted-foreground" />
        <span class="truncate flex-1">{{ file.name }}</span>
        <span class="text-xs text-muted-foreground tabular-nums shrink-0">{{ formatBytes(file.size) }}</span>
        <button
          v-if="!editable"
          type="button"
          class="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground"
          :title="t('apps.files.remove')"
          :aria-label="t('apps.files.remove')"
          @click="remove(file)"
        >
          <X class="size-3.5" />
        </button>
      </li>
      <li v-if="files.length > 1" class="flex justify-end">
        <button type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="clear">
          {{ t('apps.files.clear') }}
        </button>
      </li>
    </ul>

    <ul v-if="rejected.length" class="m-0 p-0 list-none text-xs text-destructive" data-testid="rejected">
      <li v-for="(r, i) in rejected" :key="i">
        {{ t(`apps.files.rejected.${r.reason}`, { name: r.name, size: `${props.props.maxSizeMb} MB`, count: limit }, limit) }}
      </li>
    </ul>

    <p v-if="state?.error" class="text-xs text-destructive m-0">{{ t(`apps.field.errors.${state.error}`) }}</p>
    <p v-else-if="props.props.description" class="text-xs text-muted-foreground m-0">
      {{ props.props.description }}
    </p>
  </div>
</template>
