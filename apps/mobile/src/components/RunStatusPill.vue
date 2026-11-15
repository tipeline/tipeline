<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IonSpinner } from '@ionic/vue';
import { statusTone } from '@/lib/runs';

const props = defineProps<{ status: string }>();
const { t, te } = useI18n();
const label = computed(() => (te(`runs.status.${props.status}`) ? t(`runs.status.${props.status}`) : props.status));
</script>

<template>
  <span class="tl-pill" :class="statusTone(status)">
    <ion-spinner v-if="status === 'running' || status === 'pending'" name="crescent" aria-hidden="true" />{{ label }}
  </span>
</template>

<style scoped>
ion-spinner {
  width: 12px;
  height: 12px;
}
</style>
