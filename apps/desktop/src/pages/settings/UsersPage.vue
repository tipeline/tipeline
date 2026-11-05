<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { UserPlus, Shield, User as UserIcon, RefreshCw } from 'lucide-vue-next';
import Page from '@/components/Page.vue';
import { useConnectionStore } from '@/store/connectionStore';
import { SEND } from '@/ipc-channels';

interface ServerUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
}

const store = useConnectionStore();
const { t } = useI18n();

const users = ref<ServerUser[]>([]);
const loading = ref(false);
const error = ref('');

const showForm = ref(false);
const formLoading = ref(false);
const formError = ref('');
const newName = ref('');
const newEmail = ref('');
const newPassword = ref('');
const newRole = ref('user');

const activeConnection = computed(() =>
  store.connections.find((c) => c.id === store.activeId) ?? null
);

async function serverCall(channel: string, args: Record<string, any> = {}) {
  const conn = activeConnection.value;
  if (!conn) throw new Error('No active remote connection');
  return window.ipcRenderer.invoke(channel, { host: conn.host, token: conn.token, ...args });
}

async function loadUsers() {
  if (!activeConnection.value) return;
  loading.value = true;
  error.value = '';
  try {
    users.value = await serverCall(SEND.SERVER_USERS_LIST);
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load users';
  } finally {
    loading.value = false;
  }
}

async function createUser() {
  if (!newName.value.trim() || !newEmail.value.trim() || !newPassword.value.trim()) {
    formError.value = t('users.allRequired');
    return;
  }
  formLoading.value = true;
  formError.value = '';
  try {
    const user = await serverCall(SEND.SERVER_USER_CREATE, {
      name: newName.value.trim(),
      email: newEmail.value.trim(),
      password: newPassword.value.trim(),
      role: newRole.value,
    });
    users.value.push(user);
    newName.value = '';
    newEmail.value = '';
    newPassword.value = '';
    newRole.value = 'user';
    showForm.value = false;
  } catch (e: any) {
    formError.value = e?.message ?? 'Failed to create user';
  } finally {
    formLoading.value = false;
  }
}

async function toggleActive(user: ServerUser) {
  error.value = '';
  try {
    const updated = await serverCall(SEND.SERVER_USER_UPDATE, {
      id: user.id,
      is_active: user.is_active ? 0 : 1,
    });
    const idx = users.value.findIndex((u) => u.id === user.id);
    if (idx !== -1) users.value[idx] = updated;
  } catch (e: any) {
    error.value = e?.message ?? 'Update failed';
  }
}

async function changeRole(user: ServerUser, role: string) {
  error.value = '';
  try {
    const updated = await serverCall(SEND.SERVER_USER_UPDATE, { id: user.id, role });
    const idx = users.value.findIndex((u) => u.id === user.id);
    if (idx !== -1) users.value[idx] = updated;
  } catch (e: any) {
    error.value = e?.message ?? 'Update failed';
  }
}

onMounted(loadUsers);
</script>

<template>
  <Page>
    <template #title>{{ t('users.title') }}</template>
    <template #content>
      <div class="max-w-2xl space-y-6">
        <p class="text-sm text-muted-foreground">{{ t('users.description') }}</p>

        <div v-if="!activeConnection" class="py-8 text-center text-sm text-muted-foreground border rounded-lg">
          {{ t('users.notAvailable') }}
        </div>

        <template v-else>
          <div v-if="error" class="text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
            {{ error }}
          </div>

          <!-- User list -->
          <div class="space-y-2">
            <div v-if="loading" class="py-4 text-center text-sm text-muted-foreground">
              {{ t('common.loading') }}
            </div>

            <div
              v-else
              v-for="user in users"
              :key="user.id"
              class="flex items-center gap-3 p-3 border rounded-lg"
              :class="{ 'opacity-50': !user.is_active }"
            >
              <component
                :is="user.role === 'admin' ? Shield : UserIcon"
                class="h-5 w-5 shrink-0"
                :class="user.role === 'admin' ? 'text-amber-500' : 'text-muted-foreground'"
              />
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm">{{ user.name }}</div>
                <div class="text-xs text-muted-foreground">{{ user.email }}</div>
              </div>

              <!-- Role badge -->
              <span
                class="text-xs px-2 py-0.5 rounded-full font-medium"
                :class="user.role === 'admin'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'"
              >
                {{ t(`users.roles.${user.role}`) }}
              </span>

              <!-- Role toggle -->
              <select
                :value="user.role"
                class="text-xs border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                :title="t('users.changeRole')"
                @change="changeRole(user, ($event.target as HTMLSelectElement).value)"
              >
                <option value="user">{{ t('users.roles.user') }}</option>
                <option value="admin">{{ t('users.roles.admin') }}</option>
              </select>

              <!-- Activate / deactivate -->
              <button
                class="text-xs px-2 py-1 border rounded hover:bg-accent transition-colors"
                :class="user.is_active ? 'text-destructive hover:border-destructive/50' : 'text-green-600'"
                @click="toggleActive(user)"
              >
                {{ user.is_active ? t('users.deactivate') : t('users.activate') }}
              </button>
            </div>

            <p v-if="!loading && users.length === 0" class="text-sm text-muted-foreground py-4 text-center">
              {{ t('users.empty') }}
            </p>
          </div>

          <!-- Invite form -->
          <div v-if="showForm" class="border rounded-lg p-4 space-y-3">
            <h3 class="text-sm font-semibold">{{ t('users.newForm.heading') }}</h3>
            <div class="space-y-2">
              <input
                v-model="newName"
                :placeholder="t('users.newForm.namePlaceholder')"
                class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                v-model="newEmail"
                type="email"
                :placeholder="t('users.newForm.emailPlaceholder')"
                class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                v-model="newPassword"
                type="password"
                :placeholder="t('users.newForm.passwordPlaceholder')"
                class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                v-model="newRole"
                class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="user">{{ t('users.roles.user') }}</option>
                <option value="admin">{{ t('users.roles.admin') }}</option>
              </select>
            </div>
            <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>
            <div class="flex gap-2">
              <button
                class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                :disabled="formLoading"
                @click="createUser"
              >
                {{ formLoading ? t('users.newForm.adding') : t('users.newForm.add') }}
              </button>
              <button
                class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
                :disabled="formLoading"
                @click="showForm = false"
              >
                {{ t('users.newForm.cancel') }}
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              v-if="!showForm"
              class="flex items-center gap-2 px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
              @click="showForm = true"
            >
              <UserPlus class="h-4 w-4" />
              {{ t('users.invite') }}
            </button>
            <button
              class="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              :disabled="loading"
              @click="loadUsers"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
            </button>
          </div>
        </template>
      </div>
    </template>
  </Page>
</template>
