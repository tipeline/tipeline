<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-vue-next';
import Page from '@/components/Page.vue';
import DataTable from '@/components/DataTable.vue';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import ApprovalCard, {
  type PendingApproval,
} from '@/components/approvals/ApprovalCard.vue';
import { useApprovalsStore } from '@/store/approvalsStore';
import { useConnectionStore } from '@/store/connectionStore';
import {
  createColumns,
  type ApprovalDecisionItem,
} from '@/config/tables/ApprovalHistory';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

// Approvals across all workflows and apps: what's waiting (decide here — the run then
// continues with the decision) and what was decided, by whom, when and why.
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const approvals = useApprovalsStore();
const connection = useConnectionStore();

type Tab = 'waiting' | 'decided';
const TAB_KEY = 'approvals.tab';
function initialTab(): Tab {
  if (route.query.tab === 'decided' || route.query.tab === 'waiting')
    return route.query.tab;
  try {
    return localStorage.getItem(TAB_KEY) === 'decided' ? 'decided' : 'waiting';
  } catch {
    return 'waiting';
  }
}
const tab = ref<Tab>(initialTab());
watch(tab, (value) => {
  try {
    localStorage.setItem(TAB_KEY, value);
  } catch {
    // Remembering the tab is a convenience only.
  }
  if (value === 'decided') void loadHistory();
  router.replace({ query: { ...route.query, tab: value } });
});

const history = ref<ApprovalDecisionItem[]>([]);
const historyLoaded = ref(false);
const historyLoading = ref(false);
const historyError = ref('');

async function loadHistory() {
  historyLoading.value = true;
  try {
    history.value = await invokeCore<ApprovalDecisionItem[]>(
      SEND.APPROVAL_HISTORY,
      {}
    );
    historyError.value = '';
  } catch (e: any) {
    historyError.value = e?.message ?? String(e);
  } finally {
    historyLoading.value = false;
    historyLoaded.value = true;
  }
}

function refresh() {
  void approvals.refresh();
  if (tab.value === 'decided') void loadHistory();
}

onMounted(refresh);
// Another workspace, another history.
watch(
  () => connection.activeId,
  () => {
    history.value = [];
    historyLoaded.value = false;
    if (tab.value === 'decided') void loadHistory();
  }
);

async function decide(
  item: PendingApproval,
  approved: boolean,
  comment: string
) {
  try {
    await approvals.decide(item, approved, comment);
    toast.success(
      t(approved ? 'taskHistory.approvedToast' : 'taskHistory.rejectedToast')
    );
    historyLoaded.value = false;
  } catch (e: any) {
    toast.error(t('apps.approvals.decideFailed'), {
      description: e?.message ?? t('common.unknownError'),
    });
  }
}

const columns = computed(() => createColumns(t, router));
</script>

<template>
  <Page scrollable>
    <template #title>{{ t('approvals.title') }}</template>
    <template #menu>
      <Button variant="outline" size="sm" @click="refresh">
        <RefreshCw class="w-4 h-4" />
        {{ t('approvals.refresh') }}
      </Button>
    </template>
    <template #nav>
      <Tabs v-model="tab" class="mt-2">
        <TabsList>
          <TabsTrigger value="waiting">
            {{ t('approvals.tabs.waiting') }}
            <span
              v-if="approvals.items.length"
              class="ml-1.5 rounded-full bg-muted px-1.5 text-xs tabular-nums"
            >
              {{ approvals.items.length }}
            </span>
          </TabsTrigger>
          <TabsTrigger value="decided">{{
            t('approvals.tabs.decided')
          }}</TabsTrigger>
        </TabsList>
      </Tabs>
    </template>
    <template #content>
      <div v-if="tab === 'waiting'" class="max-w-3xl w-full space-y-3">
        <p class="text-sm text-muted-foreground m-0">
          {{ t('approvals.description') }}
        </p>

        <div
          v-if="!approvals.loaded"
          class="flex items-center gap-2 p-4 text-sm text-muted-foreground"
        >
          <Loader2 class="w-4 h-4 animate-spin" />
          {{ t('runs.loading') }}
        </div>
        <p v-else-if="approvals.error" class="text-sm text-destructive m-0">
          {{ approvals.error }}
        </p>
        <div
          v-else-if="!approvals.items.length"
          class="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground"
        >
          <CheckCircle2 class="w-4 h-4 text-emerald-500 shrink-0" />
          {{ t('approvals.empty') }}
        </div>

        <ApprovalCard
          v-for="item in approvals.items"
          :key="item.pipelineIdentifier"
          :item="item"
          :disabled="!!approvals.deciding"
          :deciding="approvals.deciding === item.pipelineIdentifier"
          cancelable
          @decide="(approved, comment) => decide(item, approved, comment)"
        >
          <template #workflow>
            <router-link
              :to="`/tasks/${item.taskIdentifier}/pipelines/${item.pipelineIdentifier}`"
              class="hover:underline"
            >
              {{ item.workflowName }}
            </router-link>
          </template>
        </ApprovalCard>
      </div>

      <div v-else class="w-full space-y-3">
        <p class="text-sm text-muted-foreground m-0">
          {{ t('approvals.history.description') }}
        </p>
        <div
          v-if="historyLoading && !historyLoaded"
          class="flex items-center gap-2 p-4 text-sm text-muted-foreground"
        >
          <Loader2 class="w-4 h-4 animate-spin" />
          {{ t('runs.loading') }}
        </div>
        <p v-else-if="historyError" class="text-sm text-destructive m-0">
          {{ historyError }}
        </p>
        <div
          v-else-if="!history.length"
          class="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground"
        >
          {{ t('approvals.history.empty') }}
        </div>
        <DataTable
          v-else
          :columns="columns"
          :data="history"
          :flat="true"
          :page-size="25"
          :hidden-columns="['decision']"
          :filters="[
            {
              column: 'decision',
              placeholder: t('approvals.history.decision'),
              type: 'select',
              options: [
                { label: t('approvals.history.approved'), value: 'approved' },
                { label: t('approvals.history.rejected'), value: 'rejected' },
              ],
            },
            {
              column: 'title',
              placeholder: t('approvals.history.search'),
              type: 'text',
            },
          ]"
        />
      </div>
    </template>
  </Page>
</template>
