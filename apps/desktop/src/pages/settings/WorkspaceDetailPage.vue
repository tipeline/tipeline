<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { Shield, RefreshCw, Plus, Pencil, UserX, UserCheck } from 'lucide-vue-next';
import Page from '@/components/Page.vue';
import WsCard from '@/components/workspace/ui/WsCard.vue';
import WsStat from '@/components/workspace/ui/WsStat.vue';
import WsNote from '@/components/workspace/ui/WsNote.vue';
import WsStatus from '@/components/workspace/ui/WsStatus.vue';
import {
  tableClass,
  detailTableClass,
  btnClass,
  btnPrimaryClass,
  btnDangerClass,
  iconBtnClass,
  iconBtnDangerClass,
  avatarClass,
  roleBadgeClass,
  initials,
  capitalize,
  relTime,
  shortDate,
} from '@/components/workspace/ui/styles';
import { useConnectionStore } from '@/store/connectionStore';
import { SEND } from '@/ipc-channels';
import WebhooksTab from '@/components/workspace/WebhooksTab.vue';
import SessionsTab from '@/components/workspace/SessionsTab.vue';
import TokensTab from '@/components/workspace/TokensTab.vue';
import RolesTab from '@/components/workspace/RolesTab.vue';
import SecurityTab from '@/components/workspace/SecurityTab.vue';
import AuditLogTab from '@/components/workspace/AuditLogTab.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ServerUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
}

interface TokenSummary {
  kind: 'session' | 'api';
  expires_at: string | null;
  revoked_at: string | null;
}

interface PipelineRun {
  task_identifier: string;
  triggered_by_type: string;
  triggered_by_name: string | null;
  triggered_at: string;
  status: 'running' | 'completed' | 'error';
}

const route = useRoute();
const router = useRouter();
const store = useConnectionStore();
const { t } = useI18n();

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const connection = computed(() =>
  store.connections.find((c) => c.id === route.params.id) ?? null
);
const isActive = computed(() => store.activeId === connection.value?.id);

const isAdmin = computed(() => store.serverMe?.role === 'admin');
// Management tabs talk to this workspace's server directly via its saved credentials,
// regardless of which workspace Core is routing tasks through — so until you've switched
// into this one, only Overview (view/edit the connection, set it active) is shown.
const availableTabs = computed(() => {
  if (!isActive.value) return ['overview'] as const;
  return isAdmin.value
    ? (['overview', 'users', 'sessions', 'tokens', 'roles', 'security', 'webhooks', 'audit'] as const)
    : (['overview', 'sessions', 'tokens', 'security'] as const);
});
type Tab = 'overview' | 'users' | 'sessions' | 'tokens' | 'roles' | 'security' | 'webhooks' | 'audit';
const tab = ref<Tab>('overview');

watch(availableTabs, (tabs) => {
  if (!(tabs as readonly string[]).includes(tab.value)) tab.value = 'overview';
});

const transport = computed(() => {
  const host = connection.value?.host ?? '';
  if (host.startsWith('wss://')) return 'WebSocket, TLS';
  if (host.startsWith('ws://')) return 'WebSocket';
  if (host.startsWith('https://')) return 'HTTPS';
  if (host.startsWith('http://')) return 'HTTP';
  return null;
});

// Bumped by the header's Sync button — remounts the active tab component so it reloads.
const refreshKey = ref(0);

// ---------------------------------------------------------------------------
// Overview — stat cards
// ---------------------------------------------------------------------------

const overviewTokens = ref<TokenSummary[]>([]);
const runs = ref<PipelineRun[]>([]);
const mfaEnabled = ref<boolean | null>(null);
const overviewLoading = ref(false);

async function loadOverview() {
  if (!isActive.value || !connection.value) return;
  overviewLoading.value = true;
  try {
    // allSettled — one failing endpoint shouldn't blank the other cards.
    const [tokens, audit, mfa] = await Promise.allSettled([
      serverCall(SEND.SERVER_TOKEN_LIST),
      serverCall(SEND.SERVER_PIPELINE_AUDIT_LIST, { limit: 500 }),
      serverCall(SEND.SERVER_MFA_STATUS),
      isAdmin.value ? loadUsers() : Promise.resolve(),
    ]);
    if (tokens.status === 'fulfilled') overviewTokens.value = tokens.value.tokens;
    if (audit.status === 'fulfilled') runs.value = audit.value;
    if (mfa.status === 'fulfilled') mfaEnabled.value = mfa.value.enabled;
  } finally {
    overviewLoading.value = false;
  }
}

const activeApiTokens = computed(() =>
  overviewTokens.value.filter(
    (t) => t.kind === 'api' && !t.revoked_at && !(t.expires_at && new Date(t.expires_at) < new Date())
  )
);
const expiringSoon = computed(
  () =>
    activeApiTokens.value.filter(
      (t) => t.expires_at && new Date(t.expires_at).getTime() - Date.now() <= 14 * 86400000
    ).length
);

const activeMembers = computed(() => users.value.filter((u) => u.is_active).length);
const inactiveMembers = computed(() => users.value.length - activeMembers.value);

const WEEK_MS = 7 * 86400000;
const runsThisWeek = computed(
  () => runs.value.filter((r) => Date.now() - new Date(r.triggered_at).getTime() < WEEK_MS).length
);
const runsLastWeek = computed(
  () =>
    runs.value.filter((r) => {
      const age = Date.now() - new Date(r.triggered_at).getTime();
      return age >= WEEK_MS && age < 2 * WEEK_MS;
    }).length
);
const runsTrend = computed(() => {
  const cur = runsThisWeek.value;
  const prev = runsLastWeek.value;
  if (prev === 0) return cur > 0 ? 'No runs the week before' : 'No runs in the last 2 weeks';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return 'Same as last week';
  return `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}% vs last week`;
});

const lastRun = computed(() => runs.value[0] ?? null);
const lastRunNote = computed(() => {
  const r = lastRun.value;
  if (!r) return 'No workflow runs yet';
  const who = r.triggered_by_name ?? capitalize(r.triggered_by_type);
  return `${who} · ran "${r.task_identifier}"${r.status === 'error' ? ' (failed)' : ''}`;
});

function sync() {
  refreshKey.value++;
  loadOverview();
  if (tab.value === 'users' && isAdmin.value) loadUsers();
}

function openInvite() {
  inviteError.value = '';
  showInviteModal.value = true;
}

// ---------------------------------------------------------------------------
// Overview — connection edit modal (name + host)
// ---------------------------------------------------------------------------

const showConnectionModal = ref(false);
const editName = ref('');
const editHost = ref('');
const editLoading = ref(false);
const editError = ref('');

function openConnectionModal() {
  if (!connection.value) return;
  editName.value = connection.value.name;
  editHost.value = connection.value.host;
  editError.value = '';
  showConnectionModal.value = true;
}

async function saveWorkspace() {
  editError.value = '';
  if (!editName.value.trim() || !editHost.value.trim()) {
    editError.value = t('connections.allRequired');
    return;
  }
  const conn = connection.value;
  if (!conn) return;
  editLoading.value = true;
  try {
    await store.update(conn.id, editName.value.trim(), editHost.value.trim(), conn.token);
    if (isActive.value) {
      await store.setActive(conn.id);
    }
    showConnectionModal.value = false;
    toast.success(t('connections.overview.savedConnection'));
  } catch (e: any) {
    editError.value = e?.message ?? 'Save failed.';
  } finally {
    editLoading.value = false;
  }
}

const showDeleteAlert = ref(false);
const deleting = ref(false);

async function confirmDeleteWorkspace() {
  const conn = connection.value;
  if (!conn) return;
  deleting.value = true;
  try {
    await store.remove(conn.id);
    showDeleteAlert.value = false;
    router.push('/settings/workspaces');
  } catch (e: any) {
    toast.error(t('connections.overview.deleteFailed'), { description: e?.message });
  } finally {
    deleting.value = false;
  }
}

async function setActive() {
  const conn = connection.value;
  if (!conn) return;
  try {
    await store.setActive(conn.id);
  } catch (err: any) {
    toast.error(t('workspace.switchFailed'), {
      description: err?.message ?? t('workspace.unreachable'),
    });
  }
}

async function switchLocal() {
  await store.setActive(null);
}

// ---------------------------------------------------------------------------
// Overview — edit profile modal
// ---------------------------------------------------------------------------

const showProfileModal = ref(false);
const profileName = ref('');
const profileLoading = ref(false);
const profileError = ref('');

function openProfileModal() {
  if (!store.serverMe) return;
  profileName.value = store.serverMe.name;
  profileError.value = '';
  showProfileModal.value = true;
}

async function updateProfile() {
  if (!profileName.value.trim() || !connection.value || !store.serverMe) return;
  profileLoading.value = true;
  profileError.value = '';
  try {
    await window.ipcRenderer.invoke(SEND.SERVER_USER_UPDATE, {
      host: connection.value.host,
      token: connection.value.token,
      id: store.serverMe.id,
      name: profileName.value.trim(),
    });
    await store.loadServerContext();
    showProfileModal.value = false;
  } catch (e: any) {
    profileError.value = e?.message ?? 'Update failed.';
  } finally {
    profileLoading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Overview — update credentials modal
// ---------------------------------------------------------------------------

const showCredentialsModal = ref(false);
const credEmail = ref('');
const credPassword = ref('');
const credLoading = ref(false);
const credError = ref('');
const credMfaChallengeId = ref('');
const credMfaCode = ref('');

function openCredentialsModal() {
  credEmail.value = '';
  credPassword.value = '';
  credError.value = '';
  credMfaChallengeId.value = '';
  credMfaCode.value = '';
  showCredentialsModal.value = true;
}

async function finishCredLogin(token: string) {
  const conn = connection.value;
  if (!conn) return;
  await store.update(conn.id, conn.name, conn.host, token);
  if (isActive.value) {
    await store.setActive(conn.id);
  }
  showCredentialsModal.value = false;
  toast.success(t('connections.overview.reconnect'));
}

async function loginToServer() {
  credError.value = '';
  if (!credEmail.value.trim() || !credPassword.value.trim()) {
    credError.value = t('connections.allRequired');
    return;
  }
  const conn = connection.value;
  if (!conn) return;
  credLoading.value = true;
  try {
    const result = await window.ipcRenderer.invoke(SEND.SERVER_LOGIN, {
      host: conn.host,
      email: credEmail.value.trim(),
      password: credPassword.value.trim(),
    });
    if (result.mfaRequired) {
      credMfaChallengeId.value = result.challengeId;
      return;
    }
    await finishCredLogin(result.token);
  } catch (e: any) {
    credError.value = e?.message ?? 'Login failed.';
  } finally {
    credLoading.value = false;
  }
}

async function submitCredMfa() {
  credError.value = '';
  if (!credMfaCode.value.trim()) return;
  const conn = connection.value;
  if (!conn) return;
  credLoading.value = true;
  try {
    const token = await window.ipcRenderer.invoke(SEND.SERVER_LOGIN_MFA, {
      host: conn.host,
      challengeId: credMfaChallengeId.value,
      code: credMfaCode.value.trim(),
    });
    await finishCredLogin(token);
  } catch (e: any) {
    credError.value = e?.message ?? 'Invalid code.';
  } finally {
    credLoading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

const users = ref<ServerUser[]>([]);
const currentUserId = ref<string | null>(null);
const usersLoading = ref(false);
const usersError = ref('');
const showEditModal = ref(false);
const editingUser = ref<ServerUser | null>(null);
const editingName = ref('');
const editingLoading = ref(false);

// Invite modal
const showInviteModal = ref(false);
const inviteLoading = ref(false);
const inviteError = ref('');
const inviteName = ref('');
const inviteEmail = ref('');
const invitePassword = ref('');
const inviteRole = ref('editor');

async function serverCall(channel: string, args: Record<string, any> = {}) {
  const conn = connection.value;
  if (!conn) throw new Error('No connection');
  return window.ipcRenderer.invoke(channel, { host: conn.host, token: conn.token, ...args });
}

async function loadUsers() {
  if (!connection.value) return;
  usersLoading.value = true;
  usersError.value = '';
  try {
    const [list, me] = await Promise.all([
      serverCall(SEND.SERVER_USERS_LIST),
      serverCall(SEND.SERVER_ME),
    ]);
    users.value = list;
    currentUserId.value = me?.id ?? null;
  } catch (e: any) {
    usersError.value = e?.message ?? 'Failed to load users';
  } finally {
    usersLoading.value = false;
  }
}

function startEdit(user: ServerUser) {
  editingUser.value = user;
  editingName.value = user.name;
  showEditModal.value = true;
}

function cancelEdit() {
  showEditModal.value = false;
  editingUser.value = null;
  editingName.value = '';
}

async function saveEdit() {
  if (!editingUser.value || !editingName.value.trim()) return;
  editingLoading.value = true;
  usersError.value = '';
  try {
    const updated = await serverCall(SEND.SERVER_USER_UPDATE, { id: editingUser.value.id, name: editingName.value.trim() });
    const idx = users.value.findIndex((u) => u.id === editingUser.value!.id);
    if (idx !== -1) users.value[idx] = updated;
    showEditModal.value = false;
    editingUser.value = null;
  } catch (e: any) {
    usersError.value = e?.message ?? 'Update failed';
  } finally {
    editingLoading.value = false;
  }
}

async function inviteUser() {
  if (!inviteName.value.trim() || !inviteEmail.value.trim() || !invitePassword.value.trim()) {
    inviteError.value = t('users.allRequired');
    return;
  }
  inviteLoading.value = true;
  inviteError.value = '';
  try {
    const user = await serverCall(SEND.SERVER_USER_CREATE, {
      name: inviteName.value.trim(),
      email: inviteEmail.value.trim(),
      password: invitePassword.value.trim(),
      role: inviteRole.value,
    });
    // Invite is reachable from the header on any tab, so the list may not be loaded yet.
    if (users.value.length > 0) users.value.push(user);
    else await loadUsers();
    inviteName.value = '';
    inviteEmail.value = '';
    invitePassword.value = '';
    inviteRole.value = 'editor';
    showInviteModal.value = false;
  } catch (e: any) {
    inviteError.value = e?.message ?? 'Failed to create user';
  } finally {
    inviteLoading.value = false;
  }
}

async function toggleActive(user: ServerUser) {
  usersError.value = '';
  try {
    const updated = await serverCall(SEND.SERVER_USER_UPDATE, {
      id: user.id,
      is_active: user.is_active ? 0 : 1,
    });
    const idx = users.value.findIndex((u) => u.id === user.id);
    if (idx !== -1) users.value[idx] = updated;
  } catch (e: any) {
    usersError.value = e?.message ?? 'Update failed';
  }
}

async function changeRole(user: ServerUser, role: string) {
  usersError.value = '';
  try {
    const updated = await serverCall(SEND.SERVER_USER_UPDATE, { id: user.id, role });
    const idx = users.value.findIndex((u) => u.id === user.id);
    if (idx !== -1) users.value[idx] = updated;
  } catch (e: any) {
    usersError.value = e?.message ?? 'Update failed';
  }
}

watch(tab, (val) => {
  if (val === 'users' && users.value.length === 0) loadUsers();
});

// isAdmin resolves after serverMe loads, so re-run when it flips to include the member count.
watch(
  () => [connection.value?.id, isActive.value, isAdmin.value],
  () => loadOverview(),
  { immediate: true }
);

onMounted(() => store.load());
</script>

<template>
  <Page scrollable>
    <template #title>
      <span class="align-middle">{{ connection?.name ?? '—' }}</span>
      <span
        v-if="connection"
        class="ml-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 align-middle text-[11.5px] font-medium tracking-normal"
        :class="isActive ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'"
      >
        <span class="h-1.5 w-1.5 rounded-full" :class="isActive ? 'bg-green-500' : 'bg-muted-foreground'" />
        {{ isActive ? t('connections.overview.activeStatus') : t('connections.overview.inactiveStatus') }}
      </span>
    </template>

    <template v-if="connection" #nav>
      <p class="text-[13.5px] text-muted-foreground">
        <span class="font-mono text-[12.5px]">{{ connection.host }}</span>
        <template v-if="isActive && store.serverMe">
          · {{ t('connections.overview.signedInAs') }} {{ store.serverMe.name }} ({{ store.serverMe.role }})
        </template>
      </p>
    </template>

    <template v-if="connection" #menu>
      <template v-if="isActive">
        <button :class="btnClass" :disabled="overviewLoading" @click="sync">
          <RefreshCw :class="{ 'animate-spin': overviewLoading }" />
          Sync
        </button>
        <button :class="btnClass" :disabled="store.isSwitching" @click="switchLocal">
          {{ t('connections.overview.switchLocal') }}
        </button>
        <button v-if="isAdmin" :class="btnPrimaryClass" @click="openInvite">
          <Plus />
          Invite member
        </button>
      </template>
      <button v-else :class="btnPrimaryClass" :disabled="store.isSwitching" @click="setActive">
        {{ t('connections.overview.setActive') }}
      </button>
    </template>

    <template #content>
      <div v-if="!connection" class="text-sm text-muted-foreground py-4">
        {{ t('connections.notFound') }}
      </div>

      <div v-else class="max-w-6xl">
        <!-- Tabs -->
        <div class="flex gap-0.5 border-b mt-2 mb-6 overflow-x-auto">
          <button
            v-for="t_tab in availableTabs"
            :key="t_tab"
            class="px-3.5 py-2 text-[13.5px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
            :class="tab === t_tab
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'"
            @click="tab = t_tab"
          >
            {{ t(`connections.tabs.${t_tab}`) }}
          </button>
        </div>

        <!-- ---------------------------------------------------------------- -->
        <!-- OVERVIEW TAB                                                      -->
        <!-- ---------------------------------------------------------------- -->
        <div v-if="tab === 'overview'" class="space-y-4">
          <WsNote v-if="!isActive">
            Set this workspace as active to manage its <b>users, sessions, tokens, roles, security, and webhooks</b>.
            <template #action>
              <button :class="btnClass" :disabled="store.isSwitching" @click="setActive">
                {{ t('connections.overview.setActive') }}
              </button>
            </template>
          </WsNote>

          <!-- Stat cards -->
          <div v-if="isActive" class="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <WsStat
              v-if="isAdmin"
              label="Members"
              :value="overviewLoading && !users.length ? '…' : activeMembers"
              :note="inactiveMembers ? `${inactiveMembers} inactive` : 'All active'"
            />
            <WsStat
              v-else
              label="Your role"
              :value="capitalize(store.serverMe?.role ?? '—')"
              :note="store.serverMe?.email"
            />
            <WsStat
              :label="isAdmin ? 'Active API tokens' : 'Your API tokens'"
              :value="overviewLoading && !overviewTokens.length ? '…' : activeApiTokens.length"
              :note="expiringSoon ? `${expiringSoon} expiring soon` : 'None expiring soon'"
            />
            <WsStat
              label="Workflows run (7d)"
              :value="overviewLoading && !runs.length ? '…' : runsThisWeek"
              :note="runsTrend"
            />
            <WsStat
              label="Last activity"
              small
              :value="lastRun ? relTime(lastRun.triggered_at) : '—'"
              :note="lastRunNote"
            />
          </div>

          <!-- Your account -->
          <WsCard
            v-if="isActive"
            title="Your account"
            description="How you're signed in to this workspace"
            body-class="px-4 py-1.5"
          >
            <template #actions>
              <button :class="btnClass" :disabled="!store.serverMe" @click="openProfileModal">
                {{ t('connections.overview.editProfile') }}
              </button>
              <button :class="btnClass" @click="openCredentialsModal">
                {{ t('connections.authForm.update') }} {{ t('connections.authForm.heading').toLowerCase() }}
              </button>
            </template>
            <template #body>
              <p v-if="store.serverContextError" class="py-2.5 text-sm text-destructive">
                {{ t('connections.overview.sessionLoadFailed') }}
              </p>
              <table v-else :class="detailTableClass">
                <tbody>
                  <tr>
                    <td>Member</td>
                    <td>
                      <div v-if="store.serverMe" class="flex items-center gap-2.5">
                        <div :class="avatarClass">{{ initials(store.serverMe.name) }}</div>
                        <div class="min-w-0">
                          <div class="font-medium">{{ store.serverMe.name }}</div>
                          <div class="text-xs text-muted-foreground">{{ store.serverMe.email }}</div>
                        </div>
                      </div>
                      <span v-else class="text-muted-foreground">—</span>
                    </td>
                  </tr>
                  <tr>
                    <td>Role</td>
                    <td>
                      <span v-if="store.serverMe" :class="roleBadgeClass(store.serverMe.role)">
                        <Shield v-if="store.serverMe.role === 'admin'" />
                        {{ t(`users.roles.${store.serverMe.role}`) }}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Two-factor</td>
                    <td>
                      <div class="flex items-center gap-3">
                        <WsStatus v-if="mfaEnabled !== null" :tone="mfaEnabled ? 'ok' : 'warn'">
                          {{ mfaEnabled ? 'Enabled' : 'Not enabled' }}
                        </WsStatus>
                        <span v-else class="text-muted-foreground">—</span>
                        <button
                          class="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          @click="tab = 'security'"
                        >
                          Manage
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Password</td>
                    <td class="text-muted-foreground">••••••••</td>
                  </tr>
                </tbody>
              </table>
            </template>
          </WsCard>

          <!-- Connection details -->
          <WsCard
            title="Connection details"
            description="How this desktop reaches the workspace server"
            body-class="px-4 py-1.5"
          >
            <template #actions>
              <button v-if="!isActive" :class="btnClass" @click="openCredentialsModal">
                {{ t('connections.authForm.update') }} {{ t('connections.authForm.heading').toLowerCase() }}
              </button>
              <button :class="btnClass" @click="openConnectionModal">
                <Pencil />
                {{ t('common.edit') }}
              </button>
            </template>
            <template #body>
              <table :class="detailTableClass">
                <tbody>
                  <tr>
                    <td>Name</td>
                    <td class="font-medium">{{ connection.name }}</td>
                  </tr>
                  <tr>
                    <td>Host</td>
                    <td class="font-mono text-[12.5px] break-all">{{ connection.host }}</td>
                  </tr>
                  <tr>
                    <td>{{ t('connections.overview.activeLabel') }}</td>
                    <td>
                      <WsStatus :tone="isActive ? 'ok' : 'off'">
                        {{ isActive ? t('connections.overview.activeStatus') : t('connections.overview.inactiveStatus') }}
                      </WsStatus>
                    </td>
                  </tr>
                  <tr v-if="transport">
                    <td>Transport</td>
                    <td>{{ transport }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
          </WsCard>

          <!-- Danger zone -->
          <WsCard title="Danger zone" :description="t('connections.deleteAlert.description')">
            <template #actions>
              <button :class="btnDangerClass" @click="showDeleteAlert = true">
                {{ t('connections.overview.delete') }}
              </button>
            </template>
          </WsCard>
        </div>

        <!-- ---------------------------------------------------------------- -->
        <!-- SESSIONS TAB                                                      -->
        <!-- ---------------------------------------------------------------- -->
        <SessionsTab
          v-else-if="tab === 'sessions'"
          :key="`sessions-${refreshKey}`"
          :host="connection.host"
          :token="connection.token"
        />

        <!-- ---------------------------------------------------------------- -->
        <!-- TOKENS TAB                                                        -->
        <!-- ---------------------------------------------------------------- -->
        <TokensTab
          v-else-if="tab === 'tokens'"
          :key="`tokens-${refreshKey}`"
          :host="connection.host"
          :token="connection.token"
          :current-role="store.serverMe?.role ?? 'viewer'"
        />

        <!-- ---------------------------------------------------------------- -->
        <!-- ROLES TAB                                                         -->
        <!-- ---------------------------------------------------------------- -->
        <RolesTab
          v-else-if="tab === 'roles'"
          :key="`roles-${refreshKey}`"
          :host="connection.host"
          :token="connection.token"
        />

        <!-- ---------------------------------------------------------------- -->
        <!-- SECURITY TAB                                                      -->
        <!-- ---------------------------------------------------------------- -->
        <SecurityTab
          v-else-if="tab === 'security'"
          :key="`security-${refreshKey}`"
          :host="connection.host"
          :token="connection.token"
          :is-admin="isAdmin"
        />

        <!-- ---------------------------------------------------------------- -->
        <!-- WEBHOOKS TAB                                                      -->
        <!-- ---------------------------------------------------------------- -->
        <WebhooksTab
          v-else-if="tab === 'webhooks'"
          :key="`webhooks-${refreshKey}`"
          :host="connection.host"
          :token="connection.token"
        />

        <!-- ---------------------------------------------------------------- -->
        <!-- AUDIT LOG TAB                                                     -->
        <!-- ---------------------------------------------------------------- -->
        <AuditLogTab
          v-else-if="tab === 'audit'"
          :key="`audit-${refreshKey}`"
          :host="connection.host"
          :token="connection.token"
        />

        <!-- ---------------------------------------------------------------- -->
        <!-- USERS TAB                                                         -->
        <!-- ---------------------------------------------------------------- -->
        <div v-else-if="tab === 'users'" class="space-y-4">
          <div v-if="usersError" class="text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
            {{ usersError }}
          </div>

          <WsCard title="Members" description="Who has access to this workspace">
            <template #actions>
              <button v-if="isAdmin" :class="btnPrimaryClass" @click="openInvite">
                <Plus />
                {{ t('users.invite') }}
              </button>
            </template>

            <div v-if="usersLoading && users.length === 0" class="py-6 text-center text-sm text-muted-foreground">
              {{ t('common.loading') }}
            </div>
            <p v-else-if="users.length === 0" class="py-6 text-center text-sm text-muted-foreground">
              {{ t('users.empty') }}
            </p>
            <div v-else class="overflow-x-auto">
              <table :class="tableClass">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="user in users" :key="user.id" :class="{ 'opacity-60': !user.is_active }">
                    <td>
                      <div class="flex items-center gap-2.5">
                        <div :class="avatarClass">{{ initials(user.name) }}</div>
                        <div class="min-w-0">
                          <div class="font-medium flex items-center gap-1.5">
                            {{ user.name }}
                            <span v-if="user.id === currentUserId" class="text-xs text-muted-foreground font-normal">
                              {{ t('users.you') }}
                            </span>
                          </div>
                          <div class="text-xs text-muted-foreground">{{ user.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Select
                        v-if="isAdmin && user.id !== currentUserId"
                        :model-value="user.role"
                        @update:model-value="(v) => v && changeRole(user, v as string)"
                      >
                        <SelectTrigger class="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{{ t('users.roles.admin') }}</SelectItem>
                          <SelectItem value="editor">{{ t('users.roles.editor') }}</SelectItem>
                          <SelectItem value="viewer">{{ t('users.roles.viewer') }}</SelectItem>
                        </SelectContent>
                      </Select>
                      <span v-else :class="roleBadgeClass(user.role)">
                        <Shield v-if="user.role === 'admin'" />
                        {{ t(`users.roles.${user.role}`) }}
                      </span>
                    </td>
                    <td>
                      <WsStatus :tone="user.is_active ? 'ok' : 'off'">
                        {{ user.is_active ? 'Active' : 'Inactive' }}
                      </WsStatus>
                    </td>
                    <td class="text-muted-foreground">{{ shortDate(user.created_at) }}</td>
                    <td>
                      <div class="flex justify-end gap-1.5">
                        <button :class="iconBtnClass" :title="t('common.edit')" @click="startEdit(user)">
                          <Pencil />
                        </button>
                        <button
                          v-if="isAdmin"
                          :class="user.is_active ? iconBtnDangerClass : iconBtnClass"
                          :disabled="user.id === currentUserId"
                          :title="user.is_active ? t('users.deactivate') : t('users.activate')"
                          @click="toggleActive(user)"
                        >
                          <UserX v-if="user.is_active" />
                          <UserCheck v-else />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </WsCard>
        </div>
      </div>
    </template>
  </Page>

  <!-- Delete workspace confirmation -->
  <AlertDialog v-model:open="showDeleteAlert">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('connections.deleteAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('connections.deleteAlert.description') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="deleting">{{ t('connections.deleteAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction :disabled="deleting" @click="confirmDeleteWorkspace">
          {{ t('connections.deleteAlert.delete') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <!-- Edit connection modal -->
  <Dialog :open="showConnectionModal" @update:open="showConnectionModal = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('connections.editForm.heading') }}</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('connections.newForm.nameLabel') }}</label>
          <input
            v-model="editName"
            :placeholder="t('connections.newForm.namePlaceholder')"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('connections.newForm.hostLabel') }}</label>
          <input
            v-model="editHost"
            :placeholder="t('connections.newForm.hostPlaceholder')"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            @keyup.enter="saveWorkspace"
          />
        </div>
        <p v-if="editError" class="text-sm text-destructive">{{ editError }}</p>
      </div>
      <DialogFooter>
        <button
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="editLoading"
          @click="showConnectionModal = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="editLoading"
          @click="saveWorkspace"
        >
          {{ editLoading ? t('connections.editForm.saving') : t('connections.editForm.save') }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Edit profile modal -->
  <Dialog :open="showProfileModal" @update:open="showProfileModal = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('connections.overview.editProfile') }}</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('common.name') }}</label>
          <input
            v-model="profileName"
            :placeholder="t('common.name')"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            @keyup.enter="updateProfile"
          />
        </div>
        <p v-if="profileError" class="text-sm text-destructive">{{ profileError }}</p>
      </div>
      <DialogFooter>
        <button
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="profileLoading"
          @click="showProfileModal = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="profileLoading"
          @click="updateProfile"
        >
          {{ profileLoading ? t('common.saving') : t('common.save') }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Update credentials modal -->
  <Dialog :open="showCredentialsModal" @update:open="showCredentialsModal = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('connections.authForm.heading') }}</DialogTitle>
      </DialogHeader>
      <div v-if="!credMfaChallengeId" class="space-y-3 py-2">
        <p class="text-sm text-muted-foreground">{{ t('connections.authForm.hint') }}</p>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('connections.newForm.emailLabel') }}</label>
          <input
            v-model="credEmail"
            type="email"
            :placeholder="t('connections.newForm.emailPlaceholder')"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('connections.newForm.passwordLabel') }}</label>
          <input
            v-model="credPassword"
            type="password"
            :placeholder="t('connections.newForm.passwordPlaceholder')"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            @keyup.enter="loginToServer"
          />
        </div>
        <p v-if="credError" class="text-sm text-destructive">{{ credError }}</p>
      </div>

      <div v-else class="space-y-3 py-2">
        <p class="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">Verification code</label>
          <input
            v-model="credMfaCode"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
            @keyup.enter="submitCredMfa"
          />
        </div>
        <p v-if="credError" class="text-sm text-destructive">{{ credError }}</p>
      </div>

      <DialogFooter>
        <button
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="credLoading"
          @click="showCredentialsModal = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          v-if="!credMfaChallengeId"
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="credLoading"
          @click="loginToServer"
        >
          {{ credLoading ? t('connections.authForm.logging') : t('connections.authForm.login') }}
        </button>
        <button
          v-else
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="credLoading"
          @click="submitCredMfa"
        >
          {{ credLoading ? t('connections.authForm.logging') : 'Verify' }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Invite user modal -->
  <Dialog :open="showInviteModal" @update:open="showInviteModal = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('users.newForm.heading') }}</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('common.name') }}</label>
          <input
            v-model="inviteName"
            :placeholder="t('users.newForm.namePlaceholder')"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">Email</label>
          <input
            v-model="inviteEmail"
            type="email"
            :placeholder="t('users.newForm.emailPlaceholder')"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('connections.newForm.passwordLabel') }}</label>
          <input
            v-model="invitePassword"
            type="password"
            :placeholder="t('users.newForm.passwordPlaceholder')"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('users.newForm.role') }}</label>
          <Select v-model="inviteRole">
            <SelectTrigger class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">{{ t('users.roles.admin') }}</SelectItem>
              <SelectItem value="editor">{{ t('users.roles.editor') }}</SelectItem>
              <SelectItem value="viewer">{{ t('users.roles.viewer') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p v-if="inviteError" class="text-sm text-destructive">{{ inviteError }}</p>
      </div>
      <DialogFooter>
        <button
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="inviteLoading"
          @click="showInviteModal = false; inviteError = ''"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="inviteLoading"
          @click="inviteUser"
        >
          {{ inviteLoading ? t('users.newForm.adding') : t('users.newForm.add') }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Edit user modal -->
  <Dialog :open="showEditModal" @update:open="showEditModal = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('common.edit') }} {{ editingUser?.name }}</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('common.name') }}</label>
          <input
            v-model="editingName"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            :placeholder="t('common.name')"
            @keyup.enter="saveEdit"
            @keyup.escape="cancelEdit"
          />
        </div>
        <p v-if="usersError" class="text-sm text-destructive">{{ usersError }}</p>
      </div>
      <DialogFooter>
        <button
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="editingLoading"
          @click="cancelEdit"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="editingLoading"
          @click="saveEdit"
        >
          {{ editingLoading ? t('common.saving') : t('common.save') }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
