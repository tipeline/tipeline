<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IonPage, IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/vue';
import { chatbubbleOutline, listOutline, personCircleOutline } from 'ionicons/icons';
import { useSession } from '@/session';

const { t } = useI18n();
const session = useSession();
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
