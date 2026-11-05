<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CheckCircle2Icon, Loader2Icon, SearchCheckIcon } from 'lucide-vue-next';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

/** Mirrors WorkflowFindability in apps/core/src/engine/WorkflowCatalog.ts. */
interface FindabilityIssue {
  code: 'draft' | 'noDescription' | 'genericName' | 'shortDescription' | 'noTags' | 'inputsNeedDetail';
  severity: 'hidden' | 'important' | 'minor';
  inputs?: string[];
}
interface WorkflowFindability {
  identifier: string;
  name: string;
  issues: FindabilityIssue[];
}

/**
 * How easily the assistant finds each workflow and fills in its inputs: what's
 * missing from the name, description, tags and input labels it searches.
 */
const emit = defineEmits<{ count: [value: number] }>();

const { t } = useI18n();
const router = useRouter();

const workflows = ref<WorkflowFindability[]>([]);
const loading = ref(true);
const loadError = ref('');

const SEVERITY_ORDER = { hidden: 0, important: 1, minor: 2 } as const;
const DOT = {
  hidden: 'bg-slate-400',
  important: 'bg-amber-500',
  minor: 'bg-sky-500',
} as const;

const withIssues = computed(() =>
  workflows.value
    .filter((w) => w.issues.length > 0)
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.issues[0].severity] - SEVERITY_ORDER[b.issues[0].severity] || a.name.localeCompare(b.name)
    )
);
const fine = computed(() => workflows.value.length - withIssues.value.length);
/** What the tab badge counts: workflows that are hidden or hard to find, not the minor ones. */
const needAttention = computed(
  () => withIssues.value.filter((w) => w.issues.some((i) => i.severity !== 'minor')).length
);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    workflows.value = (await invokeCore<WorkflowFindability[]>(SEND.ASSISTANT_FINDABILITY)) ?? [];
  } catch (error: any) {
    loadError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
    emit('count', needAttention.value);
  }
}

onMounted(load);

function issueText(issue: FindabilityIssue) {
  return t(`agent.page.findability.issue.${issue.code}`, { inputs: (issue.inputs ?? []).join(', ') });
}

function open(workflow: WorkflowFindability) {
  const isDraft = workflow.issues.some((i) => i.code === 'draft');
  router.push(isDraft ? `/tasks/${workflow.identifier}/edit` : `/tasks/${workflow.identifier}`);
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2Icon class="w-4 h-4 animate-spin" /> {{ t('agent.page.loading') }}
    </div>

    <p v-else-if="loadError" class="px-4 py-6 text-sm text-red-600 dark:text-red-400">{{ loadError }}</p>

    <div v-else-if="withIssues.length === 0" class="flex flex-col items-center justify-center py-10 text-center">
      <CheckCircle2Icon class="w-10 h-10 mb-3 text-emerald-500/60" />
      <p class="text-sm font-medium">{{ t('agent.page.findability.allGood') }}</p>
      <p class="text-xs text-muted-foreground mt-1 max-w-[50ch]">{{ t('agent.page.findability.explain') }}</p>
    </div>

    <template v-else>
      <div class="flex items-start gap-2 px-4 py-3 border-b">
        <SearchCheckIcon class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div class="text-xs text-muted-foreground space-y-0.5">
          <p>{{ t('agent.page.findability.explain') }}</p>
          <p>{{ t('agent.page.findability.summary', { ok: fine, total: workflows.length }) }}</p>
        </div>
      </div>
      <ul class="divide-y">
        <li v-for="workflow in withIssues" :key="workflow.identifier" class="flex flex-wrap items-start gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <button class="text-sm font-medium hover:underline text-left" @click="open(workflow)">{{ workflow.name }}</button>
            <ul class="mt-1 space-y-0.5">
              <li v-for="issue in workflow.issues" :key="issue.code" class="flex items-start gap-2 text-xs text-muted-foreground">
                <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" :class="DOT[issue.severity]" />
                <span class="break-words">{{ issueText(issue) }}</span>
              </li>
            </ul>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
