<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { TriangleAlert, Workflow, AppWindow, Loader2 } from 'lucide-vue-next';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { userLabel, type WorkflowUser } from '@/composables/useWorkflowUsage';
import { defaultDeleteSelection, inOtherProjects, outsideUsers, type DeleteSelection } from '@tipeline/utils';
import { deleteProject, type ProjectDeletePreview } from '@/utils/projectDelete';

// Deleting a project keeps its workflows and apps unless you choose to delete them too.
// Then each one is listed with a tick: a workflow something outside the deletion still
// uses starts unticked (and says what uses it), and ticking it anyway says what breaks.
// One that is also in another project has no tick: it's only taken out of this one.
const props = defineProps<{ identifier: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ deleted: [] }>();

const { t } = useI18n();
const { translateError } = useErrorT();

const preview = ref<ProjectDeletePreview | null>(null);
const loading = ref(false);
const previewFailed = ref(false);
const mode = ref<'keep' | 'delete'>('keep');
const selection = ref<DeleteSelection>({ workflows: new Set(), apps: new Set() });
const isDeleting = ref(false);

watch(open, async (isOpen) => {
  mode.value = 'keep';
  preview.value = null;
  previewFailed.value = false;
  if (!isOpen) return;
  loading.value = true;
  try {
    preview.value = await invokeCore<ProjectDeletePreview>(SEND.PROJECT_DELETE_PREVIEW, {
      identifier: props.identifier,
    });
    if (preview.value) selection.value = defaultDeleteSelection(preview.value);
    else previewFailed.value = true;
  } catch {
    // Without a preview there's only the plain delete, which keeps everything.
    previewFailed.value = true;
  } finally {
    loading.value = false;
  }
});

const itemCount = computed(() => (preview.value?.workflows.length ?? 0) + (preview.value?.apps.length ?? 0));
const tickedCount = computed(() => selection.value.workflows.size + selection.value.apps.size);

const names = (users: WorkflowUser[]) => users.map((u) => userLabel(u)).join(', ');

/** Per workflow: what still uses it if the current ticks go ahead. */
const rows = computed(() =>
  (preview.value?.workflows ?? []).map((workflow) => {
    const outside = outsideUsers(workflow, selection.value);
    return {
      ...workflow,
      elsewhere: inOtherProjects(workflow),
      ticked: selection.value.workflows.has(workflow.identifier),
      outsideApps: outside.apps,
      outsideWorkflows: outside.workflows,
      used: outside.apps.length + outside.workflows.length > 0,
    };
  })
);
const keptBecauseUsed = computed(() => rows.value.filter((r) => !r.ticked && !r.elsewhere && r.used).length);
const alsoInNames = (item: { alsoIn?: { name: string }[] }) => (item.alsoIn ?? []).map((p) => p.name).join(', ');
const breaking = computed(() => rows.value.filter((r) => r.ticked && r.used).length);

function setTicked(kind: keyof DeleteSelection, identifier: string, ticked: boolean) {
  const next = new Set(selection.value[kind]);
  if (ticked) next.add(identifier);
  else next.delete(identifier);
  selection.value = { ...selection.value, [kind]: next };
}

const confirmLabel = computed(() => {
  if (isDeleting.value) return t('common.deleting');
  if (mode.value === 'delete' && tickedCount.value > 0) return t('projects.deleteAlert.deleteWithItems', tickedCount.value);
  return t('projects.deleteAlert.delete');
});

async function confirmDelete() {
  isDeleting.value = true;
  try {
    const withContents = mode.value === 'delete' && tickedCount.value > 0;
    await deleteProject(
      props.identifier,
      withContents ? { workflows: [...selection.value.workflows], apps: [...selection.value.apps] } : undefined
    );
    open.value = false;
    toast.success(withContents ? t('projects.deleteAlert.deletedWithItems', tickedCount.value) : t('projects.deleteAlert.deleted'));
    emit('deleted');
  } catch (e: any) {
    toast.error(t('projects.deleteAlert.failed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent class="max-w-lg">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('projects.deleteAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          <template v-if="previewFailed">{{ t('projects.deleteAlert.previewFailed') }}</template>
          <template v-else-if="itemCount > 0 || loading">{{ t('projects.deleteAlert.chooseDescription') }}</template>
          <template v-else>{{ t('projects.deleteAlert.emptyDescription') }}</template>
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div v-if="loading" class="flex justify-center py-4">
        <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
      </div>

      <template v-else-if="preview && itemCount > 0">
        <RadioGroup v-model="mode" class="gap-2">
          <Label class="flex items-start gap-2.5 rounded-md border p-3 cursor-pointer font-normal has-[[data-state=checked]]:border-primary">
            <RadioGroupItem value="keep" class="mt-0.5" />
            <span class="space-y-0.5">
              <span class="block text-sm font-medium">{{ t('projects.deleteAlert.keep') }}</span>
              <span class="block text-xs text-muted-foreground">{{ t('projects.deleteAlert.keepHint') }}</span>
            </span>
          </Label>
          <Label class="flex items-start gap-2.5 rounded-md border p-3 cursor-pointer font-normal has-[[data-state=checked]]:border-primary">
            <RadioGroupItem value="delete" class="mt-0.5" />
            <span class="space-y-0.5">
              <span class="block text-sm font-medium">
                {{ t('projects.deleteAlert.deleteContents') }}
              </span>
              <span class="block text-xs text-muted-foreground">{{ t('projects.deleteAlert.deleteContentsHint') }}</span>
            </span>
          </Label>
        </RadioGroup>

        <template v-if="mode === 'delete'">
          <div
            v-if="keptBecauseUsed > 0 || breaking > 0"
            class="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            <TriangleAlert class="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div class="space-y-1">
              <p v-if="keptBecauseUsed > 0">{{ t('projects.deleteAlert.keptBecauseUsed', keptBecauseUsed) }}</p>
              <p v-if="breaking > 0">{{ t('projects.deleteAlert.breaking', breaking) }}</p>
            </div>
          </div>

          <ul class="max-h-72 overflow-y-auto scroll-fade rounded-md border divide-y text-sm">
            <li v-for="row in rows" :key="`task:${row.identifier}`" class="px-3 py-2 min-w-0">
              <label class="flex items-center gap-2 min-w-0" :class="row.elsewhere ? 'cursor-default' : 'cursor-pointer'">
                <Checkbox
                  :model-value="row.ticked"
                  :disabled="row.elsewhere"
                  @update:model-value="(v) => setTicked('workflows', row.identifier, v === true)"
                />
                <Workflow class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate font-medium" :class="row.elsewhere ? 'text-muted-foreground' : ''">{{ row.name }}</span>
                <TriangleAlert
                  v-if="row.used && row.ticked"
                  class="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                />
              </label>
              <p v-if="row.elsewhere" class="pl-6 text-xs text-muted-foreground truncate">
                {{ t('projects.deleteAlert.alsoIn', { names: alsoInNames(row) }) }}
              </p>
              <div v-else class="pl-6 text-xs text-muted-foreground space-y-0.5">
                <p v-if="row.outsideApps.length" class="truncate" :title="names(row.outsideApps)">
                  {{ t(row.ticked ? 'projects.deleteAlert.appsBreak' : 'projects.deleteAlert.usedByApps', { names: names(row.outsideApps) }) }}
                </p>
                <p v-if="row.outsideWorkflows.length" class="truncate" :title="names(row.outsideWorkflows)">
                  {{ t(row.ticked ? 'projects.deleteAlert.workflowsBreak' : 'projects.deleteAlert.calledBy', { names: names(row.outsideWorkflows) }) }}
                </p>
                <p v-if="row.ticked && row.schedules.length">{{ t('tasks.bulkDelete.schedules', row.schedules.length) }}</p>
              </div>
            </li>
            <li v-for="app in preview.apps" :key="`app:${app.identifier}`" class="px-3 py-2 min-w-0">
              <label class="flex items-center gap-2 min-w-0" :class="inOtherProjects(app) ? 'cursor-default' : 'cursor-pointer'">
                <Checkbox
                  :model-value="selection.apps.has(app.identifier)"
                  :disabled="inOtherProjects(app)"
                  @update:model-value="(v) => setTicked('apps', app.identifier, v === true)"
                />
                <AppWindow class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate font-medium" :class="inOtherProjects(app) ? 'text-muted-foreground' : ''">{{ app.name }}</span>
              </label>
              <p v-if="inOtherProjects(app)" class="pl-6 text-xs text-muted-foreground truncate">
                {{ t('projects.deleteAlert.alsoIn', { names: alsoInNames(app) }) }}
              </p>
            </li>
          </ul>
          <p class="text-xs text-muted-foreground">{{ t('projects.deleteAlert.untickedStay') }}</p>
        </template>
      </template>

      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isDeleting">{{ t('projects.deleteAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          :disabled="isDeleting || loading"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click.prevent="confirmDelete"
        >
          {{ confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
