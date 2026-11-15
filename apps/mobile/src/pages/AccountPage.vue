<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton } from '@ionic/vue';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import { useSession } from '@/session';

const { t } = useI18n();
const router = useRouter();
const session = useSession();

const statusText = computed(() =>
  session.status === 'open' ? t('account.statusOpen') : t(`connection.${session.status}`, session.status)
);
const roleText = computed(() => (session.user ? t(`account.roles.${session.user.role}`) : ''));

function signOut() {
  session.signOut();
  router.replace('/connect');
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('account.title') }}</ion-title>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content>
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ t('account.title') }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <ion-list inset lines="full">
        <ion-item v-if="session.user">
          <ion-label>
            <p>{{ t('account.signedInAs') }}</p>
            <h2>{{ session.user.name }}</h2>
            <p>{{ session.user.email }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="roleText">
          <ion-label>{{ t('account.role') }}</ion-label>
          <ion-note slot="end">{{ roleText }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ t('account.server') }}</ion-label>
          <ion-note slot="end" class="server">{{ session.serverUrl }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ t('account.status') }}</ion-label>
          <ion-note slot="end">{{ statusText }}</ion-note>
        </ion-item>
      </ion-list>

      <div class="ion-padding">
        <ion-button expand="block" fill="outline" color="danger" @click="signOut">{{ t('account.signOut') }}</ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.server {
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
ion-button {
  --border-radius: 12px;
  font-weight: 600;
}
</style>
