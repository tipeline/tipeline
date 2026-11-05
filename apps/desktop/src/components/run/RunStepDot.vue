<script setup lang="ts">
import { computed } from 'vue';
import { Check, Loader2, Minus, Pause, X, Zap } from 'lucide-vue-next';
import { stepStatus } from '@/utils/runSteps';

const props = defineProps<{ action: any; small?: boolean }>();
const status = computed(() => stepStatus(props.action));
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-full"
    :class="[
      small ? 'size-4' : 'size-5',
      {
        'bg-emerald-500 text-white': status === 'completed',
        'bg-violet-500 text-white': status === 'cached',
        'bg-destructive text-white': status === 'failed',
        'bg-primary text-primary-foreground': status === 'running',
        'border-[1.5px] border-dashed border-muted-foreground/50': status === 'pending',
        'bg-muted text-muted-foreground': status === 'skipped',
      },
    ]"
    :title="action.held ? 'paused' : status"
    :data-status="status"
  >
    <Check v-if="status === 'completed'" :class="small ? 'size-2.5' : 'size-3'" :stroke-width="3" />
    <Zap v-else-if="status === 'cached'" :class="small ? 'size-2.5' : 'size-3'" :stroke-width="2.5" />
    <X v-else-if="status === 'failed'" :class="small ? 'size-2.5' : 'size-3'" :stroke-width="3" />
    <Minus v-else-if="status === 'skipped'" :class="small ? 'size-2.5' : 'size-3'" :stroke-width="3" />
    <Pause v-else-if="status === 'running' && action.held" :class="small ? 'size-2.5' : 'size-3'" :stroke-width="3" />
    <Loader2 v-else-if="status === 'running'" class="animate-spin" :class="small ? 'size-2.5' : 'size-3'" />
  </span>
</template>
