<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Plus, RotateCcw, X, Copy, Check } from 'lucide-vue-next';
import WsCard from '@/components/workspace/ui/WsCard.vue';
import WsNote from '@/components/workspace/ui/WsNote.vue';
import WsStatus from '@/components/workspace/ui/WsStatus.vue';
import {
  tableClass,
  btnPrimaryClass,
  iconBtnClass,
  iconBtnDangerClass,
  roleBadgeClass,
  capitalize,
  relTime,
  shortDate,
} from '@/components/workspace/ui/styles';
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

const props = defineProps<{ host: string; token: string; currentRole: string }>();

const ROLE_RANK: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };
const scopeOptions = computed(() =>
  (['admin', 'editor', 'viewer'] as const).filter((r) => ROLE_RANK[r] <= (ROLE_RANK[props.currentRole] ?? 0))
);

const tokens = ref<TokenRecord[]>([]);
const loading = ref(false);
const error = ref('');

const apiTokens = computed(() => tokens.value.filter((t) => t.kind === 'api'));

const showCreateModal = ref(false);
const createLoading = ref(false);
const createError = ref('');
const createName = ref('');
const createScope = ref('viewer');
const createExpiry = ref('90d');
const revealedToken = ref<{ id: string; raw: string } | null>(null);

const rotatingId = ref<string | null>(null);
const revokingId = ref<string | null>(null);
const copied = ref(false);

async function serverCall(channel: string, args: Record<string, any> = {}) {
  return window.ipcRenderer.invoke(channel, { host: props.host, token: props.token, ...args });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await serverCall(SEND.SERVER_TOKEN_LIST);
    tokens.value = result.tokens;
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load tokens';
  } finally {
    loading.value = false;
  }
}

function openCreateModal() {
  createName.value = '';
  createScope.value = scopeOptions.value[scopeOptions.value.length - 1] ?? 'viewer';
  createExpiry.value = '90d';
  createError.value = '';
  showCreateModal.value = true;
}

async function createToken() {
  if (!createName.value.trim()) {
    createError.value = 'Name is required';
    return;
  }
  createLoading.value = true;
  createError.value = '';
  try {
    const result = await serverCall(SEND.SERVER_TOKEN_CREATE, {
      name: createName.value.trim(),
      scope: createScope.value,
      expiresIn: createExpiry.value === 'never' ? null : createExpiry.value,
    });
    const { token: raw, ...record } = result;
    tokens.value.unshift(record);
    revealedToken.value = { id: record.id, raw };
    showCreateModal.value = false;
  } catch (e: any) {
    createError.value = e?.message ?? 'Failed to create token';
  } finally {
    createLoading.value = false;
  }
}

async function rotateToken(t: TokenRecord) {
  rotatingId.value = t.id;
  revealedToken.value = null;
  try {
    const result = await serverCall(SEND.SERVER_TOKEN_ROTATE, { id: t.id });
    const { token: raw, ...record } = result;
    const idx = tokens.value.findIndex((x) => x.id === t.id);
    if (idx !== -1) tokens.value[idx] = record;
    revealedToken.value = { id: t.id, raw };
  } catch (e: any) {
    error.value = e?.message ?? 'Rotate failed';
  } finally {
    rotatingId.value = null;
  }
}

async function revokeToken(t: TokenRecord) {
  revokingId.value = t.id;
  try {
    const record = await serverCall(SEND.SERVER_TOKEN_REVOKE, { id: t.id });
    const idx = tokens.value.findIndex((x) => x.id === t.id);
    if (idx !== -1) tokens.value[idx] = { ...tokens.value[idx], revoked_at: record.revoked_at };
    if (revealedToken.value?.id === t.id) revealedToken.value = null;
  } catch (e: any) {
    error.value = e?.message ?? 'Revoke failed';
  } finally {
    revokingId.value = null;
  }
}

async function copyToken() {
  if (!revealedToken.value) return;
  await navigator.clipboard.writeText(revealedToken.value.raw);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

function statusOf(t: TokenRecord): { label: string; tone: 'ok' | 'off' | 'warn' | 'bad' } {
  if (t.revoked_at) return { label: 'Revoked', tone: 'off' };
  if (t.expires_at && new Date(t.expires_at) < new Date()) return { label: 'Expired', tone: 'bad' };
  if (t.expires_at) {
    const daysLeft = Math.ceil((new Date(t.expires_at).getTime() - Date.now()) / 86400000);
    const label = `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    return { label, tone: daysLeft <= 14 ? 'warn' : 'ok' };
  }
  return { label: 'Never', tone: 'off' };
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
      {{ error }}
    </div>

    <WsNote>
      Named, scoped, revocable tokens for scripts, CI pipelines, and integrations — not tied to a login session.
    </WsNote>

    <!-- Revealed secret — only shown once, right after create/rotate -->
    <div v-if="revealedToken" class="border border-green-500/30 bg-green-500/5 rounded-lg p-4 space-y-2">
      <p class="text-sm font-medium text-green-700 dark:text-green-400">
        Copy this token now — it won't be shown again
      </p>
      <div class="flex items-center gap-2">
        <code class="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded break-all">{{ revealedToken.raw }}</code>
        <button :class="iconBtnClass" title="Copy" @click="copyToken">
          <Check v-if="copied" class="text-green-600" />
          <Copy v-else />
        </button>
        <button :class="iconBtnClass" title="Dismiss" @click="revealedToken = null">
          <X />
        </button>
      </div>
    </div>

    <WsCard title="Tokens" description="Credentials used by the CLI, integrations, and CI pipelines">
      <template #actions>
        <button :class="btnPrimaryClass" @click="openCreateModal">
          <Plus />
          New token
        </button>
      </template>

      <div v-if="loading" class="py-6 text-center text-sm text-muted-foreground">Loading…</div>
      <p v-else-if="apiTokens.length === 0" class="py-6 text-center text-sm text-muted-foreground">
        No API tokens yet.
      </p>
      <div v-else class="overflow-x-auto">
        <table :class="tableClass">
          <thead>
            <tr>
              <th>Name</th>
              <th>Scope</th>
              <th>Created by</th>
              <th>Expires</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in apiTokens" :key="t.id" :class="{ 'opacity-60': t.revoked_at }">
              <td>
                <div class="font-medium">{{ t.name }}</div>
                <div class="text-xs text-muted-foreground">Created {{ shortDate(t.created_at) }}</div>
              </td>
              <td><span :class="roleBadgeClass(t.scope)">{{ capitalize(t.scope) }}</span></td>
              <td class="text-muted-foreground">{{ t.created_by_name ?? t.created_by_email }}</td>
              <td><WsStatus :tone="statusOf(t).tone">{{ statusOf(t).label }}</WsStatus></td>
              <td class="text-muted-foreground">{{ relTime(t.last_used_at) }}</td>
              <td>
                <div class="flex justify-end gap-1.5">
                  <button
                    :class="iconBtnClass"
                    :disabled="!!t.revoked_at || rotatingId === t.id"
                    title="Rotate"
                    @click="rotateToken(t)"
                  >
                    <RotateCcw :class="{ 'animate-spin': rotatingId === t.id }" />
                  </button>
                  <button
                    :class="iconBtnDangerClass"
                    :disabled="!!t.revoked_at || revokingId === t.id"
                    title="Revoke"
                    @click="revokeToken(t)"
                  >
                    <X />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </WsCard>
  </div>

  <Dialog :open="showCreateModal" @update:open="showCreateModal = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>New API token</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">Name</label>
          <input
            v-model="createName"
            placeholder="ci-deploy"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            @keyup.enter="createToken"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">Scope</label>
          <Select v-model="createScope">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="r in scopeOptions" :key="r" :value="r">{{ r }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">Expires</label>
          <Select v-model="createExpiry">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">In 30 days</SelectItem>
              <SelectItem value="90d">In 90 days</SelectItem>
              <SelectItem value="180d">In 180 days</SelectItem>
              <SelectItem value="never">Never</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p v-if="createError" class="text-sm text-destructive">{{ createError }}</p>
      </div>
      <DialogFooter>
        <button
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="createLoading"
          @click="showCreateModal = false"
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="createLoading"
          @click="createToken"
        >
          {{ createLoading ? 'Creating…' : 'Create' }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
