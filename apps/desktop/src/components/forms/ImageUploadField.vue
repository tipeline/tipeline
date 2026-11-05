<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-vue-next';
import { invokeCore } from '@/utils/invoke';
import { toAssetUrl } from '@/utils/assetUrl';
import { SEND } from '@/ipc-channels';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';

const props = defineProps<{
  kind: 'app' | 'task';
  identifier: string;
  modelValue?: string | null;
  placeholderIcon?: any;
}>();

const emit = defineEmits<{
  'update:modelValue': [string | null];
}>();

const { t } = useI18n();
const { translateError } = useErrorT();

const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const previewUrl = computed(() => toAssetUrl(props.modelValue));

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  uploading.value = true;
  try {
    const dataUrl = await readAsDataUrl(file);
    const channel = props.kind === 'app' ? SEND.APP_UPLOAD_IMAGE : SEND.TASK_UPLOAD_IMAGE;
    const result = await invokeCore<{ image: string }>(channel, {
      identifier: props.identifier,
      dataUrl,
    });
    emit('update:modelValue', result.image);
  } catch (e: any) {
    toast.error(t('common.uploadFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

function pickFile() {
  fileInput.value?.click();
}
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="size-16 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
      <Loader2 v-if="uploading" class="size-5 animate-spin text-muted-foreground" />
      <img v-else-if="previewUrl" :src="previewUrl" class="w-full h-full object-cover" />
      <component :is="placeholderIcon" v-else-if="placeholderIcon" class="size-6 text-muted-foreground/40" />
    </div>
    <div class="flex flex-col gap-1">
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="hidden"
        :disabled="uploading"
        @change="onFileChange"
      />
      <Button type="button" variant="outline" size="sm" :disabled="uploading" @click="pickFile">
        <Upload class="size-3.5" />
        {{ t('common.uploadImage') }}
      </Button>
      <p class="text-xs text-muted-foreground">{{ t(`${kind}s.form.imageHint`) }}</p>
    </div>
  </div>
</template>
