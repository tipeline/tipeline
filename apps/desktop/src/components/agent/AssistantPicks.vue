<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { BrainIcon, Loader2Icon } from 'lucide-vue-next';
import { CHOICE_MEMORY_SETTING, parseChoiceMemory, type ChoiceMemory } from '@tipeline/agent/choices';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useSettingsStore } from '@/store/settingsStore';
import type { TaskItem } from '@/config/tables/TasksList';

/**
 * What the assistant remembers from "Which one do you mean?" answers (settings
 * `agent_choices`, shared with the CLI). Forgetting a pick brings the question back.
 */
const emit = defineEmits<{ count: [value: number] }>();

const { t } = useI18n();
const router = useRouter();
const settingsStore = useSettingsStore();

const memory = ref<ChoiceMemory>({});
const installed = ref(new Set<string>());
const loading = ref(true);

const rows = computed(() =>
  Object.entries(memory.value)
    .map(([key, pick]) => ({ key, ...pick }))
    .sort((a, b) => b.at.localeCompare(a.at))
);

async function load() {
  loading.value = true;
  try {
    await settingsStore.load();
    memory.value = parseChoiceMemory(settingsStore.get(CHOICE_MEMORY_SETTING));
    const tasks = (await invokeCore<TaskItem[]>(SEND.TASK_LIST)) ?? [];
    installed.value = new Set(tasks.map((task) => task.identifier));
  } finally {
    loading.value = false;
    emit('count', Object.keys(memory.value).length);
  }
}

onMounted(load);

async function save(next: ChoiceMemory) {
  try {
    await settingsStore.set(CHOICE_MEMORY_SETTING, JSON.stringify(next));
    memory.value = next;
    emit('count', Object.keys(next).length);
    toast.success(t('agent.page.picks.forgotten'));
  } catch (error: any) {
    toast.error(t('agent.page.picks.saveFailed'), { description: error?.message ?? String(error) });
  }
}

function forget(key: string) {
  const next = { ...memory.value };
  delete next[key];
  void save(next);
}

function forgetAll() {
  void save({});
}

function workflowState(identifier: string): 'installed' | 'hub' | 'deleted' {
  if (identifier.startsWith('hub:')) return 'hub';
  return installed.value.has(identifier) ? 'installed' : 'deleted';
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2Icon class="w-4 h-4 animate-spin" /> {{ t('agent.page.loading') }}
    </div>

    <div v-else-if="rows.length === 0" class="flex flex-col items-center justify-center py-10 text-center">
      <BrainIcon class="w-10 h-10 mb-3 text-muted-foreground/40" />
      <p class="text-sm font-medium">{{ t('agent.page.picks.emptyTitle') }}</p>
      <p class="text-xs text-muted-foreground mt-1 max-w-[50ch]">{{ t('agent.page.picks.explain') }}</p>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b">
        <p class="text-xs text-muted-foreground max-w-[70ch]">{{ t('agent.page.picks.explain') }}</p>
        <Button size="sm" variant="outline" @click="forgetAll">{{ t('agent.page.picks.forgetAll') }}</Button>
      </div>
      <ul class="divide-y">
        <li v-for="row in rows" :key="row.key" class="flex flex-wrap items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1 space-y-0.5">
            <p class="text-sm">
              <span class="text-muted-foreground">{{ t('agent.page.picks.whenYouAsk') }}</span>
              <span v-for="word in row.key.split(' ')" :key="word" class="ml-1 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                {{ word }}
              </span>
            </p>
            <p class="text-xs text-muted-foreground">
              →
              <button
                v-if="workflowState(row.identifier) === 'installed'"
                class="text-foreground font-medium hover:underline"
                @click="router.push(`/tasks/${row.identifier}`)"
              >
                {{ row.name }}
              </button>
              <span v-else class="text-foreground font-medium">{{ row.name }}</span>
              <span v-if="workflowState(row.identifier) === 'hub'"> · {{ t('agent.page.picks.onHub') }}</span>
              <span v-else-if="workflowState(row.identifier) === 'deleted'" class="text-amber-700 dark:text-amber-400">
                · {{ t('agent.page.picks.deleted') }}
              </span>
              · {{ formatDistanceToNow(new Date(row.at), { addSuffix: true }) }}
            </p>
          </div>
          <Button size="sm" variant="ghost" @click="forget(row.key)">{{ t('agent.page.picks.forget') }}</Button>
        </li>
      </ul>
    </template>
  </div>
</template>
