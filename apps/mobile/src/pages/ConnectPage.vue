<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonButton, IonSpinner } from '@ionic/vue';
import { ServerHttpError } from '@tipeline/client';
import TextField from '@/components/TextField.vue';
import logoOnLight from '@shared-assets/logo-dark.svg';
import logoOnDark from '@shared-assets/logo-light.svg';
import { useSession } from '@/session';
import { lastServer } from '@/storage';

const { t } = useI18n();
const router = useRouter();
const session = useSession();

const server = ref(lastServer());
const email = ref('');
const password = ref('');
const code = ref('');
const challengeId = ref<string | null>(null);
const busy = ref(false);
const error = ref('');

function messageFor(err: unknown): string {
  if (err instanceof ServerHttpError && err.status === 0) return t('connect.unreachable');
  return (err as Error)?.message ?? String(err);
}

async function signIn() {
  error.value = '';
  if (!server.value.trim() || !email.value.trim() || !password.value) {
    error.value = t('connect.missing');
    return;
  }
  busy.value = true;
  try {
    const result = await session.signIn(server.value, email.value, password.value);
    if (result.status === 'mfa_required') {
      challengeId.value = result.challengeId;
      return;
    }
    password.value = '';
    router.replace('/tabs/workflows');
  } catch (err) {
    error.value = messageFor(err);
  } finally {
    busy.value = false;
  }
}

async function verify() {
  if (!challengeId.value || !code.value.trim()) return;
  error.value = '';
  busy.value = true;
  try {
    await session.completeMfa(server.value, challengeId.value, code.value);
    password.value = '';
    code.value = '';
    challengeId.value = null;
    router.replace('/tabs/workflows');
  } catch (err) {
    error.value = messageFor(err);
  } finally {
    busy.value = false;
  }
}

function back() {
  challengeId.value = null;
  code.value = '';
  error.value = '';
}
</script>

<template>
  <ion-page>
    <ion-content class="ion-padding">
      <main class="connect">
        <picture>
          <source :srcset="logoOnDark" media="(prefers-color-scheme: dark)" />
          <img :src="logoOnLight" alt="Tipeline" class="logo" />
        </picture>

        <template v-if="!challengeId">
          <h1>{{ t('connect.title') }}</h1>
          <p class="tl-muted intro">{{ t('connect.intro') }}</p>

          <form class="fields" @submit.prevent="signIn">
            <text-field
              v-model="server"
              name="server"
              :label="t('connect.server')"
              type="url"
              inputmode="url"
              autocomplete="url"
              placeholder="https://tipeline.acme.dev"
              :hint="t('connect.serverHint')"
            />
            <text-field
              v-model="email"
              name="email"
              :label="t('connect.email')"
              type="email"
              inputmode="email"
              autocomplete="username"
            />
            <text-field
              v-model="password"
              name="password"
              :label="t('connect.password')"
              type="password"
              autocomplete="current-password"
            />
            <p v-if="error" class="tl-error" role="alert">{{ error }}</p>
            <ion-button type="submit" expand="block" size="large" :disabled="busy">
              <ion-spinner v-if="busy" name="crescent" aria-hidden="true" />
              <span>{{ busy ? t('connect.signingIn') : t('connect.signIn') }}</span>
            </ion-button>
          </form>
        </template>

        <template v-else>
          <h1>{{ t('connect.mfaTitle') }}</h1>
          <p class="tl-muted intro">{{ t('connect.mfaIntro') }}</p>
          <form class="fields" @submit.prevent="verify">
            <text-field
              v-model="code"
              name="code"
              :label="t('connect.code')"
              inputmode="numeric"
              autocomplete="one-time-code"
            />
            <p v-if="error" class="tl-error" role="alert">{{ error }}</p>
            <ion-button type="submit" expand="block" size="large" :disabled="busy || !code.trim()">
              <ion-spinner v-if="busy" name="crescent" aria-hidden="true" />
              <span>{{ t('connect.verify') }}</span>
            </ion-button>
            <ion-button fill="clear" expand="block" @click="back">{{ t('connect.back') }}</ion-button>
          </form>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.connect {
  max-width: 440px;
  margin: 0 auto;
  padding: max(48px, env(safe-area-inset-top)) 8px 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.logo {
  width: 150px;
  height: auto;
  display: block;
}
h1 {
  margin: 12px 0 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.intro {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}
.fields .tl-error {
  margin: 0;
}ion-button[size='large'] {
  --border-radius: 12px;
  margin-top: 4px;
  font-weight: 600;
}
ion-spinner {
  width: 18px;
  height: 18px;
  margin-right: 8px;
}
</style>
