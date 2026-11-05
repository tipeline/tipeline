<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AgentRunRecord } from '@/store/agentStore';

const props = defineProps<{ open: boolean; run: AgentRunRecord | null }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
const router = useRouter();

const STATUS_CLASS: Record<string, string> = {
  running: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  proposed: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  done: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  error: 'bg-red-500/10 text-red-500 border border-red-500/20',
};

const statusLabel = computed(() => {
  if (!props.run) return '';
  return t(`agent.history.${props.run.status}`);
});

const resultText = computed(() => {
  if (!props.run) return null;
  return props.run.status === 'error' ? props.run.error : props.run.answer;
});

function goToRun() {
  if (!props.run?.task_identifier) return;
  router.push(
    props.run.pipeline_identifier
      ? `/tasks/${props.run.task_identifier}/pipelines/${props.run.pipeline_identifier}`
      : `/tasks/${props.run.task_identifier}`
  );
  emit('update:open', false);
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('agent.history.detailTitle') }}</DialogTitle>
      </DialogHeader>

      <div v-if="run" class="space-y-4 text-sm">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
            :class="STATUS_CLASS[run.status] ?? 'bg-gray-400/10 text-gray-500 border border-gray-400/20'"
          >
            {{ statusLabel }}
          </span>
          <span v-if="run.task_identifier" class="text-muted-foreground text-xs">
            {{ run.task_name ?? run.task_identifier }}
          </span>
        </div>

        <div>
          <div class="text-xs font-medium text-muted-foreground mb-1">{{ t('agent.history.prompt') }}</div>
          <p class="whitespace-pre-wrap">{{ run.prompt }}</p>
        </div>

        <div v-if="resultText">
          <div class="text-xs font-medium text-muted-foreground mb-1">{{ t('agent.history.result') }}</div>
          <p class="whitespace-pre-wrap text-muted-foreground">{{ resultText }}</p>
        </div>

        <button v-if="run.task_identifier" class="text-xs text-primary hover:underline" @click="goToRun">
          {{ run.pipeline_identifier ? t('agent.viewLiveRun') : t('agent.viewTaskHistory') }}
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>
