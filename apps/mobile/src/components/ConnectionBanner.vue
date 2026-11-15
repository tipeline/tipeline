<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IonButton } from '@ionic/vue';
import { useSession } from '@/session';

/** A strip under the header while the connection isn't open. Nothing when all is well. */
const { t } = useI18n();
const session = useSession();
const router = useRouter();

const message = computed(() => {
  switch (session.status) {
    case 'connecting':
      return t('connection.connecting');
    case 'reconnecting':
      return t('connection.reconnecting');
    case 'unauthorized':
      return t('connection.unauthorized');
    default:
      return '';
  }
});

function signInAgain() {
  session.signOut();
  router.replace('/connect');
}
</script>

<template>
  <div
    v-if="message"
    class="banner"
    :class="{ problem: session.status !== 'connecting' }"
    role="status"
    aria-live="polite"
  >
    <span>{{ message }}</span>
    <ion-button
      v-if="session.status === 'reconnecting'"
      size="small"
      fill="clear"
      @click="session.client?.reconnectNow()"
    >
      {{ t('connection.retry') }}
    </ion-button>
    <ion-button v-else-if="session.status === 'unauthorized'" size="small" fill="clear" @click="signInAgain">
      {{ t('connection.signInAgain') }}
    </ion-button>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 40px;
  padding: 2px 8px 2px 16px;
  font-size: 14px;
  color: var(--tl-muted);
  background: var(--tl-card);
  border-bottom: 1px solid var(--tl-border);
}
.banner.problem {
  color: var(--tl-waiting-ink);
  background: var(--tl-waiting-bg);
}
.banner ion-button {
  --color: currentColor;
  font-weight: 600;
}
</style>
