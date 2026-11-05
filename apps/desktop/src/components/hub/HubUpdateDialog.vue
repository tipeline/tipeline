<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from '@/components/Dialog.vue';
import { Button } from '@/components/ui/button';
import { Loader2Icon, TriangleAlert } from 'lucide-vue-next';
import { toast } from '@/components/ui/sonner';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { capabilityKey } from '@/utils/capabilities';
import { useHubUpdatesStore, type HubItemType } from '@/store/hubUpdatesStore';

/** Shows what a hub update would change, and installs it if the user agrees. */
const props = defineProps<{
  modelValue: boolean;
  type: HubItemType;
  identifier: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'updated', item: any): void;
}>();

const { t } = useI18n();
const hubUpdates = useHubUpdatesStore();

const UPDATE_CHANNEL = {
  task: SEND.HUB_UPDATE_TASK,
  app: SEND.HUB_UPDATE_APP,
  plugin: SEND.HUB_UPDATE_PLUGIN,
};

const preview = ref<any>(null);
const loading = ref(false);
const installing = ref(false);
const error = ref('');

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    preview.value = null;
    error.value = '';
    loading.value = true;
    try {
      preview.value = await invokeCore(SEND.HUB_PREVIEW_UPDATE, {
        type: props.type,
        identifier: props.identifier,
      });
    } catch (e: any) {
      error.value = e?.message ?? String(e);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);

const isMajor = computed(() => preview.value?.state === 'major');
const workflow = computed(() => preview.value?.workflow);

// One line per kind of change, leaving out the kinds with nothing in them.
const contract = computed(() => {
  const w = workflow.value;
  if (!w) return [];
  return [
    { key: 'inputsRemoved', names: w.inputs.removed, breaking: true },
    { key: 'inputsChanged', names: w.inputs.changed, breaking: true },
    { key: 'inputsAdded', names: w.inputs.added, breaking: false },
    { key: 'outputsRemoved', names: w.outputs.removed, breaking: true },
    { key: 'outputsChanged', names: w.outputs.changed, breaking: true },
    { key: 'outputsAdded', names: w.outputs.added, breaking: false },
  ].filter((row) => row.names.length);
});

const stepsLine = computed(() => {
  const steps = workflow.value?.steps;
  if (!steps) return '';
  const parts = [
    steps.addedCount && t('hub.review.stepsAdded', steps.addedCount),
    steps.removedCount && t('hub.review.stepsRemoved', steps.removedCount),
    steps.changed && t('hub.review.stepsChanged', steps.changed),
  ].filter(Boolean);
  return parts.join(', ');
});

const hasDependents = computed(() => {
  const used = workflow.value?.usedBy;
  return !!used && (used.apps.length > 0 || used.workflows.length > 0 || used.schedules > 0);
});

async function install() {
  installing.value = true;
  try {
    const updated = await invokeCore<any>(UPDATE_CHANNEL[props.type], { identifier: props.identifier });
    emit('updated', updated);
    emit('update:modelValue', false);
    void hubUpdates.refresh();
  } catch (e: any) {
    toast.error(t('hub.updateFailed'), { description: e?.message ?? String(e) });
    void hubUpdates.refresh();
  } finally {
    installing.value = false;
  }
}
</script>

<template>
  <Dialog
    :model-value="modelValue"
    content-class="sm:max-w-[520px]"
    :title="preview ? t('hub.review.title', { name: preview.name }) : t('hub.review.loadingTitle')"
    :description="
      preview ? t('hub.review.versions', { from: preview.fromVersion ?? '—', to: preview.toVersion }) : undefined
    "
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon class="size-4 animate-spin" />
      {{ t('hub.review.loading') }}
    </div>

    <p v-else-if="error" class="text-sm text-destructive m-0">{{ error }}</p>

    <div v-else-if="preview" class="space-y-4 text-sm">
      <div v-if="isMajor" class="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
        <TriangleAlert class="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <p class="m-0">{{ t('hub.review.majorNote') }}</p>
      </div>

      <template v-if="workflow">
        <section v-if="contract.length" class="space-y-1">
          <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide m-0">
            {{ t('hub.review.contract') }}
          </h4>
          <p v-for="row in contract" :key="row.key" class="m-0">
            <span :class="row.breaking ? 'text-destructive' : ''">{{ t(`hub.review.${row.key}`) }}:</span>
            {{ ' ' }}<span class="font-mono text-xs">{{ row.names.join(', ') }}</span>
          </p>
        </section>

        <section v-if="stepsLine" class="space-y-1">
          <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide m-0">
            {{ t('hub.review.steps') }}
          </h4>
          <p class="m-0">{{ stepsLine }}</p>
        </section>

        <section v-if="workflow.newAccess.length" class="space-y-1">
          <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide m-0">
            {{ t('hub.review.newAccess') }}
          </h4>
          <ul class="m-0 pl-4 list-disc">
            <li v-for="capability in workflow.newAccess" :key="capability">
              {{ t(`capabilities.can.${capabilityKey(capability)}`) }}
            </li>
          </ul>
        </section>

        <section v-if="hasDependents" class="space-y-1">
          <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide m-0">
            {{ t('hub.review.usedBy') }}
          </h4>
          <p v-if="workflow.usedBy.apps.length" class="m-0">
            {{ t('hub.review.usedByApps', { names: workflow.usedBy.apps.join(', ') }) }}
          </p>
          <p v-if="workflow.usedBy.workflows.length" class="m-0">
            {{ t('hub.review.usedByWorkflows', { names: workflow.usedBy.workflows.join(', ') }) }}
          </p>
          <p v-if="workflow.usedBy.schedules" class="m-0">
            {{ t('hub.review.usedBySchedules', workflow.usedBy.schedules) }}
          </p>
        </section>

        <p class="text-xs text-muted-foreground m-0">{{ t('hub.review.overwrites') }}</p>
      </template>

      <template v-else-if="preview.app">
        <section v-if="preview.app.pages.added.length || preview.app.pages.removed.length" class="space-y-1">
          <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide m-0">
            {{ t('hub.review.pages') }}
          </h4>
          <p v-if="preview.app.pages.removed.length" class="m-0">
            <span class="text-destructive">{{ t('hub.review.pagesRemoved') }}:</span>
            {{ preview.app.pages.removed.join(', ') }}
          </p>
          <p v-if="preview.app.pages.added.length" class="m-0">
            {{ t('hub.review.pagesAdded') }}: {{ preview.app.pages.added.join(', ') }}
          </p>
        </section>
        <p class="text-xs text-muted-foreground m-0">{{ t('hub.review.appNoUndo') }}</p>
      </template>

      <p v-else class="m-0">{{ t('hub.review.pluginNote') }}</p>
    </div>

    <template #footer>
      <Button v-if="preview" :disabled="installing" @click="install">
        <Loader2Icon v-if="installing" class="size-4 animate-spin" />
        {{ installing ? t('hub.updating') : t('hub.review.install', { version: preview.toVersion }) }}
      </Button>
      <Button variant="outline" :disabled="installing" @click="emit('update:modelValue', false)">
        {{ t('common.cancel') }}
      </Button>
    </template>
  </Dialog>
</template>
