<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ImageIcon, ImageOff } from 'lucide-vue-next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAppImage } from '@/composables/useAppImage';
import { APP_RUNTIME } from '../appRuntimeKey';
import AppSkeleton from './AppSkeleton.vue';

// Shows an image: a web URL, a data URL, bare base64, or a file a workflow saved under
// ~/Tipeline (see appImage). A workflow often rewrites the same file (screenshot.png)
// on every run, so the image reloads whenever a run it depends on finishes.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ event: [name: string, payload?: Record<string, unknown>] }>();
const { t } = useI18n();

// In the builder `src` is usually still a binding: show what it's bound to instead.
const isBinding = computed(() => typeof props.props.src === 'string' && /\{[{=%]/.test(props.props.src));

// Bumped when a run this image depends on ends: same path, new file.
const version = ref(0);
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now) version.value++;
  }
);
const runtime = inject(APP_RUNTIME, null);
const { source, viaMain, url, fileError } = useAppImage(() => props.props.src, {
  version,
  editable: () => props.editable,
  appIdentifier: () => runtime?.appIdentifier(),
});

const failed = ref(false);
watch(url, () => (failed.value = false));

const fit = computed(() => (['contain', 'cover', 'fill', 'none'].includes(props.props.fit) ? props.props.fit : 'contain'));
const zoomed = ref(false);

function onClick() {
  if (props.editable || !url.value || failed.value) return;
  emit('event', 'click');
  if (props.props.zoomable) zoomed.value = true;
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
      <!-- Builder, still a binding -->
      <div v-if="editable && isBinding" class="flex flex-col items-center gap-1.5 text-muted-foreground p-(--app-pad) min-w-0">
        <ImageIcon class="size-6" />
        <span class="text-xs font-mono truncate max-w-full" :title="props.props.src">{{ props.props.src }}</span>
      </div>

      <AppSkeleton v-else-if="source.kind === 'none' && busy" variant="block" />
      <div
        v-else-if="source.kind === 'none'"
        class="flex flex-col items-center gap-1.5 text-muted-foreground text-xs p-(--app-pad)"
      >
        <ImageIcon class="size-6" />
        {{ t('apps.image.empty') }}
      </div>

      <div
        v-else-if="source.kind === 'invalid' || failed || fileError"
        class="flex flex-col items-center gap-1.5 text-muted-foreground text-xs text-center p-(--app-pad)"
        data-testid="image-error"
      >
        <ImageOff class="size-6" />
        <span>{{
          source.kind === 'invalid'
            ? t('apps.image.invalid')
            : fileError === 'outsideTipeline'
              ? t('apps.files.outside')
              : t('apps.image.notFound')
        }}</span>
        <span v-if="fileError === 'outsideTipeline'" class="text-[11px]">{{ t('apps.files.outsideHint') }}</span>
        <span v-else-if="source.kind === 'file' && failed" class="text-[11px]">{{ t('apps.image.insideTipeline') }}</span>
      </div>

      <!-- A file still being read -->
      <div v-else-if="viaMain && !url" class="text-muted-foreground"><ImageIcon class="size-6 animate-pulse" /></div>

      <img
        v-else
        :src="url!"
        :alt="props.props.alt ?? ''"
        class="h-full w-full"
        :class="{ 'cursor-zoom-in': props.props.zoomable && !editable, 'cursor-pointer': !props.props.zoomable && !editable }"
        :style="{ objectFit: fit }"
        draggable="false"
        @error="failed = true"
        @click="onClick"
      />
    </div>
    <p v-if="props.props.caption" class="m-0 shrink-0 px-(--app-pad-tight) py-1.5 text-xs text-muted-foreground text-center truncate border-t">
      {{ props.props.caption }}
    </p>

    <Dialog v-if="props.props.zoomable" v-model:open="zoomed">
      <DialogContent class="w-auto max-w-[calc(100vw-4rem)] sm:max-w-[calc(100vw-4rem)] p-3">
        <DialogTitle class="sr-only">{{ props.props.alt || props.props.caption || t('apps.image.title') }}</DialogTitle>
        <DialogDescription v-if="props.props.caption" class="text-xs text-center">{{ props.props.caption }}</DialogDescription>
        <!-- As big as the window allows, keeping its shape — small images (a QR code) grow too. -->
        <img
          :src="url!"
          :alt="props.props.alt ?? ''"
          class="h-[calc(100vh-9rem)] w-[calc(100vw-6rem)] max-w-full object-contain mx-auto"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>
