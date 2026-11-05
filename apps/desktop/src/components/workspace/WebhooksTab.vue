<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Trash2, RotateCcw, Copy, Check, Pause, Play, ChevronDown, ChevronUp, X } from 'lucide-vue-next';
import WsCard from '@/components/workspace/ui/WsCard.vue';
import WsStatus from '@/components/workspace/ui/WsStatus.vue';
import {
  tableClass,
  btnPrimaryClass,
  iconBtnClass,
  iconBtnDangerClass,
  relTime,
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
import { invokeCore } from '@/utils/invoke';

interface Webhook {
  id: string;
  name: string;
  task_identifier: string;
  method: string;
  enabled: number;
  variables_mapping: Record<string, string> | null;
  created_at: string;
  last_triggered_at: string | null;
}

interface CreateResult {
  webhook: Webhook;
  token: string;
}

interface RotateResult {
  webhook: Webhook;
  token: string;
}

interface NewTokenInfo {
  id: string;
  url: string;
  token: string;
}

const props = defineProps<{ host: string; token: string }>();
const { t } = useI18n();

// ── State ──────────────────────────────────────────────────────────────────────

const webhooks = ref<Webhook[]>([]);
const loading = ref(false);
const error = ref('');

const showCreateModal = ref(false);
const createLoading = ref(false);
const createError = ref('');
const createName = ref('');
const createTask = ref('');
const newToken = ref<NewTokenInfo | null>(null);

interface TaskOption { identifier: string; name: string }
const tasks = ref<TaskOption[]>([]);
const tasksLoading = ref(false);

const deletingId = ref<string | null>(null);
const rotatingId = ref<string | null>(null);
const togglingId = ref<string | null>(null);

const copiedId = ref<string | null>(null);
const expandedMappingId = ref<string | null>(null);

// ── Helpers ────────────────────────────────────────────────────────────────────

// The trigger URL is the same for every webhook — the token now travels in the
// X-Webhook-Token header instead, never in the URL (which is prone to leaking via logs,
// proxies, browser history, and Referer headers).
function triggerUrl(): string {
  const httpBase = props.host.replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'));
  return `${httpBase}/webhooks/trigger`;
}

async function serverCall(channel: string, args: Record<string, any> = {}) {
  return window.ipcRenderer.invoke(channel, { host: props.host, token: props.token, ...args });
}

async function copyToClipboard(text: string, id: string) {
  await navigator.clipboard.writeText(text);
  copiedId.value = id;
  setTimeout(() => { copiedId.value = null; }, 2000);
}

// ── Data loading ───────────────────────────────────────────────────────────────

async function load() {
  loading.value = true;
  error.value = '';
  try {
    webhooks.value = await serverCall(SEND.SERVER_WEBHOOK_LIST);
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load webhooks';
  } finally {
    loading.value = false;
  }
}

async function loadTasks() {
  tasksLoading.value = true;
  try {
    const list = await invokeCore<TaskOption[]>(SEND.TASK_LIST);
    tasks.value = list ?? [];
    if (!createTask.value && tasks.value.length > 0) {
      createTask.value = tasks.value[0].identifier;
    }
  } catch {
    // Tasks unavailable — fall back to text input (handled in template)
  } finally {
    tasksLoading.value = false;
  }
}

// ── Actions ────────────────────────────────────────────────────────────────────

async function createWebhook() {
  if (!createName.value.trim() || !createTask.value.trim()) {
    createError.value = 'Name and workflow identifier are required';
    return;
  }
  createLoading.value = true;
  createError.value = '';
  newToken.value = null;
  try {
    const result: CreateResult = await serverCall(SEND.SERVER_WEBHOOK_CREATE, {
      name: createName.value.trim(),
      task_identifier: createTask.value.trim(),
    });
    webhooks.value.unshift(result.webhook);
    newToken.value = { id: result.webhook.id, url: triggerUrl(), token: result.token };
    createName.value = '';
    createTask.value = '';
    showCreateModal.value = false;
  } catch (e: any) {
    createError.value = e?.message ?? 'Failed to create webhook';
  } finally {
    createLoading.value = false;
  }
}

async function toggleWebhook(webhook: Webhook) {
  togglingId.value = webhook.id;
  try {
    const updated: Webhook = await serverCall(SEND.SERVER_WEBHOOK_UPDATE, {
      id: webhook.id,
      enabled: webhook.enabled ? 0 : 1,
    });
    const idx = webhooks.value.findIndex((w) => w.id === webhook.id);
    if (idx !== -1) webhooks.value[idx] = updated;
  } catch (e: any) {
    error.value = e?.message ?? 'Update failed';
  } finally {
    togglingId.value = null;
  }
}

async function deleteWebhook(webhook: Webhook) {
  deletingId.value = webhook.id;
  try {
    await serverCall(SEND.SERVER_WEBHOOK_DELETE, { id: webhook.id });
    webhooks.value = webhooks.value.filter((w) => w.id !== webhook.id);
    if (newToken.value?.id === webhook.id) newToken.value = null;
  } catch (e: any) {
    error.value = e?.message ?? 'Delete failed';
  } finally {
    deletingId.value = null;
  }
}

async function rotateToken(webhook: Webhook) {
  rotatingId.value = webhook.id;
  newToken.value = null;
  try {
    const result: RotateResult = await serverCall(SEND.SERVER_WEBHOOK_ROTATE, { id: webhook.id });
    const idx = webhooks.value.findIndex((w) => w.id === webhook.id);
    if (idx !== -1) webhooks.value[idx] = result.webhook;
    newToken.value = { id: result.webhook.id, url: triggerUrl(), token: result.token };
  } catch (e: any) {
    error.value = e?.message ?? 'Rotate failed';
  } finally {
    rotatingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">

    <!-- Error banner -->
    <div v-if="error" class="text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
      {{ error }}
    </div>

    <!-- New token banner — shown after create or rotate; dismissed by closing -->
    <div v-if="newToken" class="border border-green-500/30 bg-green-500/5 rounded-lg p-4 space-y-2">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-sm font-medium text-green-700 dark:text-green-400">
            {{ t('webhooks.tokenBanner.title') }}
          </p>
          <p class="text-xs text-muted-foreground">{{ t('webhooks.tokenBanner.description') }}</p>
        </div>
        <button :class="iconBtnClass" @click="newToken = null">
          <X />
        </button>
      </div>

      <div class="space-y-1.5">
        <p class="text-xs text-muted-foreground">{{ t('webhooks.tokenBanner.urlLabel') }}</p>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded break-all">{{ newToken.url }}</code>
          <button
            :class="iconBtnClass"
            :title="t('common.copy')"
            @click="copyToClipboard(newToken!.url, 'new-token-url')"
          >
            <Check v-if="copiedId === 'new-token-url'" class="text-green-600" />
            <Copy v-else />
          </button>
        </div>
      </div>

      <div class="space-y-1.5">
        <p class="text-xs text-muted-foreground">{{ t('webhooks.tokenBanner.headerLabel') }}</p>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded break-all">X-Webhook-Token: {{ newToken.token }}</code>
          <button
            :class="iconBtnClass"
            :title="t('common.copy')"
            @click="copyToClipboard(`X-Webhook-Token: ${newToken!.token}`, 'new-token-header')"
          >
            <Check v-if="copiedId === 'new-token-header'" class="text-green-600" />
            <Copy v-else />
          </button>
        </div>
      </div>
    </div>

    <WsCard title="Webhooks" description="Trigger workflows from external services over HTTP">
      <template #actions>
        <button :class="btnPrimaryClass" @click="showCreateModal = true; newToken = null; loadTasks()">
          <Plus />
          {{ t('webhooks.new') }}
        </button>
      </template>

      <div v-if="loading" class="py-6 text-center text-sm text-muted-foreground">
        {{ t('common.loading') }}
      </div>
      <p v-else-if="webhooks.length === 0" class="py-6 text-center text-sm text-muted-foreground">
        {{ t('webhooks.empty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table :class="tableClass">
          <thead>
            <tr>
              <th>Name</th>
              <th>Workflow</th>
              <th>Status</th>
              <th>{{ t('webhooks.lastTriggered') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <template v-for="webhook in webhooks" :key="webhook.id">
              <tr>
                <td>
                  <div class="font-medium">{{ webhook.name }}</div>
                  <button
                    v-if="webhook.variables_mapping"
                    class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    @click="expandedMappingId = expandedMappingId === webhook.id ? null : webhook.id"
                  >
                    <component :is="expandedMappingId === webhook.id ? ChevronUp : ChevronDown" class="h-3 w-3" />
                    {{ t('webhooks.variablesMapping') }}
                  </button>
                </td>
                <td class="font-mono text-[12.5px] text-muted-foreground">{{ webhook.task_identifier }}</td>
                <td>
                  <WsStatus :tone="webhook.enabled ? 'ok' : 'off'">
                    {{ webhook.enabled ? 'Enabled' : 'Disabled' }}
                  </WsStatus>
                </td>
                <td class="text-muted-foreground">{{ relTime(webhook.last_triggered_at) }}</td>
                <td>
                  <div class="flex justify-end gap-1.5">
                    <button
                      :class="iconBtnClass"
                      :disabled="togglingId === webhook.id"
                      :title="webhook.enabled ? t('common.disable') : t('common.enable')"
                      @click="toggleWebhook(webhook)"
                    >
                      <Pause v-if="webhook.enabled" />
                      <Play v-else />
                    </button>
                    <button
                      :class="iconBtnClass"
                      :disabled="rotatingId === webhook.id"
                      :title="t('webhooks.rotateToken')"
                      @click="rotateToken(webhook)"
                    >
                      <RotateCcw :class="{ 'animate-spin': rotatingId === webhook.id }" />
                    </button>
                    <button
                      :class="iconBtnDangerClass"
                      :disabled="deletingId === webhook.id"
                      :title="t('common.delete')"
                      @click="deleteWebhook(webhook)"
                    >
                      <Trash2 />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="expandedMappingId === webhook.id && webhook.variables_mapping">
                <td colspan="5" class="bg-muted/50">
                  <div class="font-mono text-xs space-y-0.5">
                    <div v-for="(path, varName) in webhook.variables_mapping" :key="varName">
                      <span class="text-foreground">{{ varName }}</span>
                      <span class="text-muted-foreground"> ← {{ path }}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </WsCard>
  </div>

  <!-- Create webhook modal -->
  <Dialog :open="showCreateModal" @update:open="showCreateModal = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('webhooks.newForm.heading') }}</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <input
          v-model="createName"
          :placeholder="t('webhooks.newForm.namePlaceholder')"
          class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          @keyup.enter="createWebhook"
        />
        <Select v-if="tasks.length > 0" v-model="createTask">
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="t('webhooks.newForm.taskPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="task in tasks" :key="task.identifier" :value="task.identifier">
              {{ task.name }} ({{ task.identifier }})
            </SelectItem>
          </SelectContent>
        </Select>
        <input
          v-else
          v-model="createTask"
          :placeholder="tasksLoading ? t('common.loading') : t('webhooks.newForm.taskPlaceholder')"
          :disabled="tasksLoading"
          class="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          @keyup.enter="createWebhook"
        />
        <p v-if="createError" class="text-sm text-destructive">{{ createError }}</p>
      </div>
      <DialogFooter>
        <button
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="createLoading"
          @click="showCreateModal = false; createError = ''"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="createLoading"
          @click="createWebhook"
        >
          {{ createLoading ? t('webhooks.newForm.creating') : t('webhooks.newForm.create') }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
