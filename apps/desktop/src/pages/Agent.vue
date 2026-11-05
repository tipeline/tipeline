<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Page from '@/components/Page.vue';
import Card from '@/components/Card.vue';
import DataTable from '@/components/DataTable.vue';
import { Button } from '@/components/ui/button';
import { BotIcon } from 'lucide-vue-next';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AssistantDrafts from '@/components/agent/AssistantDrafts.vue';
import AssistantPicks from '@/components/agent/AssistantPicks.vue';
import AssistantFindability from '@/components/agent/AssistantFindability.vue';
import AgentRunDetailDialog from '@/components/AgentRunDetailDialog.vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { createColumns } from '@/config/tables/AgentHistoryTable';
import { useAgentStore, type AgentRunRecord } from '@/store/agentStore';
import { useConnectionStore } from '@/store/connectionStore';

const { t } = useI18n();
const router = useRouter();
const agentStore = useAgentStore();
const connectionStore = useConnectionStore();

type Tab = 'history' | 'drafts' | 'picks' | 'findability';
const TAB_KEY = 'tipeline.assistant.tab';
function storedTab(): Tab {
  try {
    const value = localStorage.getItem(TAB_KEY);
    return value === 'drafts' || value === 'picks' || value === 'findability' ? value : 'history';
  } catch {
    return 'history';
  }
}
const tab = ref<Tab>(storedTab());
function selectTab(value: string | number) {
  tab.value = value as Tab;
  try {
    localStorage.setItem(TAB_KEY, tab.value);
  } catch {
    // The page just opens on History next time.
  }
}

// Shown in the tab labels; each tab reports its own once it has loaded.
const counts = ref<Record<Exclude<Tab, 'history'>, number | null>>({ drafts: null, picks: null, findability: null });

const selectedRun = ref<AgentRunRecord | null>(null);
const detailOpen = ref(false);

onMounted(() => {
  if (!connectionStore.isRemote) agentStore.loadHistory();
});

const columns = computed<ColumnDef<any>[]>(() => createColumns(t, router));

function onRowClick(row: AgentRunRecord) {
  selectedRun.value = row;
  detailOpen.value = true;
}
</script>

<template>
  <Page>
    <template #title>{{ t('agent.history.title') }}</template>
    <template #description>{{ t('agent.history.description') }}</template>

    <template #content>
      <div v-if="connectionStore.isRemote" class="flex items-center justify-center py-8 text-muted-foreground text-sm">
        {{ t('agent.disabledRemote') }}
      </div>

      <div v-else class="space-y-4 h-full flex flex-col">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Tabs :model-value="tab" @update:model-value="selectTab">
            <TabsList>
              <TabsTrigger value="history">{{ t('agent.page.tabs.history') }}</TabsTrigger>
              <TabsTrigger value="drafts">
                {{ t('agent.page.tabs.drafts') }}
                <span v-if="counts.drafts" class="ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  {{ counts.drafts }}
                </span>
              </TabsTrigger>
              <TabsTrigger value="picks">
                {{ t('agent.page.tabs.picks') }}
                <span v-if="counts.picks" class="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                  {{ counts.picks }}
                </span>
              </TabsTrigger>
              <TabsTrigger value="findability">
                {{ t('agent.page.tabs.findability') }}
                <span v-if="counts.findability" class="ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  {{ counts.findability }}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" @click="agentStore.sidebarOpen = true">
            <BotIcon class="w-4 h-4 mr-2" /> {{ t('agent.sidebar.open') }}
          </Button>
        </div>

        <Card v-show="tab === 'history'" classContent="p-0" class="flex-1">
          <template #content>
            <div
              v-if="agentStore.historyLoading && agentStore.history.length === 0"
              class="flex items-center justify-center py-8 text-muted-foreground text-sm"
            >
              {{ t('agent.history.loading') }}
            </div>
            <div
              v-else-if="agentStore.history.length === 0"
              class="flex items-center justify-center py-8 text-muted-foreground text-sm"
            >
              {{ t('agent.history.empty') }}
            </div>
            <DataTable
              v-else
              :columns="columns"
              :data="agentStore.history"
              :flat="true"
              :animated="true"
              :filters="[]"
              @row-click="onRowClick"
            />
          </template>
        </Card>

        <!-- All tabs load on open so their counts can show in the labels. -->
        <Card v-show="tab === 'drafts'" classContent="p-0" class="flex-1">
          <template #content><AssistantDrafts @count="counts.drafts = $event" /></template>
        </Card>
        <Card v-show="tab === 'picks'" classContent="p-0" class="flex-1">
          <template #content><AssistantPicks @count="counts.picks = $event" /></template>
        </Card>
        <Card v-show="tab === 'findability'" classContent="p-0" class="flex-1">
          <template #content><AssistantFindability @count="counts.findability = $event" /></template>
        </Card>
      </div>
    </template>
  </Page>

  <AgentRunDetailDialog v-model:open="detailOpen" :run="selectedRun" />
</template>
