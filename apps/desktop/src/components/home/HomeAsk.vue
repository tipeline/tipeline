<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SparklesIcon } from 'lucide-vue-next';
import { useAgentStore } from '@/store/agentStore';

// Home's one-line box for the Assistant: Enter hands the request to the Assistant sidebar,
// where the conversation carries on. (Searching stays on ⌘J in the top bar.)
const { t } = useI18n();
const agentStore = useAgentStore();
const request = ref('');

async function ask() {
  const text = request.value.trim();
  if (!text || agentStore.busyThinking) return;
  if (await agentStore.ask(text)) request.value = '';
}
</script>

<template>
  <form
    class="flex items-center gap-2 h-10 xl:h-auto xl:min-h-10 pl-3 pr-2 rounded-lg border border-border bg-card shadow-xs focus-within:ring-[3px] focus-within:ring-ring/30"
    @submit.prevent="ask"
  >
    <SparklesIcon class="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
    <label for="home-ask" class="sr-only">{{ t('dashboard.ask.label') }}</label>
    <input
      id="home-ask"
      v-model="request"
      type="text"
      autocomplete="off"
      class="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      :placeholder="t('dashboard.ask.placeholder')"
    />
    <button
      type="submit"
      class="h-8 px-3 rounded text-xs font-medium bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
      :disabled="!request.trim() || agentStore.busyThinking"
    >
      {{ t('dashboard.ask.send') }}
    </button>
  </form>
</template>
