<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonButton,
  IonIcon,
  onIonViewDidEnter,
} from '@ionic/vue';
import { desktopOutline } from 'ionicons/icons';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import { useSession } from '@/session';
import { useInbox } from '@/inboxStore';

const { t } = useI18n();
const router = useRouter();
const session = useSession();
const inbox = useInbox();

const statusText = computed(() =>
  session.status === 'open' ? t('more.connected') : t(`connection.${session.status}`, session.status)
);
const roleText = computed(() => (session.user ? t(`account.roles.${session.user.role}`) : ''));
const host = computed(() => session.serverUrl.replace(/^https?:\/\//, ''));
const initials = computed(() => {
  const name = session.user?.name?.trim() || session.user?.email || '';
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
});

const runsToday = ref<number | null>(null);
onIonViewDidEnter(async () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  try {
    const [today] = await session.api().request<Array<{ total: number }>>('pipelineStats', {
      boundaries: [start.toISOString(), end.toISOString()],
    });
    runsToday.value = today?.total ?? 0;
  } catch {
    runsToday.value = null;
  }
});
const schedulesOn = computed(() => inbox.schedules.filter((s) => s.enabled).length);

const DESKTOP_ITEMS = ['builder', 'apps', 'debugger', 'variables', 'plugins', 'backup', 'settings'];

function signOut() {
  session.signOut();
  router.replace('/connect');
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/home" />
        </ion-buttons>
        <ion-title>{{ t('more.title') }}</ion-title>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content class="ion-padding">
      <section v-if="session.user" class="tl-card profile">
        <span class="avatar" aria-hidden="true">{{ initials }}</span>
        <span class="who">
          <strong>{{ session.user.name || session.user.email }} · {{ roleText }}</strong>
          <span class="tl-muted">{{ session.user.email }}</span>
          <span class="tl-muted server">
            <span class="dot" :class="session.status" aria-hidden="true" />{{ host }} · {{ statusText }}
          </span>
        </span>
      </section>

      <ion-list inset lines="full" class="links">
        <ion-item router-link="/tabs/home/runs" detail>
          <ion-label>{{ t('more.runs') }}</ion-label>
          <ion-note v-if="runsToday !== null" slot="end">{{ t('more.runsToday', { count: runsToday }) }}</ion-note>
        </ion-item>
        <ion-item router-link="/tabs/home/schedules" detail>
          <ion-label>{{ t('more.schedules') }}</ion-label>
          <ion-note v-if="inbox.loaded" slot="end">{{ t('more.schedulesOn', { count: schedulesOn }) }}</ion-note>
        </ion-item>
      </ion-list>

      <h2 class="desktop-title">
        <ion-icon :icon="desktopOutline" aria-hidden="true" />{{ t('more.desktopTitle') }}
      </h2>
      <div class="desktop">
        <div class="chips">
          <span v-for="item in DESKTOP_ITEMS" :key="item">{{ t(`more.desktopItems.${item}`) }}</span>
        </div>
        <p class="tl-muted">{{ t('more.desktopNote') }}</p>
      </div>

      <ion-button expand="block" fill="outline" color="danger" class="sign-out" @click="signOut">
        {{ t('account.signOut') }}
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: var(--tl-ink);
  color: var(--tl-card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.who strong {
  font-size: 15px;
}
.who span {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.server {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--tl-waiting-ink);
}
.dot.open {
  background: var(--tl-success-ink);
}
.links {
  margin: 14px 0 0;
  border-radius: 14px;
  border: 1px solid var(--tl-border);
}
.desktop-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 22px 2px 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tl-muted);
}
.desktop {
  border: 1px dashed var(--tl-border);
  border-radius: 14px;
  padding: 12px 14px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chips span {
  font-size: 13px;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 8px;
  background: var(--tl-bg);
  color: var(--tl-muted);
}
.desktop p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.45;
}
.sign-out {
  margin-top: 22px;
  --border-radius: 12px;
  font-weight: 600;
}
</style>
