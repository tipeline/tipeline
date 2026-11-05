<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { LogOut } from 'lucide-vue-next';
import WsCard from '@/components/workspace/ui/WsCard.vue';
import WsStatus from '@/components/workspace/ui/WsStatus.vue';
import {
  tableClass,
  iconBtnDangerClass,
  avatarClass,
  successBadgeClass,
  initials,
  relTime,
  shortDate,
} from '@/components/workspace/ui/styles';
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
import { SEND } from '@/ipc-channels';

interface TokenRecord {
  id: string;
  user_id: string;
  name: string;
  scope: string;
  kind: 'session' | 'api';
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by_email?: string;
  created_by_name?: string;
}

const props = defineProps<{ host: string; token: string }>();

const tokens = ref<TokenRecord[]>([]);
const currentTokenId = ref<string | null>(null);
const loading = ref(false);
const error = ref('');
const revokingId = ref<string | null>(null);
const confirmRevokeCurrent = ref<TokenRecord | null>(null);

const sessions = computed(() => tokens.value.filter((t) => t.kind === 'session'));

async function serverCall(channel: string, args: Record<string, any> = {}) {
  return window.ipcRenderer.invoke(channel, { host: props.host, token: props.token, ...args });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await serverCall(SEND.SERVER_TOKEN_LIST);
    tokens.value = result.tokens;
    currentTokenId.value = result.currentTokenId;
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load sessions';
  } finally {
    loading.value = false;
  }
}

async function doRevoke(t: TokenRecord) {
  revokingId.value = t.id;
  try {
    const record = await serverCall(SEND.SERVER_TOKEN_REVOKE, { id: t.id });
    const idx = tokens.value.findIndex((x) => x.id === t.id);
    if (idx !== -1) tokens.value[idx] = { ...tokens.value[idx], revoked_at: record.revoked_at };
  } catch (e: any) {
    error.value = e?.message ?? 'Revoke failed';
  } finally {
    revokingId.value = null;
  }
}

function revokeSession(t: TokenRecord) {
  if (t.id === currentTokenId.value) {
    confirmRevokeCurrent.value = t;
    return;
  }
  doRevoke(t);
}

async function confirmRevokeCurrentSession() {
  if (!confirmRevokeCurrent.value) return;
  await doRevoke(confirmRevokeCurrent.value);
  confirmRevokeCurrent.value = null;
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
      {{ error }}
    </div>

    <WsCard
      title="Sessions"
      description="One entry per sign-in, created automatically — sign one out to revoke that device"
    >
      <div v-if="loading" class="py-6 text-center text-sm text-muted-foreground">Loading…</div>
      <p v-else-if="sessions.length === 0" class="py-6 text-center text-sm text-muted-foreground">
        No active sessions.
      </p>
      <div v-else class="overflow-x-auto">
        <table :class="tableClass">
          <thead>
            <tr>
              <th>Member</th>
              <th>Status</th>
              <th>Signed in</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in sessions" :key="t.id" :class="{ 'opacity-60': t.revoked_at }">
              <td>
                <div class="flex items-center gap-2.5">
                  <div :class="avatarClass">{{ initials(t.created_by_name ?? t.created_by_email) }}</div>
                  <div class="min-w-0">
                    <div class="font-medium flex items-center gap-2">
                      {{ t.created_by_name ?? t.created_by_email ?? 'Session' }}
                      <span v-if="t.id === currentTokenId" :class="successBadgeClass">This device</span>
                    </div>
                    <div class="text-xs text-muted-foreground">{{ t.created_by_email }}</div>
                  </div>
                </div>
              </td>
              <td>
                <WsStatus :tone="t.revoked_at ? 'off' : 'ok'">{{ t.revoked_at ? 'Revoked' : 'Active' }}</WsStatus>
              </td>
              <td class="text-muted-foreground">{{ shortDate(t.created_at) }}</td>
              <td class="text-muted-foreground">{{ relTime(t.last_used_at) }}</td>
              <td>
                <div class="flex justify-end">
                  <button
                    :class="iconBtnDangerClass"
                    :disabled="!!t.revoked_at || revokingId === t.id"
                    title="Sign out"
                    @click="revokeSession(t)"
                  >
                    <LogOut />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </WsCard>
  </div>

  <!-- Confirm revoking the session currently in use -->
  <AlertDialog :open="!!confirmRevokeCurrent" @update:open="(v) => !v && (confirmRevokeCurrent = null)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Sign out this device?</AlertDialogTitle>
        <AlertDialogDescription>
          This is the session you're currently using. Revoking it will sign you out of this workspace right away.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="confirmRevokeCurrentSession">Sign out</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
