<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Trash2 } from 'lucide-vue-next';
import Button from '@/components/ui/button/Button.vue';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { invokeCore } from '@/utils/invoke';
import { formatBytes } from '@/utils/appFiles';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { InvalidValue, useAutoSave } from '@/composables/useAutoSave';
import SaveStatus from '@/components/SaveStatus.vue';

interface CacheEntry {
  key: string;
  kind: 'action' | 'workflow';
  owner: string | null;
  label: string;
  sizeBytes: number;
  ttlSeconds: number;
  hits: number;
  createdAt: string;
  expiresAt: string;
}

// Mirrors CACHE_MAX_SIZE_SETTING / DEFAULT_CACHE_MAX_SIZE_MB in core's CacheService.
const MAX_SIZE_SETTING = 'cache.maxSizeMb';
const DEFAULT_MAX_SIZE_MB = 100;

const { t } = useI18n();
const { translateError } = useErrorT();
const settingsStore = useSettingsStore();
const autoSave = useAutoSave();

const entries = ref<CacheEntry[]>([]);
const count = ref(0);
const sizeBytes = ref(0);
const maxSizeBytes = ref(DEFAULT_MAX_SIZE_MB * 1024 * 1024);
const loading = ref(false);
const workflowNames = ref<Record<string, string>>({});
const maxSizeMb = ref(String(DEFAULT_MAX_SIZE_MB));
// The field is filled from the first load only: later loads (after a save) would undo typing.
let maxSizeFilled = false;
const openClearAll = ref(false);

const usedPercent = computed(() =>
  maxSizeBytes.value ? Math.min(100, Math.round((sizeBytes.value / maxSizeBytes.value) * 100)) : 0
);

async function load() {
  loading.value = true;
  try {
    const [result, tasks] = await Promise.all([
      invokeCore<{ entries: CacheEntry[]; count: number; sizeBytes: number; maxSizeBytes: number }>(
        SEND.CACHE_LIST
      ),
      invokeCore<Array<{ identifier: string; name: string }>>(SEND.TASK_LIST).catch(() => []),
    ]);
    entries.value = result?.entries ?? [];
    count.value = result?.count ?? 0;
    sizeBytes.value = result?.sizeBytes ?? 0;
    maxSizeBytes.value = result?.maxSizeBytes ?? maxSizeBytes.value;
    if (!maxSizeFilled) {
      maxSizeMb.value = String(Math.round(maxSizeBytes.value / (1024 * 1024)));
      maxSizeFilled = true;
    }
    workflowNames.value = Object.fromEntries((tasks ?? []).map((task) => [task.identifier, task.name]));
  } catch (err) {
    toast.error(t('cache.settings.loadFailed'), { description: translateError(String((err as Error)?.message ?? err)) });
  } finally {
    loading.value = false;
  }
}

async function clear(filter: { key?: string; owner?: string }) {
  try {
    const { removed } = await invokeCore<{ removed: number }>(SEND.CACHE_CLEAR, filter);
    toast.success(t('cache.settings.cleared', { count: removed }));
    await load();
  } catch (err) {
    toast.error(t('cache.settings.clearFailed'), { description: translateError(String((err as Error)?.message ?? err)) });
  }
}

async function confirmClearAll() {
  openClearAll.value = false;
  await clear({});
}

function queueMaxSize() {
  autoSave.schedule('maxSize', async () => {
    const mb = Number(maxSizeMb.value);
    if (!(mb > 0)) throw new InvalidValue(t('cache.settings.maxSizeInvalid'));
    await settingsStore.set(MAX_SIZE_SETTING, String(mb));
    // Core trims the cache to the new limit; show what is left.
    await load();
  });
}

const formatWhen = (iso: string) => new Date(iso).toLocaleString();
const workflowName = (owner: string | null) => (owner ? (workflowNames.value[owner] ?? owner) : '—');

onMounted(load);
</script>

<template>
  <AlertDialog v-model:open="openClearAll">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('cache.settings.clearAllTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('cache.settings.clearAllDescription') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmClearAll">{{ t('cache.settings.clearAll') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <section class="space-y-8">
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-sm font-medium">{{ t('cache.settings.title') }}</div>
          <div class="text-xs text-muted-foreground mt-0.5">{{ t('cache.settings.hint') }}</div>
        </div>
        <Button variant="outline" :disabled="!count" @click="openClearAll = true">
          <Trash2 class="w-4 h-4" />
          {{ t('cache.settings.clearAll') }}
        </Button>
      </div>
      <Progress :model-value="usedPercent" class="h-1.5" />
      <div class="text-xs text-muted-foreground">
        {{ t('cache.settings.usage', { count, size: formatBytes(sizeBytes), max: formatBytes(maxSizeBytes) }) }}
      </div>
    </div>

    <div class="space-y-1.5">
      <label for="cache-max-size" class="text-sm font-medium">{{ t('cache.settings.maxSize') }}</label>
      <div class="flex items-center gap-2">
        <Input
          id="cache-max-size"
          v-model="maxSizeMb"
          type="number"
          min="1"
          class="w-32"
          @update:model-value="queueMaxSize"
          @blur="autoSave.flush('maxSize')"
          @keydown.enter="autoSave.flush('maxSize')"
        />
        <span class="text-sm text-muted-foreground">MB</span>
        <SaveStatus v-bind="autoSave.status('maxSize')" />
      </div>
      <p class="text-xs text-muted-foreground">
        {{ t('cache.settings.maxSizeHint') }} {{ t('settings.autoSave.note') }}
      </p>
    </div>

    <div class="space-y-2">
      <div class="text-sm font-medium">{{ t('cache.settings.entries') }}</div>
      <p v-if="!loading && !entries.length" class="text-sm text-muted-foreground">
        {{ t('cache.settings.empty') }}
      </p>
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('cache.settings.columns.what') }}</TableHead>
            <TableHead>{{ t('cache.settings.columns.workflow') }}</TableHead>
            <TableHead class="text-right">{{ t('cache.settings.columns.size') }}</TableHead>
            <TableHead class="text-right">{{ t('cache.settings.columns.hits') }}</TableHead>
            <TableHead>{{ t('cache.settings.columns.expires') }}</TableHead>
            <TableHead class="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="entry in entries" :key="entry.key">
            <TableCell>
              <span class="font-mono text-xs">{{ entry.kind === 'workflow' ? t('cache.settings.workflowOutputs') : entry.label }}</span>
            </TableCell>
            <TableCell class="text-xs">{{ workflowName(entry.owner) }}</TableCell>
            <TableCell class="text-right text-xs tabular-nums">{{ formatBytes(entry.sizeBytes) }}</TableCell>
            <TableCell class="text-right text-xs tabular-nums">{{ entry.hits }}</TableCell>
            <TableCell class="text-xs text-muted-foreground" :title="t('cache.settings.storedAt', { date: formatWhen(entry.createdAt) })">
              {{ formatWhen(entry.expiresAt) }}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                class="size-7"
                :title="t('cache.settings.clearOne')"
                @click="clear({ key: entry.key })"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </section>
</template>
