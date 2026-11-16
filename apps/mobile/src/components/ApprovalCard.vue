<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { IonButton, IonIcon, IonSpinner } from '@ionic/vue';
import { lockClosedOutline } from 'ionicons/icons';
import TextField from '@/components/TextField.vue';
import { relativeTime } from '@/lib/runs';
import type { PendingApproval } from '@/approvalsStore';

const props = defineProps<{
  item: PendingApproval;
  /** This card's decision is on its way. */
  deciding?: boolean;
  /** Another card's decision is on its way. */
  disabled?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ decide: [approved: boolean, comment: string] }>();
const { t, locale } = useI18n();

const comment = ref('');
const sending = ref<boolean | null>(null);

const requested = computed(() => t('approvals.requested', { when: relativeTime(props.item.requestedAt, locale.value) }));
const expires = computed(() => {
  if (!props.item.expiresAt) return '';
  const when = relativeTime(props.item.expiresAt, locale.value);
  return t(props.item.onTimeout === 'approve' ? 'approvals.autoApproves' : 'approvals.autoRejects', { when });
});
const locked = computed(() => props.item.canDecide === false);
const lockedReason = computed(() => {
  if (props.item.blockedBy === 'requester') return t('approvals.selfApproval');
  return props.item.approvers?.length
    ? t('approvals.onlyApprovers', { who: props.item.approvers.join(', ') })
    : t('approvals.onlyEditors');
});

function decide(approved: boolean) {
  sending.value = approved;
  emit('decide', approved, comment.value);
}
</script>

<template>
  <article class="tl-card approval" :aria-busy="deciding">
    <h2>{{ item.title || item.workflowName }}</h2>
    <p class="tl-muted line">
      <span v-if="item.title">{{ item.workflowName }} · </span>{{ requested }}
      <span v-if="item.requestedBy"> · {{ t('approvals.requestedBy', { who: item.requestedBy }) }}</span>
    </p>
    <p v-if="expires" class="expires">{{ expires }}</p>
    <p v-if="item.details" class="details">{{ item.details }}</p>

    <p v-if="locked" class="tl-muted locked">
      <ion-icon :icon="lockClosedOutline" aria-hidden="true" />{{ lockedReason }}
    </p>
    <template v-else>
      <text-field
        v-model="comment"
        :label="t('approvals.comment')"
        :name="`comment-${item.pipelineIdentifier}`"
        multiline
        autocapitalize="sentences"
        :readonly="deciding || disabled"
      />
      <p v-if="error" class="tl-error" role="alert">{{ error }}</p>
      <div class="buttons">
        <ion-button fill="outline" color="danger" :disabled="deciding || disabled" @click="decide(false)">
          <ion-spinner v-if="deciding && sending === false" name="crescent" aria-hidden="true" />{{ t('approvals.reject') }}
        </ion-button>
        <ion-button :disabled="deciding || disabled" @click="decide(true)">
          <ion-spinner v-if="deciding && sending === true" name="crescent" aria-hidden="true" />{{ t('approvals.approve') }}
        </ion-button>
      </div>
    </template>
    <ion-button
      fill="clear"
      size="small"
      class="view-run"
      :router-link="`/tabs/home/runs/${encodeURIComponent(item.pipelineIdentifier)}`"
    >
      {{ t('approvals.viewRun') }}
    </ion-button>
  </article>
</template>

<style scoped>
.approval {
  margin-bottom: 12px;
}
h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.line {
  margin: 4px 0 0;
  font-size: 13px;
}
.expires {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--tl-waiting-ink);
}
.details {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.locked {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 12px 0 0;
  font-size: 14px;
}
.locked ion-icon {
  flex: none;
  margin-top: 2px;
}
.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}
.buttons ion-button {
  --border-radius: 12px;
  margin: 0;
  font-weight: 600;
}
.buttons ion-spinner {
  width: 16px;
  height: 16px;
  margin-right: 6px;
}
.view-run {
  margin: 8px 0 -6px -10px;
}
</style>
