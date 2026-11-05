<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { DownloadIcon, Loader2Icon, PackageIcon, PuzzleIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useAgentStore, type AgentTurn } from '@/store/agentStore';
import CapabilityList from '@/components/task/CapabilityList.vue';
import type { CapabilityReport } from '@/utils/capabilities';

/** Mirrors HubTaskPreview in apps/core/src/hub/HubWorkflowCatalog.ts. */
interface MissingPlugin {
  group: string;
  state: 'notInstalled' | 'disabled' | 'missing' | 'notLoaded';
  pluginName?: string;
  hubPlugin?: { hubId: string; hubName: string; identifier: string; name: string };
}
interface HubTaskPreview {
  name: string;
  description?: string;
  version: string;
  inputs: Array<{ name: string; label?: string; type: string; required?: boolean }>;
  missingPlugins: MissingPlugin[];
  capabilities: CapabilityReport;
}

/**
 * A proposal for a workflow that's on a hub but not installed. It shows what the
 * install brings — the values the agent read, what the workflow can do, and any
 * plugin this Core is missing — and installs on request; the turn then continues
 * with the normal run form.
 */
const props = defineProps<{ turn: AgentTurn }>();

const { t } = useI18n();
const router = useRouter();
const agentStore = useAgentStore();

const proposal = computed(() => props.turn.proposal!);
const hub = computed(() => proposal.value.hub!);

const preview = ref<HubTaskPreview | null>(null);
const loading = ref(true);
const loadError = ref('');
const installing = ref(false);
const installingPlugin = ref<string | null>(null);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    preview.value = await invokeCore<HubTaskPreview>(SEND.HUB_PREVIEW_TASK, {
      hubId: hub.value.id,
      itemIdentifier: hub.value.itemIdentifier,
    });
  } catch (error: any) {
    preview.value = null;
    loadError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
  }
}

watch(() => proposal.value.identifier, load, { immediate: true });

function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The inputs the agent filled in, in the workflow's order. */
const filled = computed(() =>
  (preview.value?.inputs ?? [])
    .filter((input) => Object.prototype.hasOwnProperty.call(proposal.value.variables, input.name))
    .map((input) => ({ label: input.label || input.name, value: display(proposal.value.variables[input.name]) }))
);

const blocked = computed(() => (preview.value?.missingPlugins.length ?? 0) > 0);

function pluginLabel(plugin: MissingPlugin) {
  return plugin.pluginName ?? plugin.hubPlugin?.name ?? plugin.group;
}

async function installPlugin(plugin: MissingPlugin) {
  if (!plugin.hubPlugin) return;
  installingPlugin.value = plugin.group;
  try {
    await invokeCore(SEND.HUB_INSTALL_PLUGIN, {
      hubId: plugin.hubPlugin.hubId,
      itemIdentifier: plugin.hubPlugin.identifier,
    });
    toast.success(t('agent.hub.pluginInstalled', { name: plugin.hubPlugin.name }));
    await load();
  } catch (error: any) {
    toast.error(t('agent.hub.pluginInstallFailed'), { description: error?.message ?? String(error) });
  } finally {
    installingPlugin.value = null;
  }
}

async function install() {
  installing.value = true;
  try {
    const installed = await invokeCore<{ identifier: string; name?: string }>(SEND.HUB_INSTALL_TASK, {
      hubId: hub.value.id,
      itemIdentifier: hub.value.itemIdentifier,
    });
    if (!installed?.identifier) throw new Error(t('agent.hub.installFailed'));
    agentStore.adoptInstalled(props.turn.id, installed);
  } catch (error: any) {
    toast.error(t('agent.hub.installFailed'), { description: error?.message ?? String(error) });
  } finally {
    installing.value = false;
  }
}
</script>

<template>
  <div class="rounded-md border text-sm">
    <div class="flex items-start gap-2 px-3 py-2 border-b">
      <PackageIcon class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{{ proposal.name }}</span>
          <span class="text-[11px] text-muted-foreground border rounded-full px-2 py-0.5">
            {{ t('agent.hub.notInstalled', { hub: hub.name }) }}
          </span>
        </div>
        <p v-if="preview?.description" class="text-xs text-muted-foreground line-clamp-2">{{ preview.description }}</p>
      </div>
    </div>

    <p v-if="proposal.remembered" class="px-3 pt-2 text-[11px] text-muted-foreground">
      {{ t('agent.choice.lastTime') }}
    </p>
    <div class="px-3 py-3 space-y-3">
      <div v-if="loading" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon class="w-3.5 h-3.5 animate-spin" /> {{ t('agent.hub.checking') }}
      </div>
      <p v-else-if="loadError" class="text-xs text-red-600 dark:text-red-400">
        {{ t('agent.hub.previewFailed', { hub: hub.name }) }} {{ loadError }}
      </p>

      <template v-else-if="preview">
        <p class="text-xs text-muted-foreground">{{ t('agent.hub.explain') }}</p>

        <dl v-if="filled.length > 0" class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in filled" :key="row.label">
            <dt class="text-muted-foreground truncate">{{ row.label }}</dt>
            <dd class="break-words">
              {{ row.value }} <span class="text-primary">· {{ t('agent.proposal.fromRequest') }}</span>
            </dd>
          </template>
        </dl>

        <CapabilityList
          v-if="preview.capabilities?.capabilities.length || preview.capabilities?.unknownWorkflows.length"
          :report="preview.capabilities"
        />

        <div
          v-for="plugin in preview.missingPlugins"
          :key="plugin.group"
          class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs"
        >
          <PuzzleIcon class="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div class="min-w-0 flex-1 space-y-1.5">
            <p>{{ t(`agent.hub.plugin.${plugin.state}`, { name: pluginLabel(plugin), group: plugin.group }) }}</p>
            <Button
              v-if="plugin.state === 'notInstalled' && plugin.hubPlugin"
              size="sm"
              variant="outline"
              class="h-7 text-xs"
              :disabled="installingPlugin !== null"
              @click="installPlugin(plugin)"
            >
              <Loader2Icon v-if="installingPlugin === plugin.group" class="w-3 h-3 mr-1 animate-spin" />
              {{ t('agent.hub.installPlugin', { name: plugin.hubPlugin.name, hub: plugin.hubPlugin.hubName }) }}
            </Button>
            <div v-else class="flex flex-wrap gap-3">
              <button
                v-if="plugin.state !== 'notLoaded'"
                class="text-primary hover:underline"
                @click="router.push('/plugins')"
              >
                {{ t('agent.hub.openPlugins') }}
              </button>
              <button class="text-primary hover:underline" @click="load">{{ t('agent.hub.checkAgain') }}</button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="flex flex-wrap items-center gap-2 px-3 py-2 border-t">
      <Button size="sm" :disabled="loading || !!loadError || blocked || installing" @click="install">
        <Loader2Icon v-if="installing" class="w-3.5 h-3.5 mr-1 animate-spin" />
        <DownloadIcon v-else class="w-3.5 h-3.5 mr-1" />
        {{ t('agent.hub.installAndContinue') }}
      </Button>
      <Button size="sm" variant="ghost" :disabled="installing" @click="agentStore.dismissProposal(turn.id)">
        {{ t('agent.proposal.dismiss') }}
      </Button>
    </div>

    <div v-if="proposal.alternatives.length > 0" class="px-3 pb-2 text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-1">
      <span>{{ t('agent.proposal.alternatives') }}</span>
      <button
        v-for="alt in proposal.alternatives"
        :key="alt.identifier"
        class="text-primary hover:underline"
        @click="agentStore.switchProposal(turn.id, alt.identifier)"
      >
        {{ alt.name }}<span v-if="alt.hub" class="text-muted-foreground"> ({{ alt.hub.name }})</span>
      </button>
    </div>
  </div>
</template>
