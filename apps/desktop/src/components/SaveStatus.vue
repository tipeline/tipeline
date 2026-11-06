<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Check, Loader2, AlertCircle } from 'lucide-vue-next';
import type { SaveState } from '@/composables/useAutoSave';

// Small "Saving… / Saved / Couldn't save" note next to a setting that saves on its own.
const props = defineProps<{ state: SaveState; message?: string; detail?: string }>();
const { t } = useI18n();
</script>

<template>
  <span class="inline-flex items-center gap-1 text-xs min-h-4" aria-live="polite">
    <template v-if="props.state === 'saving'">
      <Loader2 class="size-3 animate-spin text-muted-foreground" />
      <span class="text-muted-foreground">{{ t('common.saving') }}</span>
    </template>
    <template v-else-if="props.state === 'saved'">
      <Check class="size-3 text-emerald-600 dark:text-emerald-500" />
      <span class="text-emerald-600 dark:text-emerald-500">{{ t('common.saved') }}</span>
    </template>
    <template v-else-if="props.state === 'error'">
      <AlertCircle class="size-3 text-destructive shrink-0" />
      <span class="text-destructive" :title="props.detail">
        {{ props.message || t('settings.autoSave.failed') }}
      </span>
    </template>
  </span>
</template>
