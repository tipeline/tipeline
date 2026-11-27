<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import PanelCard from '@/components/Card.vue';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { AppWindow, Workflow, Boxes, Loader2, Puzzle, Search, X } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useHubStore } from '@/store/hubStore';
import { invokeCore } from '@/utils/invoke';
import { toAssetUrl } from '@/utils/assetUrl';
import { SEND } from '@/ipc-channels';
import { descriptionSummary } from '@tipeline/utils';
import CapabilityList from '@/components/task/CapabilityList.vue';
import HubItemDrawer from '@/components/hub/HubItemDrawer.vue';
import type { CapabilityReport } from '@/utils/capabilities';
import { isFeatured } from '@/utils/hubSuggestions';

type HubCatalogItem = {
  type: 'task' | 'app' | 'plugin';
  identifier: string;
  name: string;
  description?: string;
  author?: string;
  version: string;
  updatedAt?: string;
  image?: string;
  featured?: boolean | number;
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
const route = useRoute();
const hubStore = useHubStore();

const PLACEHOLDER_ICON = { task: Workflow, app: AppWindow, plugin: Boxes } as const;
const brokenImages = ref<Set<string>>(new Set());

// Shared through the store so the choice stays when switching tabs.
const { selectedHubId } = storeToRefs(hubStore);
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

// The card opened in the detail drawer. Its Install button runs the same steps as the card's.
const detailItem = ref<HubCatalogItem | null>(null);
// A link here (Home's Hub suggestions) can name a hub and an item: that item's drawer opens
// once its catalog has loaded.
const queryText = (value: unknown) => (typeof value === 'string' && value ? value : null);
let pendingOpen = queryText(route?.query.item);

// Workflows whose plugins aren't installed or are turned off: listed before
// installing, each with a button that installs and/or turns it on. Once none is
// missing, the install carries on as usual (capabilities first).
const pluginNeeds = ref<{ item: HubCatalogItem; plugins: MissingPlugin[] } | null>(null);
const pluginBusy = ref<string | null>(null);
const pluginError = ref('');
const selectedHubName = computed(() => hubStore.enabledHubs.find((h) => h.id === selectedHubId.value)?.name ?? '—');

onMounted(async () => {
  await hubStore.load();
  // A link's hub first; else keep the hub picked on another tab, unless it was removed or turned off.
  const requested = hubStore.enabledHubs.find((h) => h.id === queryText(route?.query.hub));
  const current = requested ?? hubStore.enabledHubs.find((h) => h.id === selectedHubId.value);
  const next = current?.id ?? hubStore.enabledHubs[0]?.id ?? null;
  if (next === selectedHubId.value) {
    // Same hub as before: the watch won't fire, so load this tab's list here.
    loadCatalog();
    loadInstalled();
  } else {
    selectedHubId.value = next;
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
    if (pendingOpen) {
      detailItem.value = catalogItems.value.find((item) => item.identifier === pendingOpen) ?? null;
      pendingOpen = null;
    }
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
  detailItem.value = null;
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

// Search: every typed word must appear in the name, description, author or identifier.
// Case and accents don't matter ("camara" finds "Cámara").
const search = ref('');
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const searchIndex = computed(
  () =>
    new Map(
      catalogItems.value.map((item) => [
        item.identifier,
        fold([item.name, item.description, item.author, item.identifier].filter(Boolean).join(' ')),
      ])
    )
);
const visibleItems = computed(() => {
  const words = fold(search.value).split(/\s+/).filter(Boolean);
  if (words.length === 0) return catalogItems.value;
  return catalogItems.value.filter((item) => {
    const text = searchIndex.value.get(item.identifier) ?? '';
    return words.every((word) => text.includes(word));
  });
});
</script>

<template>
  <PanelCard classContent="p-0 flex flex-col min-h-0" class="h-full">
    <template #content>
      <div v-if="hubStore.enabledHubs.length === 0" class="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
        <p class="text-sm">{{ t('hub.noHubs') }}</p>
        <p class="text-xs">{{ t('hub.noHubsHint') }}</p>
      </div>
      <template v-else>
        <div class="p-4 border-b flex flex-wrap items-center gap-2">
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
          <div v-if="catalogItems.length > 0" class="relative w-64">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              v-model="search"
              class="pl-8 pr-8"
              :placeholder="t(`hub.search.${itemType}`)"
              :aria-label="t(`hub.search.${itemType}`)"
              data-testid="hub-search"
              @keydown.esc="search = ''"
            />
            <button
              v-if="search"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              :aria-label="t('hub.search.clear')"
              @click="search = ''"
            >
              <X class="size-4" />
            </button>
          </div>
        </div>

        <div v-if="catalogLoading" class="flex items-center justify-center py-20 text-muted-foreground text-sm">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="catalogItems.length === 0" class="flex items-center justify-center py-20 text-muted-foreground text-sm">
          {{ t(emptyTextKey) }}
        </div>
        <div
          v-else-if="visibleItems.length === 0"
          class="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground text-sm"
          data-testid="hub-search-empty"
        >
          <p>{{ t('hub.search.noMatches', { query: search.trim() }) }}</p>
          <Button variant="outline" size="sm" @click="search = ''">{{ t('hub.search.clear') }}</Button>
        </div>
        <div v-else class="flex-1 min-h-0 overflow-y-auto scroll-fade">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            <Card
              v-for="item in visibleItems"
              :key="item.identifier"
              class="flex flex-col overflow-hidden transition-colors hover:border-foreground/20"
            >
              <!-- The image and text open the detail drawer; the footer keeps Install one click away. -->
              <button
                type="button"
                class="flex flex-1 flex-col gap-6 text-left cursor-pointer focus-visible:outline-none focus-visible:bg-accent/50"
                :aria-label="t('hub.detail.open', { name: item.name })"
                data-testid="hub-card-open"
                @click="detailItem = item"
              >
                <!-- Featured sits on the image so every card's title starts on the same line. -->
                <div class="relative aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
                  <span
                    v-if="isFeatured(item)"
                    class="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-background/90 text-blue-700 dark:text-blue-300 shadow-sm"
                  >
                    {{ t('dashboard.hub.featured') }}
                  </span>
                  <img
                    v-if="imageSrc(item)"
                    :src="imageSrc(item)!"
                    :alt="item.name"
                    class="w-full h-full object-contain p-4"
                    @error="brokenImages.add(item.identifier)"
                  />
                  <component :is="placeholderIcon" v-else class="size-10 text-muted-foreground/40" />
                </div>
                <CardHeader class="pb-2 w-full">
                  <CardTitle class="text-base leading-tight">{{ item.name }}</CardTitle>
                  <CardDescription class="line-clamp-2">{{ descriptionSummary(item.description) || '—' }}</CardDescription>
                </CardHeader>
                <CardContent class="flex-1" />
              </button>
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

  <HubItemDrawer
    :item="detailItem"
    :hub-id="selectedHubId"
    :hub-name="selectedHubName"
    :installed="!!detailItem && installedIdentifiers.has(detailItem.identifier)"
    :busy="!!detailItem && (installingIdentifier === detailItem.identifier || checkingIdentifier === detailItem.identifier)"
    @close="detailItem = null"
    @install="requestInstall"
  />

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
