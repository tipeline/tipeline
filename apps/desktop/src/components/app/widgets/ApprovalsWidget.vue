<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RefreshCw, ShieldCheck } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import ApprovalCard, {
  type PendingApproval,
} from '@/components/approvals/ApprovalCard.vue';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { APP_RUNTIME } from '../appRuntimeKey';

// Runs of the app's workflows that are waiting at an approval step. Approving or
// rejecting resumes the run; the workflow receives the decision as the step's result.
// Core only lists/decides runs of workflows the app declares.
export type { PendingApproval };

const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
}>();
const { t } = useI18n();
const runtime = inject(APP_RUNTIME, null);

const SAMPLE: PendingApproval[] = [
  {
    pipelineIdentifier: 'sample',
    taskIdentifier: '',
    workflowName: 'Pay invoice',
    title: 'Pay invoice INV-1042 ($4,200)?',
    details: 'Requested by the billing run',
    requestedAt: '',
  },
];

const POLL_MS = 15000;
const live = computed(() => !props.editable && !!runtime);
const items = ref<PendingApproval[]>([]);
const loading = ref(false);
const loadError = ref('');
const deciding = ref<string | null>(null);
const shown = computed(() => (live.value ? items.value : SAMPLE));

async function refresh() {
  if (!live.value || loading.value) return;
  loading.value = true;
  try {
    items.value = await invokeCore<PendingApproval[]>(SEND.APP_APPROVAL_LIST, {
      appIdentifier: runtime!.appIdentifier(),
      workflows: Array.isArray(props.props.workflows)
        ? [...props.props.workflows]
        : undefined,
    });
    loadError.value = '';
  } catch (e: any) {
    loadError.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

async function decide(
  item: PendingApproval,
  approved: boolean,
  comment: string
) {
  if (!live.value || deciding.value) return;
  deciding.value = item.pipelineIdentifier;
  try {
    await invokeCore(SEND.APP_APPROVAL_DECIDE, {
      appIdentifier: runtime!.appIdentifier(),
      pipelineIdentifier: item.pipelineIdentifier,
      approved,
      comment,
    });
    items.value = items.value.filter(
      (i) => i.pipelineIdentifier !== item.pipelineIdentifier
    );
    emit('event', 'decided', {
      lastDecision: {
        pipelineIdentifier: item.pipelineIdentifier,
        workflow: item.workflowName,
        title: item.title,
        approved,
        comment,
      },
    });
  } catch (e: any) {
    toast.error(t('apps.approvals.decideFailed'), {
      description: e?.message ?? String(e),
    });
    void refresh();
  } finally {
    deciding.value = null;
  }
}

// Also refresh when a run started from this page finishes — it may have just paused.
const anyRunning = computed(() =>
  Object.values(runtime?.runnables ?? {}).some((r) => r.isRunning)
);
watch(anyRunning, (running, was) => {
  if (was && !running) void refresh();
});

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void refresh();
  if (live.value) timer = setInterval(() => void refresh(), POLL_MS);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="flex items-center gap-2 border-b px-(--app-pad) py-2 text-xs shrink-0">
      <ShieldCheck class="size-3.5 text-muted-foreground" />
      <span class="font-medium truncate">{{
        props.props.title || t('apps.approvals.title')
      }}</span>
      <span
        v-if="shown.length"
        class="rounded-full bg-muted px-1.5 tabular-nums"
        >{{ shown.length }}</span
      >
      <Button
        variant="ghost"
        size="icon"
        class="size-6 ml-auto"
        :aria-label="t('apps.approvals.refresh')"
        :disabled="!live || loading"
        @click="refresh"
      >
        <RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>
    <div class="flex-1 min-h-0 overflow-auto p-3 space-y-2">
      <p v-if="loadError" class="text-xs text-destructive m-0 px-1">
        {{ loadError }}
      </p>
      <p
        v-else-if="!shown.length"
        class="text-xs text-muted-foreground m-0 px-1 py-2"
      >
        {{ t('apps.approvals.empty') }}
      </p>
      <ApprovalCard
        v-for="item in shown"
        :key="item.pipelineIdentifier"
        :item="item"
        compact
        :disabled="!live || !!deciding"
        :deciding="deciding === item.pipelineIdentifier"
        @decide="(approved, comment) => decide(item, approved, comment)"
      />
    </div>
  </div>
</template>
