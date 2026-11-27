<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { AppWindow, Boxes, Workflow, X } from 'lucide-vue-next';
import { useHubStore } from '@/store/hubStore';
import { useSettingsStore } from '@/store/settingsStore';
import { invokeCore } from '@/utils/invoke';
import { toAssetUrl } from '@/utils/assetUrl';
import { SEND } from '@/ipc-channels';
import { ENTITY_COLORS } from '@/config/entityColors';
import { HOME_HEADING, HOME_HEADING_ROW, HOME_LINK } from '@/config/homeStyles';
import { descriptionSummary } from '@tipeline/utils';
import {
  HOME_HUB_SUGGESTIONS_KEY,
  hubItemKey,
  pluginGroupKey,
  pickHubSuggestions,
  type HubCatalog,
  type HubItemType,
  type HubSuggestion,
  type HubSuggestionItem,
} from '@/utils/hubSuggestions';

// A few items from the Hub, so people learn they can add tools and ready-made work.
// Hidden for good with the ×; Settings → Appearance turns it back on.
const { t } = useI18n();
const router = useRouter();
const hubStore = useHubStore();
const settingsStore = useSettingsStore();

const suggestions = ref<HubSuggestion[]>([]);
const brokenImages = ref<Set<string>>(new Set());

const hidden = computed(
  () => settingsStore.get(HOME_HUB_SUGGESTIONS_KEY) === 'false'
);

const ICONS = { task: Workflow, app: AppWindow, plugin: Boxes } as const;
const TINTS: Record<HubItemType, string> = {
  task: ENTITY_COLORS.workflow.tint,
  app: ENTITY_COLORS.app.tint,
  plugin: ENTITY_COLORS.project.tint,
};
const TABS: Record<HubItemType, string> = {
  task: 'HubTasks',
  app: 'HubApps',
  plugin: 'HubPlugins',
};

type LocalRow = Record<string, any>;
const INSTALLED_LISTS: { type: HubItemType; channel: string; field: string }[] =
  [
    { type: 'task', channel: SEND.TASK_LIST, field: 'hub_task_identifier' },
    { type: 'app', channel: SEND.APP_LIST, field: 'hub_app_identifier' },
    {
      type: 'plugin',
      channel: SEND.PLUGIN_LIST,
      field: 'hub_plugin_identifier',
    },
  ];

async function installedKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  await Promise.all(
    INSTALLED_LISTS.map(async ({ type, channel, field }) => {
      const rows = await invokeCore<LocalRow[]>(channel).catch(
        () => [] as LocalRow[]
      );
      for (const row of rows ?? []) {
        if (type === 'plugin' && row.group) keys.add(pluginGroupKey(row.group));
        if (row.source_type === 'hub' && row.hub_id && row[field]) {
          keys.add(hubItemKey(type, row.hub_id, row[field]));
        }
      }
    })
  );
  return keys;
}

async function load() {
  // A workspace without hubs (or a Server that doesn't offer them) just shows no card.
  await hubStore.load().catch(() => {});
  const hubs = (hubStore.hubs ?? []).filter((hub) => hub.enabled);
  if (!hubs.length) return;
  const [catalogs, installed] = await Promise.all([
    Promise.all(
      hubs.map(async (hub): Promise<HubCatalog> => {
        // One hub being offline shouldn't hide what the others offer.
        const items = await invokeCore<HubSuggestionItem[]>(SEND.HUB_CATALOG, {
          hubId: hub.id,
        }).catch(() => [] as HubSuggestionItem[]);
        return { hubId: hub.id, hubName: hub.name, items: items ?? [] };
      })
    ),
    installedKeys(),
  ]);
  suggestions.value = pickHubSuggestions(catalogs, installed);
}

onMounted(() => {
  if (!hidden.value) void load();
});

function open(item: HubSuggestion) {
  router.push({
    name: TABS[item.type],
    query: { hub: item.hubId, item: item.identifier },
  });
}

function imageSrc(item: HubSuggestion) {
  const key = `${item.type}:${item.identifier}`;
  return brokenImages.value.has(key) ? null : toAssetUrl(item.image);
}

async function hide() {
  await settingsStore.set(HOME_HUB_SUGGESTIONS_KEY, 'false');
  toast(t('dashboard.hub.hiddenToast'), {
    action: {
      label: t('dashboard.hub.undo'),
      onClick: () => void settingsStore.set(HOME_HUB_SUGGESTIONS_KEY, 'true'),
    },
  });
}
</script>

<template>
  <!-- Laid out like Continue: a heading row, then one row of four tiles (two by two when narrow). -->
  <section
    v-if="!hidden && suggestions.length"
    class="flex flex-col gap-2"
    aria-labelledby="home-hub-title"
    data-testid="home-hub-suggestions"
  >
    <div :class="HOME_HEADING_ROW">
      <h2 id="home-hub-title" :class="HOME_HEADING">
        {{ t('dashboard.hub.title') }}
      </h2>
      <div class="flex items-center gap-1 shrink-0">
        <button type="button" :class="HOME_LINK" @click="router.push('/hub')">
          {{ t('dashboard.hub.browse') }}
        </button>
        <button
          type="button"
          class="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          :aria-label="t('dashboard.hub.hide')"
          :title="t('dashboard.hub.hide')"
          data-testid="home-hub-hide"
          @click="hide"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="@container">
      <div class="grid gap-3 grid-cols-2 @xl:grid-cols-4">
        <button
          v-for="item in suggestions"
          :key="`${item.hubId}:${item.type}:${item.identifier}`"
          type="button"
          class="flex items-start gap-3 px-3.5 py-[18px] border border-border rounded-md bg-card hover:bg-muted/50 transition-colors text-left min-w-0"
          :title="descriptionSummary(item.description) || undefined"
          data-testid="home-hub-item"
          @click="open(item)"
        >
          <span
            class="flex items-center justify-center w-9 h-9 rounded-md shrink-0 overflow-hidden"
            :class="imageSrc(item) ? 'bg-muted' : TINTS[item.type]"
          >
            <img
              v-if="imageSrc(item)"
              :src="imageSrc(item)!"
              alt=""
              class="w-full h-full object-contain p-1"
              @error="brokenImages.add(`${item.type}:${item.identifier}`)"
            />
            <component :is="ICONS[item.type]" v-else class="w-4 h-4" />
          </span>
          <span class="flex flex-col gap-0.5 min-w-0">
            <span class="text-sm font-medium truncate">{{ item.name }}</span>
            <!-- One line of the description; the full summary is on hover. -->
            <span
              v-if="descriptionSummary(item.description)"
              class="text-[13px] text-foreground/70 truncate"
              data-testid="home-hub-description"
            >
              {{ descriptionSummary(item.description) }}
            </span>
            <span
              class="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80"
            >
              {{ t(`dashboard.hub.type.${item.type}`)
              }}<template v-if="item.installed">
                · {{ t('dashboard.hub.installed') }}</template
              >
            </span>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>
