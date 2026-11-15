<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { IonPage, IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/vue';
import { listOutline, personCircleOutline } from 'ionicons/icons';

const { t } = useI18n();
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
        <ion-tab-button tab="account" href="/tabs/account">
          <ion-icon :icon="personCircleOutline" aria-hidden="true" />
          <ion-label>{{ t('tabs.account') }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>
