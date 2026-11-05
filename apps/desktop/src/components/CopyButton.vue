<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CopyIcon, CheckIcon } from 'lucide-vue-next';

const props = defineProps<{ value: string }>();
const { t } = useI18n();
const copied = ref(false);

async function copy() {
  await navigator.clipboard.writeText(props.value);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <button
    type="button"
    class="p-1 rounded hover:bg-accent transition-colors shrink-0"
    :title="t('common.copy')"
    @click="copy"
  >
    <CheckIcon v-if="copied" class="w-3.5 h-3.5 text-green-600" />
    <CopyIcon v-else class="w-3.5 h-3.5 text-muted-foreground" />
  </button>
</template>
