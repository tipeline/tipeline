<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Plus, Server, HardDrive, ChevronRight } from 'lucide-vue-next';
import Page from '@/components/Page.vue';
import { useConnectionStore } from '@/store/connectionStore';
import { SEND } from '@/ipc-channels';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const store = useConnectionStore();
const router = useRouter();
const { t } = useI18n();

const showAddModal = ref(false);
const addName = ref('');
const addHost = ref('');
const addEmail = ref('');
const addPassword = ref('');
const addError = ref('');
const addLoading = ref(false);
const mfaChallengeId = ref('');
const mfaCode = ref('');

function openAddModal() {
  addName.value = '';
  addHost.value = '';
  addEmail.value = '';
  addPassword.value = '';
  addError.value = '';
  mfaChallengeId.value = '';
  mfaCode.value = '';
  showAddModal.value = true;
}

onMounted(() => store.load());

async function finishAdd(token: string) {
  const conn = await store.add(addName.value.trim(), addHost.value.trim(), token);
  showAddModal.value = false;
  router.push(`/settings/workspaces/${conn.id}`);
}

async function submitAdd() {
  addError.value = '';
  if (!addName.value.trim() || !addHost.value.trim() || !addEmail.value.trim() || !addPassword.value.trim()) {
    addError.value = t('connections.allRequired');
    return;
  }
  addLoading.value = true;
  try {
    const result = await window.ipcRenderer.invoke(SEND.SERVER_LOGIN, {
      host: addHost.value.trim(),
      email: addEmail.value.trim(),
      password: addPassword.value.trim(),
    });
    if (result.mfaRequired) {
      mfaChallengeId.value = result.challengeId;
      return;
    }
    await finishAdd(result.token);
  } catch (e: any) {
    addError.value = e?.message ?? 'Login failed.';
  } finally {
    addLoading.value = false;
  }
}

async function submitMfa() {
  addError.value = '';
  if (!mfaCode.value.trim()) return;
  addLoading.value = true;
  try {
    const token = await window.ipcRenderer.invoke(SEND.SERVER_LOGIN_MFA, {
      host: addHost.value.trim(),
      challengeId: mfaChallengeId.value,
      code: mfaCode.value.trim(),
    });
    await finishAdd(token);
  } catch (e: any) {
    addError.value = e?.message ?? 'Invalid code.';
  } finally {
    addLoading.value = false;
  }
}
</script>

<template>
  <Page>
    <template #title>{{ t('connections.title') }}</template>
    <template #content>
      <div class="max-w-2xl space-y-6">
        <p class="text-sm text-muted-foreground">{{ t('connections.description') }}</p>

        <div class="space-y-2">
          <!-- Local workspace (read-only) -->
          <div class="w-full flex items-center gap-3 p-3 border rounded-lg text-left select-none">
            <HardDrive
              class="h-5 w-5 shrink-0"
              :class="!store.activeId ? 'text-green-500' : 'text-muted-foreground'"
            />
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm flex items-center gap-2">
                {{ t('workspace.local') }}
                <span
                  v-if="!store.activeId"
                  class="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded-full font-normal"
                >
                  {{ t('connections.overview.activeLabel') }}
                </span>
              </div>
              <div class="text-xs text-muted-foreground">{{ t('connections.localDescription') }}</div>
            </div>
          </div>

          <button
            v-for="conn in store.connections"
            :key="conn.id"
            class="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-accent transition-colors text-left cursor-pointer"
            @click="router.push(`/settings/workspaces/${conn.id}`)"
          >
            <Server
              class="h-5 w-5 shrink-0"
              :class="store.activeId === conn.id ? 'text-green-500' : 'text-blue-500'"
            />
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm flex items-center gap-2">
                {{ conn.name }}
                <span
                  v-if="store.activeId === conn.id"
                  class="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded-full font-normal"
                >
                  {{ t('connections.overview.activeLabel') }}
                </span>
              </div>
              <div class="text-xs text-muted-foreground truncate">{{ conn.host }}</div>
            </div>
            <ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
          </button>

          <p v-if="store.connections.length === 0" class="text-sm text-muted-foreground py-4 text-center">
            {{ t('connections.empty') }}
          </p>
        </div>

        <button
          class="flex items-center gap-2 px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          @click="openAddModal"
        >
          <Plus class="h-4 w-4" />
          {{ t('connections.newForm.addConnection') }}
        </button>

        <div class="pt-4 border-t text-xs text-muted-foreground space-y-1">
          <p>The server URL is the Tipeline Server address (not the Core directly).</p>
          <p>
            Use <code class="bg-muted px-1 rounded">ws://</code> for local networks or
            <code class="bg-muted px-1 rounded">wss://</code> behind a TLS reverse proxy.
          </p>
        </div>
      </div>
    </template>
  </Page>

  <!-- Add workspace modal -->
  <Dialog :open="showAddModal" @update:open="showAddModal = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('connections.newForm.heading') }}</DialogTitle>
      </DialogHeader>
      <div v-if="!mfaChallengeId" class="space-y-4 py-2">
        <div class="space-y-3">
          <p class="text-sm font-semibold">{{ t('connections.editForm.heading') }}</p>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('connections.newForm.nameLabel') }}</label>
            <input
              v-model="addName"
              :placeholder="t('connections.newForm.namePlaceholder')"
              class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('connections.newForm.hostLabel') }}</label>
            <input
              v-model="addHost"
              :placeholder="t('connections.newForm.hostPlaceholder')"
              class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div class="border-t" />
        <div class="space-y-3">
          <p class="text-sm font-semibold">{{ t('connections.authForm.heading') }}</p>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('connections.newForm.emailLabel') }}</label>
            <input
              v-model="addEmail"
              type="email"
              :placeholder="t('connections.newForm.emailPlaceholder')"
              class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('connections.newForm.passwordLabel') }}</label>
            <input
              v-model="addPassword"
              type="password"
              :placeholder="t('connections.newForm.passwordPlaceholder')"
              class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              @keyup.enter="submitAdd"
            />
          </div>
        </div>
        <p v-if="addError" class="text-sm text-destructive">{{ addError }}</p>
      </div>

      <div v-else class="space-y-4 py-2">
        <p class="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">Verification code</label>
          <input
            v-model="mfaCode"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
            @keyup.enter="submitMfa"
          />
        </div>
        <p v-if="addError" class="text-sm text-destructive">{{ addError }}</p>
      </div>

      <DialogFooter>
        <button
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="addLoading"
          @click="showAddModal = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          v-if="!mfaChallengeId"
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="addLoading"
          @click="submitAdd"
        >
          {{ addLoading ? t('connections.newForm.connecting') : t('connections.newForm.add') }}
        </button>
        <button
          v-else
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="addLoading"
          @click="submitMfa"
        >
          {{ addLoading ? t('connections.newForm.connecting') : 'Verify' }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
