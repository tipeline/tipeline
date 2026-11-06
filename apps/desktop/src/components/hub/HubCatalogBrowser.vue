<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import PanelCard from '@/components/Card.vue';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { AppWindow, Workflow, Boxes, Loader2, Puzzle } from 'lucide-vue-next';
import { useHubStore } from '@/store/hubStore';
import { invokeCore } from '@/utils/invoke';
import { toAssetUrl } from '@/utils/assetUrl';
import { SEND } from '@/ipc-channels';
import { descriptionSummary } from '@tipeline/utils';
import CapabilityList from '@/components/task/CapabilityList.vue';
import type { CapabilityReport } from '@/utils/capabilities';

type HubCatalogItem = {
  type: 'task' | 'app' | 'plugin';
  identifier: string;
  name: string;
  description?: string;
  author?: string;
  version: string;
  image?: string;
};

// A plugin a hub workflow needs that this Core can't run yet (Core's HubWorkflowCatalog).
type MissingPlugin = {
  group: string;
  state: 'notInstalled' | 'disabled' | 'missing' | 'notLoaded';
  pluginName?: string;
  pluginIdentifier?: string;
  hubPlugin?: { hubId: string; hubName: string; identifier: string; name: string };
};
type TaskPreview = { capabilities: CapabilityReport; missingPlugins?: MissingPlugin[] };

const props = defineProps<{
  itemType: 'task' | 'app' | 'plugin';
  installChannel: string;
  localListChannel: string;
  hubIdentifierField: 'hub_task_identifier' | 'hub_app_identifier' | 'hub_plugin_identifier';
  emptyTextKey: string;
  confirmBeforeInstall?: boolean;
}>();

const { t } = useI18n();
const hubStore = useHubStore();

const PLACEHOLDER_ICON = { task: Workflow, app: AppWindow, plugin: Boxes } as const;
const brokenImages = ref<Set<string>>(new Set());

const selectedHubId = ref<string | null>(null);
const catalogItems = ref<HubCatalogItem[]>([]);
const catalogLoading = ref(false);
const installedIdentifiers = ref<Set<string>>(new Set());
const installingIdentifier = ref<string | null>(null);
const confirmItem = ref<HubCatalogItem | null>(null);
// AlertDialogAction's own click handler closes the dialog (firing our
// @update:open, which clears confirmItem) *before* our @click handler runs —
// both are bound to the same click. Snapshotting into a plain variable here
// means confirmInstall() has its own copy that the dialog's auto-close can't
// race out from under it.
let pendingInstallItem: HubCatalogItem | null = null;

// Workflows: what the workflow can do, asked before installing (same snapshot
// pattern as above). A workflow that only works with data installs right away.
const checkingIdentifier = ref<string | null>(null);
const capabilityItem = ref<HubCatalogItem | null>(null);
const capabilityReport = ref<CapabilityReport | null>(null);
const capabilityError = ref('');
let pendingCapabilityItem: HubCatalogItem | null = null;

// Install failures open a dialog rather than a toast: a failed checksum names
// two full sha256 hashes, which a toast would cut off.
const installError = ref<{ name: string; message: string } | null>(null);

// Workflows whose plugins aren't installed or are turned off: listed before
// installing, each with a button that installs and/or turns it on. Once none is
// missing, the install carries on as usual (capabilities first).
const pluginNeeds = ref<{ item: HubCatalogItem; plugins: MissingPlugin[] } | null>(null);
const pluginBusy = ref<string | null>(null);
const pluginError = ref('');
const selectedHubName = computed(() => hubStore.enabledHubs.find((h) => h.id === selectedHubId.value)?.name ?? '—');

onMounted(async () => {
  await hubStore.load();
  if (!selectedHubId.value && hubStore.enabledHubs.length > 0) {
    selectedHubId.value = hubStore.enabledHubs[0].id;
  }
});

async function loadCatalog() {
  if (!selectedHubId.value) {
    catalogItems.value = [];
    return;
  }
  catalogLoading.value = true;
  try {
    const all = await invokeCore<HubCatalogItem[]>(SEND.HUB_CATALOG, { hubId: selectedHubId.value });
    catalogItems.value = all.filter((item) => item.type === props.itemType);
    brokenImages.value = new Set();
  } finally {
    catalogLoading.value = false;
  }
}

async function loadInstalled() {
  if (!selectedHubId.value) {
    installedIdentifiers.value = new Set();
    return;
  }
  const all = await invokeCore<any[]>(props.localListChannel);
  const ids = all
    .filter((row) => row.source_type === 'hub' && row.hub_id === selectedHubId.value)
    .map((row) => row[props.hubIdentifierField]);
  installedIdentifiers.value = new Set(ids);
}

watch(selectedHubId, () => {
  loadCatalog();
  loadInstalled();
});

async function doInstall(item: HubCatalogItem) {
  if (!selectedHubId.value) return;
  installingIdentifier.value = item.identifier;
  try {
    await invokeCore(props.installChannel, { hubId: selectedHubId.value, itemIdentifier: item.identifier });
    await loadInstalled();
  } catch (e: any) {
    installError.value = { name: item.name, message: e?.message ?? String(e) };
  } finally {
    installingIdentifier.value = null;
  }
}

function requestInstall(item: HubCatalogItem) {
  if (props.confirmBeforeInstall) {
    confirmItem.value = item;
    pendingInstallItem = item;
    return;
  }
  if (props.itemType === 'task') {
    checkCapabilities(item);
    return;
  }
  doInstall(item);
}

async function checkCapabilities(item: HubCatalogItem) {
  if (!selectedHubId.value) return;
  checkingIdentifier.value = item.identifier;
  try {
    const preview = await invokeCore<TaskPreview>(SEND.HUB_PREVIEW_TASK, {
      hubId: selectedHubId.value,
      itemIdentifier: item.identifier,
    });
    if (preview.missingPlugins?.length) {
      pluginError.value = '';
      pluginNeeds.value = { item, plugins: preview.missingPlugins };
      return;
    }
    const report = preview.capabilities;
    if (report.capabilities.length === 0 && report.unknownWorkflows.length === 0) {
      checkingIdentifier.value = null;
      await doInstall(item);
      return;
    }
    capabilityReport.value = report;
    capabilityError.value = '';
  } catch (e: any) {
    capabilityReport.value = null;
    capabilityError.value = e?.message ?? String(e);
  } finally {
    checkingIdentifier.value = null;
  }
  capabilityItem.value = item;
  pendingCapabilityItem = item;
}

function pluginLabel(plugin: MissingPlugin) {
  return plugin.pluginName ?? plugin.hubPlugin?.name ?? plugin.group;
}

/** Whether the dialog can fix this plugin itself: install it from a hub, or turn it on. */
function pluginFix(plugin: MissingPlugin): 'install' | 'turnOn' | null {
  if (plugin.state === 'notInstalled') return plugin.hubPlugin ? 'install' : null;
  if (plugin.state === 'disabled' && plugin.pluginIdentifier) return 'turnOn';
  return null;
}

async function fixPlugin(plugin: MissingPlugin) {
  const needs = pluginNeeds.value;
  if (!needs || !selectedHubId.value) return;
  pluginBusy.value = plugin.group;
  pluginError.value = '';
  try {
    let identifier = plugin.pluginIdentifier;
    if (pluginFix(plugin) === 'install' && plugin.hubPlugin) {
      const installed = await invokeCore<{ identifier: string }>(SEND.HUB_INSTALL_PLUGIN, {
        hubId: plugin.hubPlugin.hubId,
        itemIdentifier: plugin.hubPlugin.identifier,
      });
      identifier = installed?.identifier;
    }
    if (!identifier) throw new Error(t('hub.plugins.failed'));
    // The click is the consent to run the plugin's code: plugins otherwise start off.
    await invokeCore(SEND.PLUGIN_SET_ENABLED, { identifier, enabled: true });

    const preview = await invokeCore<TaskPreview>(SEND.HUB_PREVIEW_TASK, {
      hubId: selectedHubId.value,
      itemIdentifier: needs.item.identifier,
    });
    if (preview.missingPlugins?.length) {
      pluginNeeds.value = { item: needs.item, plugins: preview.missingPlugins };
      return;
    }
    pluginNeeds.value = null;
    await checkCapabilities(needs.item);
  } catch (e: any) {
    pluginError.value = e?.message ?? String(e);
  } finally {
    pluginBusy.value = null;
  }
}

async function confirmCapabilityInstall() {
  const item = pendingCapabilityItem;
  pendingCapabilityItem = null;
  capabilityItem.value = null;
  if (item) await doInstall(item);
}

async function confirmInstall() {
  const item = pendingInstallItem;
  pendingInstallItem = null;
  confirmItem.value = null;
  if (!item) return;
  await doInstall(item);
}

function imageSrc(item: HubCatalogItem): string | null {
  if (brokenImages.value.has(item.identifier)) return null;
  return toAssetUrl(item.image);
}

const placeholderIcon = computed(() => PLACEHOLDER_ICON[props.itemType]);
</script>

<template>
  <PanelCard classContent="p-0 flex flex-col min-h-0" class="h-full">
    <template #content>
      <div v-if="hubStore.enabledHubs.length === 0" class="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
        <p class="text-sm">{{ t('hub.noHubs') }}</p>
        <p class="text-xs">{{ t('hub.noHubsHint') }}</p>
      </div>
      <template v-else>
        <div class="p-4 border-b">
          <Select v-model="selectedHubId">
            <SelectTrigger class="w-64">
              <SelectValue :placeholder="t('hub.selectHub')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="hub in hubStore.enabledHubs" :key="hub.id" :value="hub.id">
                {{ hub.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="catalogLoading" class="flex items-center justify-center py-20 text-muted-foreground text-sm">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="catalogItems.length === 0" class="flex items-center justify-center py-20 text-muted-foreground text-sm">
          {{ t(emptyTextKey) }}
        </div>
        <div v-else class="flex-1 min-h-0 overflow-y-auto scroll-fade">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            <Card v-for="item in catalogItems" :key="item.identifier" class="flex flex-col overflow-hidden">
              <div class="aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
                <img
                  v-if="imageSrc(item)"
                  :src="imageSrc(item)!"
                  :alt="item.name"
                  class="w-full h-full object-cover"
                  @error="brokenImages.add(item.identifier)"
                />
                <component :is="placeholderIcon" v-else class="size-10 text-muted-foreground/40" />
              </div>
              <CardHeader class="pb-2">
                <CardTitle class="text-base leading-tight">{{ item.name }}</CardTitle>
                <CardDescription class="line-clamp-2">{{ descriptionSummary(item.description) || '—' }}</CardDescription>
              </CardHeader>
              <CardContent class="flex-1" />
              <CardFooter class="flex items-center justify-between gap-2 pt-0">
                <div class="flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
                  <span class="truncate">{{ item.author ?? '—' }}</span>
                  <span class="font-mono shrink-0">{{ item.version }}</span>
                </div>
                <Badge v-if="installedIdentifiers.has(item.identifier)" variant="secondary" class="shrink-0">
                  {{ t('hub.installed') }}
                </Badge>
                <Button
                  v-else
                  size="sm"
                  class="shrink-0"
                  :disabled="installingIdentifier === item.identifier || checkingIdentifier === item.identifier"
                  @click="requestInstall(item)"
                >
                  {{ installingIdentifier === item.identifier ? t('hub.installing') : t('hub.install') }}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </template>
    </template>
  </PanelCard>

  <AlertDialog :open="!!confirmItem" @update:open="(v: boolean) => !v && (confirmItem = null)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('hub.pluginInstallConfirm.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('hub.pluginInstallConfirm.description', { name: confirmItem?.name }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmInstall">
          {{ t('hub.pluginInstallConfirm.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog :open="!!capabilityItem" @update:open="(v: boolean) => !v && (capabilityItem = null)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('capabilities.installTitle', { name: capabilityItem?.name }) }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{
            t('capabilities.installFrom', {
              hub: selectedHubName,
              author: capabilityItem?.author ?? '—',
              version: capabilityItem?.version,
            })
          }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <CapabilityList v-if="capabilityReport" :report="capabilityReport" />
      <p v-else class="text-sm text-red-600 dark:text-red-400">
        {{ t('capabilities.previewFailed', { error: capabilityError }) }}
      </p>
      <p class="text-xs text-muted-foreground">{{ t('capabilities.installNote') }}</p>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmCapabilityInstall">
          {{ t('capabilities.install') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog :open="!!pluginNeeds" @update:open="(v: boolean) => !v && !pluginBusy && (pluginNeeds = null)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('hub.plugins.title', { name: pluginNeeds?.item.name }) }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('hub.plugins.intro') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <div class="space-y-2">
        <div
          v-for="plugin in pluginNeeds?.plugins ?? []"
          :key="plugin.group"
          data-testid="needed-plugin"
          class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
        >
          <Puzzle class="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div class="min-w-0 flex-1 space-y-1.5">
            <p>{{ t(`agent.hub.plugin.${plugin.state}`, { name: pluginLabel(plugin), group: plugin.group }) }}</p>
            <Button
              v-if="pluginFix(plugin)"
              size="sm"
              variant="outline"
              class="h-7 text-xs"
              :disabled="pluginBusy !== null"
              @click="fixPlugin(plugin)"
            >
              <Loader2 v-if="pluginBusy === plugin.group" class="w-3 h-3 mr-1 animate-spin" />
              {{
                pluginFix(plugin) === 'install'
                  ? t('hub.plugins.installAndTurnOn', { name: pluginLabel(plugin), hub: plugin.hubPlugin?.hubName })
                  : t('hub.plugins.turnOn', { name: pluginLabel(plugin) })
              }}
            </Button>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">{{ t('hub.plugins.runsCode') }}</p>
        <p v-if="pluginError" class="text-xs text-destructive whitespace-pre-wrap wrap-anywhere select-text">
          {{ pluginError }}
        </p>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="pluginBusy !== null">{{ t('common.close') }}</AlertDialogCancel>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog :open="!!installError" @update:open="(v: boolean) => !v && (installError = null)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('hub.installFailedTitle', { name: installError?.name }) }}</AlertDialogTitle>
        <AlertDialogDescription class="whitespace-pre-wrap wrap-anywhere select-text">
          {{ installError?.message }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction>{{ t('common.close') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
