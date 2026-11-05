<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle2, ShieldCheck, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import type { TaskItem } from '@/config/tables/TasksList';
import { useInbox } from '@/composables/useInbox';

// What only the user can act on: approvals they can decide, then workflows whose latest
// run failed. A failure leaves when it's dismissed or the workflow's next run succeeds.
// Opens from the badge next to the Dashboard title.
const props = defineProps<{
  tasks: TaskItem[] | null | undefined;
}>();

const { t } = useI18n();
const router = useRouter();
const { approvals, failing, dismiss } = useInbox(toRef(props, 'tasks'));

const MAX_APPROVALS = 5;

const waiting = computed(() => approvals.value.slice(0, MAX_APPROVALS));
const moreWaiting = computed(() => Math.max(0, approvals.value.length - MAX_APPROVALS));

// Straight to the run that failed; the workflow's overview if the run isn't known.
function openFailedRun(task: TaskItem) {
  if (task.last_run_identifier) {
    router.push({ name: 'PipelineDetail', params: { tid: task.identifier, pipelineId: task.last_run_identifier } });
  } else {
    router.push(`/tasks/${task.identifier}`);
  }
}

const ago = (iso: string | null | undefined) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '');
</script>

<template>
  <div class="flex flex-col max-h-[28rem] pb-2">
    <div class="px-4 pt-3 pb-2 border-b">
      <p class="text-sm font-semibold m-0">{{ t('dashboard.inbox.title') }}</p>
      <p class="text-xs text-muted-foreground m-0">{{ t('dashboard.inbox.description') }}</p>
    </div>
    <div v-if="!waiting.length && !failing.length" class="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
      <CheckCircle2 class="w-4 h-4 text-emerald-500 shrink-0" />
      {{ t('dashboard.inbox.empty') }}
    </div>

    <div v-else class="min-h-0 overflow-y-auto scroll-fade">
      <section v-if="waiting.length">
        <div class="flex items-center justify-between px-4 pt-3 pb-1">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground m-0">
            {{ t('dashboard.inbox.approvals', { count: approvals.length }) }}
          </h3>
          <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="router.push('/approvals')">
            {{ t('dashboard.inbox.review') }}
          </Button>
        </div>
        <div class="divide-y divide-border">
          <div
            v-for="item in waiting"
            :key="item.pipelineIdentifier"
            class="flex items-center gap-2.5 px-4 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
            @click="router.push('/approvals')"
          >
            <ShieldCheck class="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate m-0">{{ item.title }}</p>
              <p class="text-xs text-muted-foreground truncate m-0">{{ item.workflowName }}</p>
            </div>
            <span v-if="item.requestedAt" class="text-xs text-muted-foreground shrink-0">{{ ago(item.requestedAt) }}</span>
          </div>
          <p v-if="moreWaiting" class="px-4 py-2 text-xs text-muted-foreground m-0">
            {{ t('dashboard.inbox.moreApprovals', { count: moreWaiting }) }}
          </p>
        </div>
      </section>

      <section v-if="failing.length">
        <div class="flex items-center justify-between px-4 pt-3 pb-1">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground m-0">
            {{ t('dashboard.inbox.failed', { count: failing.length }) }}
          </h3>
          <Button
            variant="link"
            size="sm"
            class="h-auto p-0 text-xs"
            @click="router.push({ path: '/activity', query: { status: 'failed' } })"
          >
            {{ t('dashboard.inbox.viewAll') }}
          </Button>
        </div>
        <div class="divide-y divide-border">
          <div
            v-for="task in failing"
            :key="task.identifier"
            class="group flex items-center gap-2.5 px-4 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
            @click="openFailedRun(task)"
          >
            <AlertCircle class="w-3.5 h-3.5 text-red-500 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate m-0">{{ task.name }}</p>
            </div>
            <span v-if="task.last_run_at" class="text-xs text-muted-foreground shrink-0">
              {{ t('dashboard.inbox.failedAgo', { time: ago(task.last_run_at) }) }}
            </span>
            <button
              type="button"
              class="p-1 -mr-1 rounded hover:bg-accent transition-colors text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              :title="t('dashboard.inbox.dismiss')"
              :aria-label="t('dashboard.inbox.dismiss')"
              @click.stop="dismiss(task)"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
