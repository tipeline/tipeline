<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IonPage, IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge } from '@ionic/vue';
import { chatbubbleOutline, checkmarkDoneOutline, listOutline, personCircleOutline, pulseOutline } from 'ionicons/icons';
import { useSession } from '@/session';
import { useApprovals } from '@/approvalsStore';

const { t } = useI18n();
const session = useSession();
// Checks for approvals from here on, for the badge, whichever tab is open.
const approvals = useApprovals();
// The Assistant is for editors and admins (the Server turns viewers away too).
const showAssistant = computed(() => session.user?.role !== 'viewer');
</script>

<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="workflows" href="/tabs/workflows">
          <ion-icon :icon="listOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.workflows') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="runs" href="/tabs/runs">
          <ion-icon :icon="pulseOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.runs') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="approvals" href="/tabs/approvals">
          <ion-icon :icon="checkmarkDoneOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.approvals') }}</ion-label>
          <ion-badge v-if="approvals.count" color="danger">{{ approvals.count }}</ion-badge>
        </ion-tab-button>
        <ion-tab-button v-if="showAssistant" tab="assistant" href="/tabs/assistant">
          <ion-icon :icon="chatbubbleOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.assistant') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="account" href="/tabs/account">
          <ion-icon :icon="personCircleOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.account') }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>
