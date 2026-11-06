<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Page from '@/components/Page.vue';
import NotFoundState from '@/components/NotFoundState.vue';
import Card from '@/components/Card.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { useQuery } from '@/composables/useQuery';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { usePluginStore } from '@/store/pluginStore';
import { toAssetUrl } from '@/utils/assetUrl';
import { Boxes } from 'lucide-vue-next';
import HubSourceBlock from '@/components/hub/HubSourceBlock.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const pluginStore = usePluginStore();
const toggling = ref(false);
const dialogOpen = ref(false);
const disableMessage = ref('');

const { data: plugin, isLoading, refetch } = useQuery<any>(SEND.PLUGIN_DETAIL, {
  identifier: route.params.pid,
});
const notFound = computed(() => !isLoading.value && !plugin.value);

const pluginImageUrl = computed(() => toAssetUrl(plugin.value?.image));

watch(plugin, (p) => {
  if (p?.name) pluginStore.setCurrentPlugin({ name: p.name });
}, { immediate: true });

async function requestToggle() {
  if (!plugin.value) return;
  const enabling = !plugin.value.enabled;
  if (!enabling) {
    let message = 'Disabling this plugin may cause workflows that use its actions to fail when run.';
    try {
      const usage = await invokeCore<{ count: number; tasks: { name: string }[] }>(
        SEND.PLUGIN_USAGE,
        { group: plugin.value.group }
      );
      if (usage.count > 0) {
        const names = usage.tasks.map((t: any) => t.name).join(', ');
        message = `${usage.count} workflow(s) use actions from this plugin: ${names}. Disabling it will cause those workflows to fail when run.`;
      }
    } catch { /* use generic warning */ }
    disableMessage.value = message;
    dialogOpen.value = true;
  } else {
    await applyToggle();
  }
}

async function applyToggle() {
  if (!plugin.value) return;
  toggling.value = true;
  try {
    await invokeCore(SEND.PLUGIN_SET_ENABLED, {
      identifier: plugin.value.identifier,
      enabled: !plugin.value.enabled,
    });
    await refetch({ identifier: route.params.pid });
    pluginStore.refreshAttentionCount();
  } finally {
    toggling.value = false;
  }
}

// One real example per declared action when the plugin ships `docs`,
// falling back to a generic placeholder snippet otherwise.
const actionSnippets = computed(() => {
  const actions: string[] = plugin.value?.actions ?? [];
  const docs: Record<string, { description?: string; example?: string }> = plugin.value?.docs ?? {};
  if (!actions.length) return [];
  return actions.map((action) => ({
    action,
    description: docs[action]?.description,
    example:
      docs[action]?.example ??
      `- group: ${plugin.value?.group ?? 'yourGroup'}\n  name: ${action}\n  source: plugin\n  params:\n    someParam: '{{ value }}'`,
  }));
});

async function removePlugin() {
  if (!plugin.value) return;
  await invokeCore(SEND.PLUGIN_REMOVE, { identifier: plugin.value.identifier });
  pluginStore.refreshAttentionCount();
  router.push('/plugins');
}
</script>

<template>
  <Page scrollable>
    <template #title>
      <div v-if="plugin" class="flex items-center gap-2">
        <div class="size-6 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
          <img v-if="pluginImageUrl" :src="pluginImageUrl" class="w-full h-full object-cover" />
          <Boxes v-else class="size-3.5 text-muted-foreground/50" />
        </div>
        <span>{{ plugin.name }}</span>
      </div>
      <template v-else>{{ t('plugins.title') }}</template>
    </template>
    <template #menu>
      <Button
        v-if="plugin && plugin.status === 'ok'"
        variant="outline"
        :disabled="toggling"
        @click="requestToggle"
      >
        {{ plugin.enabled ? t('common.disable') : t('common.enable') }}
      </Button>
      <Button v-if="plugin" variant="destructive" @click="removePlugin">
        {{ t('common.remove') }}
      </Button>
    </template>
    <template #content>
      <NotFoundState
        v-if="notFound"
        :title="t('plugins.notFound.title')"
        :description="t('plugins.notFound.description')"
        :back-label="t('plugins.notFound.back')"
        :back-to="{ name: 'Plugins' }"
        :icon="Boxes"
      />
      <div v-else-if="plugin" class="flex flex-col gap-4">
        <Card>
          <template #content>
            <div class="flex items-center gap-3 p-1 mb-3">
              <div class="size-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
                <img v-if="pluginImageUrl" :src="pluginImageUrl" class="w-full h-full object-cover" />
                <Boxes v-else class="size-5 text-muted-foreground/40" />
              </div>
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">{{ plugin.name }}</div>
                <div class="text-xs text-muted-foreground truncate">{{ plugin.description ?? '—' }}</div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-x-8 gap-y-3 p-1 text-sm">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground uppercase tracking-wide">{{ t('plugins.detail.group') }}</span>
                <span class="font-mono bg-muted px-2 py-0.5 rounded w-fit">{{ plugin.group }}</span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground uppercase tracking-wide">{{ t('plugins.detail.status') }}</span>
                <Badge v-if="plugin.status === 'conflict'" class="bg-orange-500 text-white w-fit">
                  {{ t('plugins.detail.groupConflict') }}
                </Badge>
                <Badge v-else-if="plugin.status === 'missing'" variant="destructive" class="w-fit">
                  {{ t('plugins.detail.missing') }}
                </Badge>
                <Badge
                  v-else
                  :class="plugin.enabled ? 'bg-green-600 text-white w-fit' : 'bg-secondary text-secondary-foreground w-fit'"
                >
                  {{ plugin.enabled ? t('common.enabled') : t('common.disabled') }}
                </Badge>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground uppercase tracking-wide">{{ t('plugins.detail.author') }}</span>
                <span>{{ plugin.author ?? '—' }}</span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground uppercase tracking-wide">{{ t('plugins.detail.version') }}</span>
                <span class="font-mono text-xs">{{ plugin.version ?? '—' }}</span>
              </div>
              <HubSourceBlock
                v-if="plugin.source_type === 'hub'"
                class="col-span-2"
                :item="plugin"
                type="plugin"
                @changed="refetch()"
              />
              <div class="col-span-2 flex flex-col gap-1">
                <span class="text-xs text-muted-foreground uppercase tracking-wide">{{ t('plugins.detail.description') }}</span>
                <span>{{ plugin.description ?? '—' }}</span>
              </div>
              <div class="col-span-2 flex flex-col gap-1">
                <span class="text-xs text-muted-foreground uppercase tracking-wide">{{ t('plugins.detail.path') }}</span>
                <span class="font-mono text-xs text-muted-foreground break-all">{{ plugin.path }}</span>
              </div>
            </div>
          </template>
        </Card>

        <Card v-if="plugin.status === 'conflict'" class="border-orange-500/50">
          <template #content>
            <p class="text-sm text-orange-600 dark:text-orange-400">
              {{ t('plugins.detail.conflictWarning', { group: plugin.group }) }}
            </p>
          </template>
        </Card>

        <Card v-else-if="plugin.status === 'missing'" class="border-destructive/50">
          <template #content>
            <p class="text-sm text-destructive">
              {{ t('plugins.detail.missingWarning', { path: plugin.path }) }}
            </p>
          </template>
        </Card>

        <Card v-else>
          <template #title>{{ t('plugins.detail.usage') }}</template>
          <template #content>
            <p class="text-sm text-muted-foreground mb-3">
              {{ t('plugins.detail.usageDescription', { group: plugin.group }) }}
            </p>
            <div v-if="actionSnippets.length" class="flex flex-col gap-4">
              <div v-for="item in actionSnippets" :key="item.action">
                <p class="font-mono text-sm">{{ item.action }}</p>
                <p v-if="item.description" class="text-xs text-muted-foreground mb-1">{{ item.description }}</p>
                <pre class="text-xs bg-muted rounded p-3 overflow-x-auto">{{ item.example }}</pre>
              </div>
            </div>
            <p v-else-if="!plugin.enabled" class="text-sm text-muted-foreground">{{ t('plugins.detail.turnOnForActions') }}</p>
            <p v-else class="text-sm text-muted-foreground">{{ t('plugins.detail.noActions') }}</p>
          </template>
        </Card>
      </div>
    </template>
  </Page>

  <AlertDialog :open="dialogOpen" @update:open="dialogOpen = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('plugins.disableAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ disableMessage }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="dialogOpen = false">{{ t('plugins.disableAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="applyToggle">{{ t('plugins.disableAlert.disable') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
