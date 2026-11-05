<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Textarea } from '@/components/ui/textarea';
import { renderMarkdown } from '@/utils/appMarkdown';

// Textarea for Markdown descriptions (workflows, apps, projects) with a Write / Preview
// switch. Other attributes (placeholder, rows, class, vee-validate's name/onBlur, the
// FormControl id/aria) go to the textarea.
defineOptions({ inheritAttrs: false });

const props = defineProps<{ modelValue?: string | number }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string | number): void }>();

const { t } = useI18n();
const previewing = ref(false);
const html = computed(() => renderMarkdown(String(props.modelValue ?? '')));
</script>

<template>
  <div class="space-y-1.5">
    <Textarea
      v-if="!previewing"
      v-bind="$attrs"
      :model-value="props.modelValue"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
    <div
      v-else-if="String(props.modelValue ?? '').trim()"
      class="app-markdown text-sm min-h-16 max-h-60 overflow-y-auto rounded-md border px-3 py-2"
      v-html="html"
    />
    <div v-else class="text-sm text-muted-foreground min-h-16 rounded-md border px-3 py-2">
      {{ t('markdownField.nothingToPreview') }}
    </div>
    <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span class="truncate">{{ t('markdownField.markdownHint') }}</span>
      <button type="button" class="shrink-0 hover:text-foreground hover:underline" @click="previewing = !previewing">
        {{ previewing ? t('markdownField.write') : t('markdownField.preview') }}
      </button>
    </div>
  </div>
</template>
