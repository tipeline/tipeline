<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Check,
  Code2,
  Eye,
  LayoutGrid,
  Loader2,
  Monitor,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-vue-next';
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
import AssistantButton from '@/components/agent/AssistantButton.vue';

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

// ------------------------------------------------------------------ phone layout

const phone = computed(() => builderStore.canvasDevice === 'phone');
const pageComponents = computed(() => builderStore.selectedPage?.components ?? []);
/** Hidden on phones, anywhere on the page. */
const phoneHidden = computed(() => pageComponents.value.filter((c) => c.mobile?.hidden));
const phoneArranged = computed(() => pageComponents.value.some((c) => !c.mobile?.hidden && c.mobile?.layout));
const menuPages = computed(() => (builderStore.source?.pages ?? []).filter((p) => p.showInMenu !== false));

function setDevice(device: 'desktop' | 'phone') {
  builderStore.canvasDevice = device;
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
// On the phone canvas, Delete takes the component off phones (not out of the app), and
// nothing is added: components are added in the desktop layout.
const onDesktop = computed(() => !phone.value);
function removeSelected() {
  const id = builderStore.selectedComponentId!;
  if (phone.value) builderStore.setPhoneHidden(id, true);
  else builderStore.removeComponent(id);
}

useKeyboardShortcuts([
  {
    key: 's',
    meta: true,
    enabled: computed(() => builderStore.isDirty),
    handler: () => void builderStore.save(),
  },
  { key: 'z', meta: true, skipWhenEditable: true, enabled: inDesign, handler: () => builderStore.undo() },
  { key: 'z', meta: true, shift: true, skipWhenEditable: true, enabled: inDesign, handler: () => builderStore.redo() },
  {
    key: 'd',
    meta: true,
    enabled: computed(() => hasSelection.value && onDesktop.value),
    handler: (e) => {
      e.preventDefault();
      duplicateSelected();
    },
  },
  {
    key: 'c',
    meta: true,
    skipWhenEditable: true,
    enabled: hasSelection,
    handler: () => builderStore.copyComponent(builderStore.selectedComponentId!),
  },
  {
    key: 'v',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => inDesign.value && onDesktop.value),
    handler: pasteClipboard,
  },
  { key: 'Delete', skipWhenEditable: true, enabled: hasSelection, handler: removeSelected },
  { key: 'Backspace', skipWhenEditable: true, enabled: hasSelection, handler: removeSelected },
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

        <!-- Which layout the canvas edits -->
        <div v-if="mode === 'design'" class="flex items-center rounded-md border p-0.5" role="group" :aria-label="t('builder.phone.device')">
          <Button
            size="sm"
            :variant="phone ? 'ghost' : 'secondary'"
            class="h-7 w-8 px-0"
            :aria-pressed="!phone"
            :aria-label="t('builder.phone.desktop')"
            :title="t('builder.phone.desktop')"
            @click="setDevice('desktop')"
          >
            <Monitor class="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            :variant="phone ? 'secondary' : 'ghost'"
            class="h-7 w-8 px-0"
            :aria-pressed="phone"
            :aria-label="t('builder.phone.phone')"
            :title="t('builder.phone.phone')"
            @click="setDevice('phone')"
          >
            <Smartphone class="w-3.5 h-3.5" />
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
        <div class="w-px h-5 bg-border" />
        <AssistantButton />
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

        <!-- Phone: the page as phones show it, arranged on the phone grid -->
        <div v-else-if="builderStore.selectedPage && phone" class="flex flex-col items-center gap-3">
          <div class="flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-lg border bg-background py-1.5 pl-3 pr-1.5">
            <Smartphone class="size-4 text-muted-foreground" />
            <span class="text-sm">
              <span class="font-medium">{{ t('builder.phone.layout') }}</span>
              <span class="text-muted-foreground">
                · {{ phoneArranged ? t('builder.phone.arranged') : t('builder.phone.automatic') }}
              </span>
            </span>
            <span class="flex-1" />
            <Button size="sm" variant="outline" class="h-7" :disabled="!phoneArranged" @click="builderStore.resetPhoneLayout()">
              <RotateCcw class="w-3.5 h-3.5 mr-1" /> {{ t('builder.phone.reset') }}
            </Button>
          </div>

          <div class="flex flex-wrap items-start justify-center gap-6">
            <div class="builder-phone shrink-0" data-builder-phone>
              <div class="border-b bg-background px-3 pb-2 pt-6">
                <p class="m-0 mb-2 text-center text-sm font-semibold truncate">{{ builderStore.appName }}</p>
                <div v-if="menuPages.length > 1" class="flex gap-1.5 overflow-x-auto">
                  <button
                    v-for="p in menuPages"
                    :key="p.id"
                    type="button"
                    class="h-7 shrink-0 rounded-full px-3 text-xs"
                    :class="p.id === builderStore.selectedPageId ? 'bg-primary text-primary-foreground' : 'bg-muted'"
                    @click="builderStore.selectPage(p.id)"
                  >
                    {{ p.name }}
                  </button>
                </div>
              </div>
              <div class="p-1">
                <BuilderGrid :key="builderStore.selectedPage.id" />
              </div>
            </div>

            <div class="w-52 shrink-0">
              <p class="m-0 mb-2 text-xs font-semibold text-muted-foreground">{{ t('builder.phone.hiddenTitle') }}</p>
              <p v-if="!phoneHidden.length" class="m-0 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
                {{ t('builder.phone.noneHidden') }}
              </p>
              <div class="flex flex-col gap-1.5">
                <div
                  v-for="c in phoneHidden"
                  :key="c.id"
                  class="flex items-center gap-2 rounded-md border bg-background py-1 pl-2.5 pr-1 text-xs"
                  :class="{ 'ring-2 ring-primary': builderStore.selectedComponentId === c.id }"
                >
                  <button type="button" class="min-w-0 flex-1 truncate text-left" @click="builderStore.selectComponent(c.id)">
                    {{ c.name }}
                  </button>
                  <Button size="sm" variant="outline" class="h-6 px-2 text-xs" @click="builderStore.setPhoneHidden(c.id, false)">
                    {{ t('builder.phone.show') }}
                  </Button>
                </div>
              </div>
              <p class="m-0 mt-3 text-xs leading-relaxed text-muted-foreground">{{ t('builder.phone.canvasHint') }}</p>
            </div>
          </div>
        </div>

        <BuilderGrid v-else-if="builderStore.selectedPage" :key="builderStore.selectedPage.id" />
      </div>
    </div>

    <PropertiesSidebar v-if="mode === 'design'" :problems="problems" />
  </SidebarProvider>
</template>

<style scoped>
/* A phone's width (390px) inside its frame; it grows with the page. */
.builder-phone {
  width: 390px;
  min-height: 720px;
  border: 10px solid #1c1c1c;
  border-radius: 46px;
  overflow: hidden;
  background: color-mix(in oklab, var(--muted) 40%, var(--background));
  box-sizing: content-box;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
