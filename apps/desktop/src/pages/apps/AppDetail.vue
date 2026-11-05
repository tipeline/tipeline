<script setup lang="ts">
import { ref, shallowRef, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Page from '@/components/Page.vue';
import NotFoundState from '@/components/NotFoundState.vue';
import { openInWindow as openPageInWindow, windowPaths } from '@/utils/detachedWindows';
import AppRunner from '@/components/app/AppRunner.vue';
import Dialog from '@/components/Dialog.vue';
import ImageUploadField from '@/components/forms/ImageUploadField.vue';
import { Input } from '@/components/ui/input';
import MarkdownTextarea from '@/components/forms/MarkdownTextarea.vue';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { useQuery } from '@/composables/useQuery';
import { useAppStore } from '@/store/app';
import { useRecentItemsStore } from '@/store/recentItems';
import StarButton from '@/components/StarButton.vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { fileSlug } from '@tipeline/utils';
import { getAppFileTrust, setAppFileTrust } from '@/utils/appOpen';
import { Switch } from '@/components/ui/switch';
import { toAssetUrl } from '@/utils/assetUrl';
import type { AppSource } from '@tipeline/schemas';
import { Button } from '@/components/ui/button';
import { ArrowUpCircle, Hammer, Settings2, AppWindow, TriangleAlert, ExternalLink, Download } from 'lucide-vue-next';
import HubSourceBlock from '@/components/hub/HubSourceBlock.vue';
import HubUpdateDialog from '@/components/hub/HubUpdateDialog.vue';
import { useAppExport } from '@/composables/useAppExport';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { translateError } = useErrorT();
const identifier = route.params.aid as string;

const appStore = useAppStore();
const recentItemsStore = useRecentItemsStore();
const { data: result, isLoading, refetch } = useQuery(SEND.APP_DETAIL, { identifier });
const notFound = computed(() => !isLoading.value && !result.value);

const hubUpdateReady = computed(
  () =>
    result.value?.source_type === 'hub' &&
    result.value?.hub_status === 'ok' &&
    ['available', 'major'].includes(result.value?.hub_update_state)
);
const hubReviewOpen = ref(false);

const appImageUrl = computed(() => toAssetUrl(result.value?.metadata?.image));

const editOpen = ref(false);
const isSavingMeta = ref(false);
const editForm = ref({ name: '', description: '', author: '', version: '' });
const editImage = ref<string | null>(null);
// File access on this computer (not part of the app: an app can't grant it to itself).
const fileAnywhere = ref(false);

async function openEdit() {
  if (!result.value) return;
  editForm.value = {
    name: result.value.name ?? '',
    description: result.value.description ?? '',
    author: result.value.author ?? '',
    version: result.value.version ?? '',
  };
  editImage.value = result.value.metadata?.image ?? null;
  fileAnywhere.value = await getAppFileTrust(identifier);
  editOpen.value = true;
}

// The app on its own, in a run-only window (no builder, no sidebar).
function openInWindow() {
  openPageInWindow(windowPaths.app(identifier), result.value?.name);
}

async function saveEdit() {
  isSavingMeta.value = true;
  try {
    await invokeCore(SEND.APP_UPDATE_META, { identifier, ...editForm.value });
    await setAppFileTrust(identifier, fileAnywhere.value);
    await refetch({ identifier });
    editOpen.value = false;
  } catch (e: any) {
    toast.error(t('apps.saveFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isSavingMeta.value = false;
  }
}

watch(result, (app) => {
  if (app) {
    appStore.setApp(app);
    recentItemsStore.markOpened('app', identifier, app.name, app.metadata?.image);
  }
}, { immediate: true });

// Core returns the source already migrated to the current schema (or `source_error`
// when it can't be). Re-parse only when the source text changes, so refetching the
// app after a metadata edit doesn't restart the page.
const source = shallowRef<AppSource | null>(null);
watch(
  () => result.value?.source as string | undefined,
  (text) => {
    if (!text || result.value?.source_error) {
      source.value = null;
      return;
    }
    try {
      source.value = JSON.parse(text);
    } catch {
      source.value = null;
    }
  },
  { immediate: true }
);
const sourceError = computed(() => (result.value?.source_error ? translateError(result.value.source_error) : null));

const { isExporting, exportApps } = useAppExport();

function exportApp() {
  if (!result.value || isExporting.value) return;
  exportApps(fileSlug(result.value.name, 'app'), [identifier]);
}

useKeyboardShortcuts([
  {
    key: 'e',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => !!result.value),
    handler: () => exportApp(),
  },
]);

</script>

<template>
  <Dialog v-model="editOpen" :title="t('apps.editDialog.title')" :description="t('apps.editDialog.description')">
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('apps.form.image') }}</label>
        <ImageUploadField
          kind="app"
          :identifier="identifier"
          v-model="editImage"
          :placeholder-icon="AppWindow"
          @update:model-value="refetch({ identifier })"
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('apps.form.name') }}</label>
        <Input v-model="editForm.name" :placeholder="t('apps.form.namePlaceholder')" />
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('apps.form.description') }}</label>
        <MarkdownTextarea v-model="editForm.description" :placeholder="t('apps.form.descriptionPlaceholder')" rows="3" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('apps.form.author') }}</label>
          <Input v-model="editForm.author" :placeholder="t('apps.form.authorPlaceholder')" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('apps.form.version') }}</label>
          <Input v-model="editForm.version" :placeholder="t('apps.form.versionPlaceholder')" />
        </div>
      </div>
      <!-- File access on this computer: set here, never by the app itself. -->
      <div class="rounded-md border p-3 space-y-2" data-testid="file-access">
        <div class="flex items-center justify-between gap-3">
          <label for="file-anywhere" class="text-sm font-medium">{{ t('apps.fileAccess.label') }}</label>
          <Switch id="file-anywhere" v-model="fileAnywhere" />
        </div>
        <p class="text-xs text-muted-foreground m-0">
          {{ fileAnywhere ? t('apps.fileAccess.anywhere') : t('apps.fileAccess.tipelineOnly') }}
        </p>
        <p v-if="fileAnywhere" class="text-xs text-amber-700 dark:text-amber-400 m-0">{{ t('apps.fileAccess.warning') }}</p>
      </div>
      <HubSourceBlock
        v-if="result?.source_type === 'hub'"
        class="rounded-md border p-3"
        :item="result"
        type="app"
        @changed="refetch()"
      />
    </div>
    <template #footer>
      <Button :disabled="isSavingMeta" @click="saveEdit">
        {{ isSavingMeta ? t('common.saving') : t('common.save') }}
      </Button>
    </template>
  </Dialog>


  <HubUpdateDialog v-if="hubUpdateReady" v-model="hubReviewOpen" type="app" :identifier="identifier" @updated="refetch()" />

  <Page>
    <template #title>
      <div class="flex items-center gap-2">
        <div class="size-6 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
          <img v-if="appImageUrl" :src="appImageUrl" class="w-full h-full object-cover" />
          <AppWindow v-else class="size-3.5 text-muted-foreground/50" />
        </div>
        <span>{{ result?.name ?? t('apps.title') }}</span>
      </div>
    </template>

    <template #menu>
      <Button v-if="hubUpdateReady" variant="outline" @click="hubReviewOpen = true">
        <ArrowUpCircle class="w-4 h-4" />
        {{ t('hub.reviewUpdate') }}
      </Button>
      <StarButton
        v-if="result"
        variant="button"
        type="app"
        :identifier="identifier"
        :name="result.name"
        :image="result.metadata?.image"
      />
      <Button
        v-if="result && source"
        variant="outline"
        :title="t('apps.openWindowHint')"
        @click="openInWindow"
      >
        <ExternalLink class="w-4 h-4" />
        {{ t('common.openInWindow') }}
      </Button>
      <Button v-if="result" variant="outline" @click="openEdit">
        <Settings2 class="w-4 h-4" />
        {{ t('common.edit') }}
      </Button>
      <Button v-if="result" variant="outline" :disabled="isExporting" @click="exportApp">
        <Download class="w-4 h-4" />
        {{ isExporting ? t('common.exporting') : t('common.export') }}
        <kbd
          class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
        >
          <span class="text-xs">⌘</span>E
        </kbd>
      </Button>
      <div v-if="result" class="w-px h-6 bg-border self-center" />
      <Button v-if="result" @click="router.push(`/apps/${identifier}/edit`)">
        <Hammer class="w-4 h-4" />
        {{ t('common.build') }}
      </Button>
    </template>

    <template #content>
      <NotFoundState
        v-if="notFound"
        :title="t('apps.notFound.title')"
        :description="t('apps.notFound.description')"
        :back-label="t('apps.notFound.back')"
        :back-to="{ name: 'AppsList' }"
        :icon="AppWindow"
      />
      <template v-else-if="result">
        <div
          v-if="sourceError"
          class="flex flex-col items-center justify-center gap-2 h-full text-sm text-center p-6"
        >
          <TriangleAlert class="size-6 text-destructive" />
          <p class="font-medium m-0">{{ t('apps.runtime.invalidSource') }}</p>
          <pre class="text-xs text-muted-foreground whitespace-pre-wrap max-w-2xl m-0">{{ sourceError }}</pre>
        </div>

        <AppRunner
          v-else-if="source"
          :app-identifier="identifier"
          :source="source"
          show-app-bar
          :author="result.author"
          :version="result.version"
        />
      </template>
    </template>
  </Page>
</template>
