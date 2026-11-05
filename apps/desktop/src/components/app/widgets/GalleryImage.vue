<script setup lang="ts">
import { inject, toRef } from 'vue';
import { ImageIcon, ImageOff } from 'lucide-vue-next';
import { useAppImage } from '@/composables/useAppImage';
import { APP_RUNTIME } from '../appRuntimeKey';

// One picture of a Gallery: loaded like an Image component's (useAppImage), so files,
// web links, data URLs and base64 all work — and a file read again with `version`.
const props = defineProps<{ src: unknown; alt?: string; fit?: string; version: number; editable?: boolean }>();
const runtime = inject(APP_RUNTIME, null);
const { source, viaMain, url, fileError } = useAppImage(() => props.src, {
  version: toRef(props, 'version'),
  editable: () => props.editable,
  appIdentifier: () => runtime?.appIdentifier(),
});
</script>

<template>
  <div
    v-if="source.kind === 'none' || source.kind === 'invalid' || fileError"
    class="size-full flex items-center justify-center bg-muted text-muted-foreground"
    :title="fileError ?? undefined"
    data-testid="gallery-missing"
  >
    <ImageOff class="size-5" />
  </div>
  <div v-else-if="viaMain && !url" class="size-full flex items-center justify-center bg-muted text-muted-foreground">
    <ImageIcon class="size-5 animate-pulse" />
  </div>
  <img v-else :src="url!" :alt="alt ?? ''" class="size-full" :style="{ objectFit: (fit as any) || 'cover' }" draggable="false" />
</template>
