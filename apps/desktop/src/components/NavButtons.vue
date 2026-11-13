<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { backLabel, canGoBack, canGoForward, forwardLabel } from '@/router/navHistory';

const router = useRouter();
const { t } = useI18n();

const backTitle = computed(() => {
  const page = backLabel();
  return `${page ? t('nav.backTo', { page }) : t('nav.back')} (⌘[)`;
});
const forwardTitle = computed(() => {
  const page = forwardLabel();
  return `${page ? t('nav.forwardTo', { page }) : t('nav.forward')} (⌘])`;
});
</script>

<template>
  <div class="flex items-center">
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      :disabled="!canGoBack()"
      :title="backTitle"
      :aria-label="t('nav.back')"
      @click="router.back()"
    >
      <ChevronLeft class="w-4 h-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      :disabled="!canGoForward()"
      :title="forwardTitle"
      :aria-label="t('nav.forward')"
      @click="router.forward()"
    >
      <ChevronRight class="w-4 h-4" />
    </Button>
  </div>
</template>
