<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatDistanceToNow } from 'date-fns';
import { Check, Clock, Loader2, Lock, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import CancelRunButton from '@/components/CancelRunButton.vue';

/** A run waiting at an approval.request (Core.approvalList / appApprovalList). */
export interface PendingApproval {
  pipelineIdentifier: string;
  taskIdentifier: string;
  workflowName: string;
  title: string;
  details: string | null;
  requestedAt: string;
  /** Set when the request has a timeout: when it's decided automatically, and how. */
  expiresAt?: string | null;
  onTimeout?: 'reject' | 'approve' | null;
  trigger?: { type: 'app'; appName: string } | null;
  /** Roles and/or emails allowed to decide (enforced on server workspaces). */
  approvers?: string[] | null;
  /** Set by a server workspace: whether the signed-in user may decide this one… */
  canDecide?: boolean;
  /** …and why not: not an approver, or they started the run (four-eyes rule). */
  blockedBy?: 'approvers' | 'requester' | null;
  /** Set by a server workspace: email of who started the run. */
  requestedBy?: string | null;
}

// One pending approval with an optional comment and Approve / Reject. Used by the
// Approvals page and the app Approvals component.
const props = defineProps<{
  item: PendingApproval;
  /** Buttons and comment are inert (builder preview, or another decision in flight). */
  disabled?: boolean;
  /** This item's decision is being sent. */
  deciding?: boolean;
  compact?: boolean;
  /** Offer canceling the run (the Approvals page; not apps). */
  cancelable?: boolean;
}>();
const emit = defineEmits<{ decide: [approved: boolean, comment: string] }>();
const { t } = useI18n();

const comment = ref('');

const requested = computed(() =>
  props.item.requestedAt
    ? formatDistanceToNow(new Date(props.item.requestedAt), { addSuffix: true })
    : ''
);
const expires = computed(() => {
  if (!props.item.expiresAt) return '';
  const when = formatDistanceToNow(new Date(props.item.expiresAt), {
    addSuffix: true,
  });
  return t(
    props.item.onTimeout === 'approve'
      ? 'approvals.autoApproves'
      : 'approvals.autoRejects',
    { when }
  );
});

const locked = computed(() => props.item.canDecide === false);
const lockedReason = computed(() => {
  if (props.item.blockedBy === 'requester') return t('approvals.selfApproval');
  return props.item.approvers?.length
    ? t('approvals.onlyApprovers', { who: props.item.approvers.join(', ') })
    : t('approvals.onlyEditors');
});

function decide(approved: boolean) {
  emit('decide', approved, comment.value.trim());
}
</script>

<template>
  <div class="rounded-md border space-y-2" :class="compact ? 'p-2.5' : 'p-4'">
    <div>
      <p class="font-medium m-0" :class="compact ? 'text-sm' : 'text-base'">
        {{ item.title }}
      </p>
      <p class="text-xs text-muted-foreground m-0">
        <slot name="workflow">{{ item.workflowName }}</slot>
        <template v-if="item.trigger?.type === 'app'">
          ·
          {{ t('approvals.fromApp', { name: item.trigger.appName }) }}</template
        >
        <template v-if="item.requestedBy">
          ·
          {{ t('approvals.requestedBy', { who: item.requestedBy }) }}</template
        >
        <template v-if="requested"> · {{ requested }}</template>
      </p>
      <p v-if="item.details" class="text-xs mt-1 mb-0 whitespace-pre-wrap">
        {{ item.details }}
      </p>
      <p
        v-if="expires"
        class="text-xs mt-1 mb-0 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
      >
        <Clock class="size-3" />{{ expires }}
      </p>
      <p
        v-if="item.approvers?.length && !locked"
        class="text-xs text-muted-foreground mt-1 mb-0"
      >
        {{ t('approvals.approvers', { who: item.approvers.join(', ') }) }}
      </p>
    </div>
    <p
      v-if="locked"
      class="text-xs text-muted-foreground m-0 inline-flex items-center gap-1"
    >
      <Lock class="size-3" />{{ lockedReason }}
    </p>
    <Textarea
      v-if="!locked"
      v-model="comment"
      rows="1"
      class="min-h-8 text-xs"
      :placeholder="t('approvals.comment')"
      :disabled="disabled"
    />
    <div v-if="cancelable && locked" class="flex justify-end">
      <CancelRunButton
        :target="{ pipelineIdentifier: item.pipelineIdentifier }"
        waiting
        variant="link"
      />
    </div>
    <div v-if="!locked" class="flex gap-2 justify-end items-center">
      <div v-if="cancelable && !disabled" class="mr-auto">
        <CancelRunButton
          :target="{ pipelineIdentifier: item.pipelineIdentifier }"
          waiting
          variant="link"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        :disabled="disabled"
        @click="decide(false)"
      >
        <X class="size-3.5" />
        {{ t('approvals.reject') }}
      </Button>
      <Button size="sm" :disabled="disabled" @click="decide(true)">
        <Loader2 v-if="deciding" class="size-3.5 animate-spin" />
        <Check v-else class="size-3.5" />
        {{ t('approvals.approve') }}
      </Button>
    </div>
  </div>
</template>
