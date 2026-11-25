<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AppWindow,
  Boxes,
  ExternalLink,
  FileText,
  Puzzle,
  Workflow,
} from 'lucide-vue-next';
import CapabilityList from '@/components/task/CapabilityList.vue';
import { invokeCore } from '@/utils/invoke';
import { renderMarkdown } from '@/utils/appMarkdown';
import { formatBytes } from '@/utils/appFiles';
import { toAssetUrl } from '@/utils/assetUrl';
import { SEND } from '@/ipc-channels';
import type { CapabilityReport } from '@/utils/capabilities';

export type HubDrawerItem = {
  type: 'task' | 'app' | 'plugin';
  identifier: string;
  name: string;
  description?: string;
  author?: string;
  version: string;
  updatedAt?: string;
  image?: string;
};

// What Core's hubItemDetail reads from the item's file (apps/core/src/hub/HubItemDetail.ts).
type Field = {
  name: string;
  type: string;
  label?: string;
  description?: string;
  required?: boolean;
};
type MissingPlugin = {
  group: string;
  state: string;
  pluginName?: string;
  hubPlugin?: { name: string };
};
type WorkflowDetail = {
  type: 'task';
  inputs: Field[];
  outputs?: Field[];
  helper?: true;
  steps: number;
  missingPlugins: MissingPlugin[];
  capabilities: CapabilityReport;
};
type AppDetail = {
  type: 'app';
  pages: { id: string; name: string }[];
  workflows: {
    alias: string;
    name: string;
    hubIdentifier?: string;
    notOnHub?: true;
  }[];
  capabilities: CapabilityReport;
  missingPlugins: MissingPlugin[];
};
type PluginDetail = {
  type: 'plugin';
  group?: string;
  license?: string;
  homepage?: string;
  dependencies: { name: string; version: string }[];
  files: { path: string; size: number }[];
};
type Detail = WorkflowDetail | AppDetail | PluginDetail;

const props = defineProps<{
  item: HubDrawerItem | null;
  hubId: string | null;
  hubName: string;
  installed: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ close: []; install: [item: HubDrawerItem] }>();

const { t, locale } = useI18n();
const PLACEHOLDER_ICON = {
  task: Workflow,
  app: AppWindow,
  plugin: Boxes,
} as const;

const detail = ref<Detail | null>(null);
const loading = ref(false);
const error = ref('');
const brokenImage = ref(false);
let requested = '';

watch(
  () =>
    [
      props.item?.type,
      props.item?.identifier,
      props.item?.version,
      props.hubId,
    ] as const,
  async () => {
    const item = props.item;
    detail.value = null;
    error.value = '';
    brokenImage.value = false;
    if (!item || !props.hubId) return;
    const key = `${props.hubId}:${item.type}:${item.identifier}:${item.version}`;
    requested = key;
    loading.value = true;
    try {
      const result = await invokeCore<Detail>(SEND.HUB_ITEM_DETAIL, {
        hubId: props.hubId,
        type: item.type,
        itemIdentifier: item.identifier,
      });
      if (requested === key) detail.value = result;
    } catch (e: any) {
      if (requested === key) error.value = e?.message ?? String(e);
    } finally {
      if (requested === key) loading.value = false;
    }
  },
  { immediate: true }
);

const open = computed({
  get: () => !!props.item,
  set: (value: boolean) => {
    if (!value) emit('close');
  },
});

const descriptionHtml = computed(() =>
  renderMarkdown(props.item?.description ?? '')
);
const imageSrc = computed(() =>
  brokenImage.value ? null : toAssetUrl(props.item?.image)
);
const updated = computed(() => {
  if (!props.item?.updatedAt) return '';
  const date = new Date(props.item.updatedAt);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(locale.value);
});

const workflow = computed(() =>
  detail.value?.type === 'task' ? detail.value : null
);
const app = computed(() =>
  detail.value?.type === 'app' ? detail.value : null
);
const plugin = computed(() =>
  detail.value?.type === 'plugin' ? detail.value : null
);
const report = computed(
  () => workflow.value?.capabilities ?? app.value?.capabilities ?? null
);
const onlyData = computed(
  () =>
    !!report.value &&
    report.value.capabilities.length === 0 &&
    report.value.unknownWorkflows.length === 0
);
const missingPlugins = computed(
  () => workflow.value?.missingPlugins ?? app.value?.missingPlugins ?? []
);

const fieldLabel = (field: Field) => field.label || field.name;
const pluginLabel = (plugin: MissingPlugin) =>
  plugin.pluginName ?? plugin.hubPlugin?.name ?? plugin.group;
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="right"
      class="w-full gap-0 sm:max-w-lg"
      data-testid="hub-item-drawer"
    >
      <template v-if="item">
        <SheetHeader class="shrink-0 border-b pr-12">
          <SheetTitle class="leading-tight">{{ item.name }}</SheetTitle>
          <SheetDescription
            class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
          >
            <span>{{ item.author ?? '—' }}</span>
            <span class="font-mono">v{{ item.version }}</span>
            <span v-if="updated"
              >· {{ t('hub.detail.updated', { date: updated }) }}</span
            >
            <span>· {{ t('hub.detail.from', { hub: hubName }) }}</span>
          </SheetDescription>
        </SheetHeader>

        <div
          class="flex-1 min-h-0 overflow-y-auto scroll-fade p-4 space-y-5 text-sm"
        >
          <div
            class="aspect-video w-full rounded-md bg-muted flex items-center justify-center overflow-hidden"
          >
            <img
              v-if="imageSrc"
              :src="imageSrc"
              :alt="item.name"
              class="w-full h-full object-contain p-6"
              @error="brokenImage = true"
            />
            <component
              :is="PLACEHOLDER_ICON[item.type]"
              v-else
              class="size-12 text-muted-foreground/40"
            />
          </div>

          <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
          <div
            v-if="item.description?.trim()"
            class="app-markdown"
            v-html="descriptionHtml"
          />
          <p v-else class="text-muted-foreground">
            {{ t('hub.detail.noDescription') }}
          </p>

          <div
            v-if="loading"
            class="space-y-3"
            :aria-label="t('hub.detail.loading')"
          >
            <Skeleton class="h-4 w-1/3" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-4 w-1/4" />
            <Skeleton class="h-10 w-full" />
          </div>
          <p
            v-else-if="error"
            class="text-red-600 dark:text-red-400 whitespace-pre-wrap wrap-anywhere select-text"
          >
            {{ t('hub.detail.readFailed', { error }) }}
          </p>

          <template v-else-if="detail">
            <!-- Workflow -->
            <template v-if="workflow">
              <div
                class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              >
                <Badge variant="secondary">{{
                  t('hub.detail.steps', workflow.steps)
                }}</Badge>
                <span v-if="workflow.helper">{{ t('hub.detail.helper') }}</span>
              </div>

              <section class="space-y-2" data-testid="hub-detail-inputs">
                <h3 class="font-medium">{{ t('hub.detail.inputs') }}</h3>
                <div
                  v-if="workflow.inputs.length"
                  class="rounded-md border divide-y"
                >
                  <div
                    v-for="field in workflow.inputs"
                    :key="field.name"
                    class="px-3 py-2"
                  >
                    <div class="flex items-center gap-2">
                      <span class="font-medium">{{ fieldLabel(field) }}</span>
                      <span class="font-mono text-xs text-muted-foreground">{{
                        field.type
                      }}</span>
                      <span
                        v-if="field.required"
                        class="text-xs text-muted-foreground"
                        >· {{ t('hub.detail.required') }}</span
                      >
                    </div>
                    <p
                      v-if="field.description"
                      class="text-xs text-muted-foreground mt-0.5"
                    >
                      {{ field.description }}
                    </p>
                  </div>
                </div>
                <p v-else class="text-muted-foreground">
                  {{ t('hub.detail.noInputs') }}
                </p>
              </section>

              <section
                v-if="workflow.outputs?.length"
                class="space-y-2"
                data-testid="hub-detail-outputs"
              >
                <h3 class="font-medium">{{ t('hub.detail.outputs') }}</h3>
                <div class="rounded-md border divide-y">
                  <div
                    v-for="field in workflow.outputs"
                    :key="field.name"
                    class="px-3 py-2"
                  >
                    <div class="flex items-center gap-2">
                      <span class="font-medium">{{ fieldLabel(field) }}</span>
                      <span class="font-mono text-xs text-muted-foreground">{{
                        field.type
                      }}</span>
                    </div>
                    <p
                      v-if="field.description"
                      class="text-xs text-muted-foreground mt-0.5"
                    >
                      {{ field.description }}
                    </p>
                  </div>
                </div>
              </section>
            </template>

            <!-- App -->
            <template v-if="app">
              <section
                v-if="app.pages.length"
                class="space-y-2"
                data-testid="hub-detail-pages"
              >
                <h3 class="font-medium">{{ t('hub.detail.pages') }}</h3>
                <div class="flex flex-wrap gap-1.5">
                  <Badge
                    v-for="page in app.pages"
                    :key="page.id"
                    variant="outline"
                    >{{ page.name }}</Badge
                  >
                </div>
              </section>
              <section
                v-if="app.workflows.length"
                class="space-y-2"
                data-testid="hub-detail-app-workflows"
              >
                <h3 class="font-medium">{{ t('hub.detail.appWorkflows') }}</h3>
                <div class="rounded-md border divide-y">
                  <div
                    v-for="wf in app.workflows"
                    :key="wf.alias"
                    class="flex items-center gap-2 px-3 py-2"
                  >
                    <Workflow class="size-4 shrink-0 text-muted-foreground" />
                    <span class="truncate">{{ wf.name }}</span>
                    <span
                      v-if="wf.notOnHub"
                      class="ml-auto shrink-0 text-xs text-red-600 dark:text-red-400"
                    >
                      {{ t('hub.detail.notOnHub') }}
                    </span>
                    <span
                      v-else-if="!wf.hubIdentifier"
                      class="ml-auto shrink-0 text-xs text-muted-foreground"
                    >
                      {{ t('hub.detail.alreadyInstalledWorkflow') }}
                    </span>
                  </div>
                </div>
              </section>
            </template>

            <!-- Workflow or app: plugins it needs and what it can do -->
            <section
              v-if="missingPlugins.length"
              class="space-y-2"
              data-testid="hub-detail-plugins"
            >
              <h3 class="font-medium">{{ t('hub.detail.needsPlugins') }}</h3>
              <div
                v-for="needed in missingPlugins"
                :key="needed.group"
                class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2"
              >
                <Puzzle
                  class="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                />
                <span>{{
                  t(`agent.hub.plugin.${needed.state}`, {
                    name: pluginLabel(needed),
                    group: needed.group,
                  })
                }}</span>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ t('hub.detail.pluginsFixedOnInstall') }}
              </p>
            </section>
            <section
              v-if="report"
              class="space-y-2"
              data-testid="hub-detail-capabilities"
            >
              <template v-if="onlyData">
                <h3 class="font-medium">{{ t('capabilities.canAccess') }}</h3>
                <p class="text-muted-foreground">
                  {{ t('capabilities.onlyData') }}
                </p>
              </template>
              <CapabilityList
                v-else
                :report="report"
                :heading="app ? t('hub.detail.appCan') : undefined"
              />
            </section>

            <!-- Plugin -->
            <template v-if="plugin">
              <div
                class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2"
              >
                <Puzzle
                  class="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                />
                <span>{{ t('hub.detail.pluginRunsCode') }}</span>
              </div>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <template v-if="plugin.group">
                  <dt class="text-muted-foreground">
                    {{ t('hub.detail.group') }}
                  </dt>
                  <dd class="font-mono">{{ plugin.group }}</dd>
                </template>
                <template v-if="plugin.license">
                  <dt class="text-muted-foreground">
                    {{ t('hub.detail.license') }}
                  </dt>
                  <dd>{{ plugin.license }}</dd>
                </template>
                <template v-if="plugin.homepage">
                  <dt class="text-muted-foreground">
                    {{ t('hub.detail.homepage') }}
                  </dt>
                  <dd class="min-w-0">
                    <a
                      :href="plugin.homepage"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 underline underline-offset-2 break-all"
                    >
                      {{ plugin.homepage
                      }}<ExternalLink class="size-3 shrink-0" />
                    </a>
                  </dd>
                </template>
              </dl>
              <section class="space-y-2" data-testid="hub-detail-dependencies">
                <h3 class="font-medium">{{ t('hub.detail.dependencies') }}</h3>
                <div
                  v-if="plugin.dependencies.length"
                  class="rounded-md border divide-y"
                >
                  <div
                    v-for="dep in plugin.dependencies"
                    :key="dep.name"
                    class="flex items-center gap-2 px-3 py-1.5 font-mono text-xs"
                  >
                    <span class="truncate">{{ dep.name }}</span>
                    <span class="ml-auto shrink-0 text-muted-foreground">{{
                      dep.version
                    }}</span>
                  </div>
                </div>
                <p v-else class="text-muted-foreground">
                  {{ t('hub.detail.noDependencies') }}
                </p>
              </section>
              <section class="space-y-2" data-testid="hub-detail-files">
                <h3 class="font-medium">{{ t('hub.detail.files') }}</h3>
                <div class="rounded-md border divide-y">
                  <div
                    v-for="file in plugin.files"
                    :key="file.path"
                    class="flex items-center gap-2 px-3 py-1.5 text-xs"
                  >
                    <FileText class="size-3.5 shrink-0 text-muted-foreground" />
                    <span class="font-mono truncate">{{ file.path }}</span>
                    <span class="ml-auto shrink-0 text-muted-foreground">{{
                      formatBytes(file.size)
                    }}</span>
                  </div>
                </div>
              </section>
            </template>

            <p class="text-xs text-muted-foreground">
              {{ t('hub.detail.readNote') }}
            </p>
          </template>
        </div>

        <SheetFooter class="shrink-0 border-t flex-row justify-end">
          <Badge v-if="installed" variant="secondary">{{
            t('hub.installed')
          }}</Badge>
          <Button
            v-else
            :disabled="busy"
            data-testid="hub-drawer-install"
            @click="emit('install', item)"
          >
            {{ busy ? t('hub.installing') : t('hub.install') }}
          </Button>
        </SheetFooter>
      </template>
    </SheetContent>
  </Sheet>
</template>
