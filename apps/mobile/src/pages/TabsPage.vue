<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IonPage, IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge } from '@ionic/vue';
import { appsOutline, chatbubbleOutline, fileTrayOutline, gitNetworkOutline, homeOutline } from 'ionicons/icons';
import { useSession } from '@/session';
import { useInbox } from '@/inboxStore';

const { t } = useI18n();
const session = useSession();
// Checks the Inbox from here on, for the badge, whichever tab is open.
const inbox = useInbox();
// The Assistant is for editors and admins (the Server turns viewers away too).
const showAssistant = computed(() => session.user?.role !== 'viewer');
</script>

<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="home" href="/tabs/home">
          <ion-icon :icon="homeOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.home') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="workflows" href="/tabs/workflows">
          <ion-icon :icon="gitNetworkOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.workflows') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button v-if="showAssistant" tab="assistant" href="/tabs/assistant">
          <ion-icon :icon="chatbubbleOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.assistant') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="apps" href="/tabs/apps">
          <ion-icon :icon="appsOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.apps') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="inbox" href="/tabs/inbox">
          <ion-icon :icon="fileTrayOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.inbox') }}</ion-label>
          <ion-badge v-if="inbox.count" color="danger">{{ inbox.count }}</ion-badge>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>
