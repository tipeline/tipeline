<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Check, Code2, Eye, LayoutGrid, Loader2, Play, Redo2, Save, Trash2, TriangleAlert, Undo2 } from 'lucide-vue-next';
import yaml from 'js-yaml';
import { coreValidations } from '@tipeline/schemas';
import AppRunner from '@/components/app/AppRunner.vue';
import TaskCodeEditor from '@/components/task/TaskCodeEditor.vue';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
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
import { APP_CANVAS } from '@/components/app/appCanvasKey';
import { APP_LIST_SAMPLES } from '@/components/app/appRuntimeKey';
import BuilderGrid from './builder/components/BuilderGrid.vue';
import ComponentsSidebar from './builder/components/ComponentsSidebar.vue';
import ProblemsButton from './builder/components/ProblemsButton.vue';
import { useWorkflowCatalog } from '@/composables/useWorkflowCatalog';
import { analyzeApp, type AppProblem } from '@/utils/appProblems';
import { storeToRefs } from 'pinia';
import PropertiesSidebar from './builder/components/PropertiesSidebar.vue';
import { useBuilderStore } from '@/store/builderStore';
import { useRecentItemsStore } from '@/store/recentItems';
import { useErrorT } from '@/composables/useErrorT';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { toast } from '@/components/ui/sonner';

const { t } = useI18n();
const { translateError } = useErrorT();
const route = useRoute();
const router = useRouter();
const builderStore = useBuilderStore();

// Opening the builder counts as opening the app (Recently opened on the dashboard and Apps page).
// The picture isn't loaded here; the lists show the app's current one anyway.
const recentItemsStore = useRecentItemsStore();

onMounted(async () => {
  await builderStore.load(route.params.aid as string);
  if (builderStore.identifier && !builderStore.loadError) {
    recentItemsStore.markOpened('app', builderStore.identifier, builderStore.appName);
  }
  reopenRunnable();
});

// Back from a workflow opened with a runnable's "Edit workflow": reopen that runnable.
function reopenRunnable() {
  const { page, runnable, ...rest } = route.query;
  if (typeof page !== 'string' || typeof runnable !== 'string') return;
  router.replace({ query: rest });
  if (!builderStore.source?.pages.some((p) => p.id === page)) return;
  builderStore.selectPage(page);
  builderStore.focusRequest = { tab: 'data', runnable };
}

// Containers and tabs on the canvas draw their children with the editable grid.
// Preview: list views report their items, so `item.` autocomplete knows their fields.
provide(APP_LIST_SAMPLES, (pageId, listId, items) => builderStore.recordListSample(pageId, listId, items));
provide(APP_CANVAS, {
  grid: BuilderGrid,
  editorTab: (id) => builderStore.editorTabs[id],
  setEditorTab: (id, tab) => builderStore.setEditorTab(id, tab),
});
onBeforeUnmount(() => builderStore.reset());

// Never lose the last edits: flush the pending debounced save before leaving.
onBeforeRouteLeave(async () => {
  await builderStore.save();
});

// ---- modes: design (canvas), yaml (code view), preview (runs the app)
type Mode = 'design' | 'yaml' | 'preview';
const mode = ref<Mode>('design');
const yamlText = ref('');
const yamlErrors = ref<string[]>([]);
const previewKey = ref(0);

function showDesign() {
  mode.value = 'design';
}

function showYaml() {
  if (!builderStore.source) return;
  yamlText.value = yaml.dump(JSON.parse(JSON.stringify(builderStore.source)), { lineWidth: 120, noRefs: true });
  yamlErrors.value = [];
  mode.value = 'yaml';
}

/** Validates the YAML like core does on save; applies it as one undo step. */
function applyYaml() {
  try {
    const data = yaml.load(yamlText.value);
    builderStore.replaceSource(coreValidations.appObject.parseAppSource(data));
    mode.value = 'design';
  } catch (e: any) {
    const [first, ...rest] = String(e?.message ?? e).split('\n');
    yamlErrors.value = first === 'app.validationFailed' ? rest : [first, ...rest].filter(Boolean);
  }
}

/** Saves first: the preview runs workflows through core with the saved app. */
async function showPreview() {
  await builderStore.save();
  if (builderStore.isDirty) return; // the save failed — its toast says why
  previewKey.value++;
  mode.value = 'preview';
}

function duplicateSelected() {
  const id = builderStore.selectedComponentId;
  if (!id) return;
  reportDropped(builderStore.duplicateComponent(id));
}

function pasteClipboard() {
  if (builderStore.clipboard) reportDropped(builderStore.pasteComponent());
}

function reportDropped(count: number) {
  if (count) toast(t('builder.copyDroppedActions', { count }));
}

const inDesign = computed(() => mode.value === 'design');
const hasSelection = computed(() => inDesign.value && !!builderStore.selectedComponentId);

// Edit shortcuts stay out of text fields (skipWhenEditable) so typing keeps its own
// undo, copy and paste; Cmd+S and Cmd+D work everywhere.
useKeyboardShortcuts([
  {
    key: 's',
    meta: true,
    enabled: computed(() => builderStore.isDirty),
    handler: () => void builderStore.save(),
  },
  { key: 'z', meta: true, skipWhenEditable: true, enabled: inDesign, handler: () => builderStore.undo() },
  { key: 'z', meta: true, shift: true, skipWhenEditable: true, enabled: inDesign, handler: () => builderStore.redo() },
  { key: 'd', meta: true, enabled: hasSelection, handler: (e) => { e.preventDefault(); duplicateSelected(); } },
  {
    key: 'c',
    meta: true,
    skipWhenEditable: true,
    enabled: hasSelection,
    handler: () => builderStore.copyComponent(builderStore.selectedComponentId!),
  },
  { key: 'v', meta: true, skipWhenEditable: true, enabled: inDesign, handler: pasteClipboard },
  {
    key: 'Delete',
    skipWhenEditable: true,
    enabled: hasSelection,
    handler: () => builderStore.removeComponent(builderStore.selectedComponentId!),
  },
  {
    key: 'Backspace',
    skipWhenEditable: true,
    enabled: hasSelection,
    handler: () => builderStore.removeComponent(builderStore.selectedComponentId!),
  },
  { key: 'Escape', skipWhenEditable: true, enabled: hasSelection, handler: () => builderStore.selectComponent(null) },
]);

// ---- problems
const { source: sourceRef } = storeToRefs(builderStore);
const { catalog, refresh: refreshCatalog } = useWorkflowCatalog(sourceRef);
const problems = computed(() => (builderStore.source ? analyzeApp(builderStore.source, catalog.value) : []));
const pageNames = computed(() => Object.fromEntries((builderStore.source?.pages ?? []).map((p) => [p.id, p.name])));

function showProblem(problem: AppProblem) {
  if (problem.pageId) builderStore.selectPage(problem.pageId);
  if (problem.componentId) builderStore.selectComponent(problem.componentId);
  builderStore.focusRequest = problem.runnable && !problem.componentId
    ? { tab: 'data', runnable: problem.runnable }
    : { tab: 'properties' };
}

const loadError = computed(() => (builderStore.loadError ? translateError(builderStore.loadError) : null));

// Clearing removes every component on the page and is saved, so it is confirmed first.
const clearDialogOpen = ref(false);
const pageHasComponents = computed(() => (builderStore.selectedPage?.components.length ?? 0) > 0);

function handleClear() {
  builderStore.clearPage();
  clearDialogOpen.value = false;
}
</script>

<template>
  <AlertDialog v-model:open="clearDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('builder.clearPage.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('builder.clearPage.description', { name: builderStore.selectedPage?.name ?? '' }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="handleClear">{{ t('common.clear') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <SidebarProvider class="min-h-0 h-full">
    <ComponentsSidebar v-if="mode === 'design'" />

    <div class="w-full hidden h-full flex-1 flex-col overflow-hidden md:flex">
      <!-- Toolbar -->
      <div class="flex items-center h-12 px-3 border-b shrink-0 gap-2">
        <Button variant="ghost" size="icon" @click="router.back()">
          <ArrowLeft class="w-4 h-4" />
        </Button>
        <div class="w-px h-5 bg-border" />
        <span class="font-semibold text-sm truncate">{{ builderStore.appName }}</span>

        <div class="ml-3 flex items-center rounded-md border p-0.5">
          <Button size="sm" :variant="mode === 'design' ? 'secondary' : 'ghost'" class="h-7 gap-1 px-2" @click="showDesign">
            <LayoutGrid class="w-3.5 h-3.5" /> {{ t('builder.modes.design') }}
          </Button>
          <Button size="sm" :variant="mode === 'yaml' ? 'secondary' : 'ghost'" class="h-7 gap-1 px-2" :disabled="!builderStore.source" @click="showYaml">
            <Code2 class="w-3.5 h-3.5" /> YAML
          </Button>
          <Button size="sm" :variant="mode === 'preview' ? 'secondary' : 'ghost'" class="h-7 gap-1 px-2" :disabled="!builderStore.source" @click="showPreview">
            <Eye class="w-3.5 h-3.5" /> {{ t('builder.modes.preview') }}
          </Button>
        </div>

        <div class="flex-1" />

        <span v-if="builderStore.isSaving" class="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 class="w-3 h-3 animate-spin" />
          {{ t('common.saving') }}
        </span>
        <Transition name="fade">
          <span
            v-if="!builderStore.isSaving && builderStore.savedIndicator"
            class="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <Check class="w-3 h-3 text-green-500" />
            {{ t('common.saved') }}
          </span>
        </Transition>

        <template v-if="mode === 'design'">
        <ProblemsButton :problems="problems" :page-names="pageNames" @select="showProblem" @refresh="refreshCatalog" />
        <div class="flex items-center">
          <Button size="icon" variant="ghost" class="h-8 w-8" :disabled="!builderStore.canUndo" :title="t('builder.undo')" @click="builderStore.undo()">
            <Undo2 class="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" class="h-8 w-8" :disabled="!builderStore.canRedo" :title="t('builder.redo')" @click="builderStore.redo()">
            <Redo2 class="w-4 h-4" />
          </Button>
        </div>
        <div class="w-px h-5 bg-border" />
        <Button size="sm" variant="outline" :disabled="!pageHasComponents" @click="clearDialogOpen = true">
          <Trash2 class="w-3.5 h-3.5 mr-1" />
          {{ t('common.clear') }}
        </Button>
        </template>
        <template v-else-if="mode === 'yaml'">
          <Button size="sm" variant="outline" @click="showDesign">{{ t('builder.discardCode') }}</Button>
          <Button size="sm" @click="applyYaml"><Check class="w-3.5 h-3.5 mr-1" />{{ t('builder.applyCode') }}</Button>
        </template>
        <Button size="sm" :disabled="!builderStore.isDirty" @click="builderStore.save()">
          <Save class="w-3.5 h-3.5 mr-1" />
          {{ t('common.save') }}
        </Button>
      </div>

      <!-- YAML -->
      <div v-if="mode === 'yaml'" class="flex-1 min-h-0">
        <TaskCodeEditor v-model="yamlText" :errors="yamlErrors" />
      </div>

      <!-- Preview: the saved app, running for real -->
      <div v-else-if="mode === 'preview'" class="flex-1 min-h-0 flex flex-col">
        <div class="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300 shrink-0">
          <Play class="size-3.5" /> {{ t('builder.previewNotice') }}
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3">
          <AppRunner
            v-if="builderStore.source && builderStore.identifier"
            :key="previewKey"
            :app-identifier="builderStore.identifier"
            :source="builderStore.source"
            :initial-page-id="builderStore.selectedPageId"
          />
        </div>
      </div>

      <!-- Canvas -->
      <div v-else class="overflow-y-auto flex-1 min-h-0 bg-muted/20 p-3">
        <div
          v-if="loadError"
          class="flex flex-col items-center justify-center gap-2 h-full text-sm text-center p-6"
        >
          <TriangleAlert class="size-6 text-destructive" />
          <p class="font-medium m-0">{{ t('apps.runtime.invalidSource') }}</p>
          <pre class="text-xs text-muted-foreground whitespace-pre-wrap max-w-2xl m-0">{{ loadError }}</pre>
        </div>

        <BuilderGrid v-else-if="builderStore.selectedPage" :key="builderStore.selectedPage.id" />
      </div>
    </div>

    <PropertiesSidebar v-if="mode === 'design'" :problems="problems" />
  </SidebarProvider>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
