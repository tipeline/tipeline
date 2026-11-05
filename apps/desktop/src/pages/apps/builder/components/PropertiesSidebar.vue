<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import type { AppAction, AppFormField, AppRunnable, AppTab } from '@tipeline/schemas';
import { coreValidations } from '@tipeline/schemas';
import { Plus, Pencil, Trash2, Play, History, Wand2, Loader2 } from 'lucide-vue-next';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import Dialog from '@/components/Dialog.vue';
import ActionListEditor from './ActionListEditor.vue';
import RunnableEdit from './RunnableEdit.vue';
import NewTaskForm from '@/components/forms/NewTaskForm.vue';
import FormFieldsEditor from './FormFieldsEditor.vue';
import FormGenerate from './FormGenerate.vue';
import TabsEditor from './TabsEditor.vue';
import BindingInput from './BindingInput.vue';
import ExpandableBindingInput from './ExpandableBindingInput.vue';
import BindingHint from './BindingHint.vue';
import JsonEditor from '@/components/JsonEditor.vue';
import CodePropEditor from './CodePropEditor.vue';
import { useBindingAnalyzer } from '@/composables/useBindingAnalyzer';
import { BINDING_SUGGESTIONS } from '../bindingSuggestions';
import { bindingSuggestions } from '@/utils/appSuggestions';
import { bindingScope, itemRootsFor, listItemNames, type AppProblem } from '@/utils/appProblems';
import ProblemNotes from './ProblemNotes.vue';
import { WIDGETS_BY_TYPE, frameOf, isBindable, type PropField } from '@/components/app/widgets/registry';
import { useBuilderStore, type RunnableDraft } from '@/store/builderStore';
import { descendantIds, isContainer, listViewAround, refusedInside } from '@/utils/appTree';
import { useListItemFields } from '@/composables/useListItemFields';
import { storeToRefs } from 'pinia';
import { useQuery } from '@/composables/useQuery';
import { SEND } from '@/ipc-channels';

const { APP_COMPONENT_EVENTS } = coreValidations.appObject;
// Shown in the "fx" tooltip of fields that accept bindings. Kept out of the
// translations because vue-i18n treats braces as placeholders.
// The app's problems (the toolbar's list), shown here next to what they're about.
const props = withDefaults(defineProps<{ problems?: AppProblem[] }>(), { problems: () => [] });

// What a `data` prop takes: data written in, or a binding (kept out of the translations:
// vue-i18n would read the braces as placeholders).
const DATA_PLACEHOLDER = '[{ "name": "Acme" }]  or  {= runnables.records.outputs.records =}';

const builderStore = useBuilderStore();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { data: workflowList, refetch: refetchWorkflows } = useQuery<Array<{ identifier: string; name: string }>>(SEND.TASK_LIST);
const workflows = computed(() => (workflowList.value ?? []).map((w) => ({ identifier: w.identifier, name: w.name })));

const page = computed(() => builderStore.selectedPage);

// Binding autocomplete and reference checks for every field on this page (and the dialogs it opens).
// What `item.<field>` can be, per list view on the page (see useListItemFields). Inside
// a list's template, that list's fields; elsewhere (e.g. a runnable) every list's.
const { source: sourceRef, listSamples } = storeToRefs(builderStore);
const listFields = useListItemFields(sourceRef, computed(() => builderStore.selectedPage), listSamples);
const itemScopesHere = computed(() => {
  const components = page.value?.components ?? [];
  const own = component.value
    ? listViewAround(components, component.value.type === 'listView' ? component.value.id : component.value.parent?.id)
    : undefined;
  const lists = own ? [own] : components.filter((c) => c.type === 'listView');
  return lists.map((list) => {
    const [itemName, indexName] = listItemNames(list);
    return { itemName, indexName, fields: listFields.value[list.id]?.fields ?? [] };
  });
});
const pageSuggestions = computed(() =>
  bindingSuggestions(builderStore.source, builderStore.selectedPageId, { itemScopes: itemScopesHere.value })
);
const handlerSuggestions = computed(() =>
  bindingSuggestions(builderStore.source, builderStore.selectedPageId, { handler: true, itemScopes: itemScopesHere.value })
);
// `item` / `index` resolve inside a list view's template — and in runnables (and the
// page's other fields) when the page has a list, whose items may start them.
const scope = computed(() =>
  builderStore.source && page.value
    ? bindingScope(builderStore.source, page.value, { itemRoots: itemRootsFor(page.value, builderStore.selectedComponent) })
    : null
);
provide(BINDING_SUGGESTIONS, { page: pageSuggestions, handler: handlerSuggestions, scope });
const bindingAnalyzer = useBindingAnalyzer(scope);
const component = computed(() => builderStore.selectedComponent);
const pagesForActions = computed(() => (builderStore.source?.pages ?? []).map((p) => ({ id: p.id, name: p.name })));
const runnableNames = computed(() => Object.keys(page.value?.runnables ?? {}));

// ------------------------------------------------------------------ component

const idInput = ref('');
const idError = ref<string | null>(null);
const nameInput = ref('');
watch(
  () => component.value?.id,
  () => {
    idInput.value = component.value?.id ?? '';
    nameInput.value = component.value?.name ?? '';
    idError.value = null;
  },
  { immediate: true }
);

function saveId() {
  if (!component.value) return;
  const error = builderStore.renameComponent(component.value.id, idInput.value.trim());
  idError.value = error ? t(error) : null;
}

function saveName() {
  if (component.value && nameInput.value.trim()) builderStore.updateComponent(component.value.id, { name: nameInput.value.trim() });
}

// A setting of one kind only (a slider's min, a code input's language) shows for that kind.
const fields = computed<PropField[]>(() => {
  const c = component.value;
  if (!c) return [];
  return (WIDGETS_BY_TYPE[c.type]?.fields ?? []).filter((f) => !f.when || f.when(c.props as Record<string, any>));
});
// A table also fires one `action:<id>` event per row action and one `bulk:<id>` per
// bulk action; a button group one `action:<id>` per button.
const componentEvents = computed<Array<{ name: string; label: string }>>(() => {
  const c = component.value;
  if (!c) return [];
  const events = APP_COMPONENT_EVENTS[c.type].map((name) => ({ name, label: t(`builder.eventNames.${name}`) }));
  if (c.type === 'table') {
    for (const action of (c.props as any).rowActions ?? []) {
      if (action?.id) events.push({ name: `action:${action.id}`, label: t('builder.eventNames.rowAction', { label: action.label ?? action.id }) });
    }
    for (const action of (c.props as any).bulkActions ?? []) {
      if (action?.id) events.push({ name: `bulk:${action.id}`, label: t('builder.eventNames.bulkAction', { label: action.label ?? action.id }) });
    }
  }
  if (c.type === 'custom') {
    for (const name of (c.props as any).eventNames ?? []) {
      if (typeof name === 'string' && name) events.push({ name: `event:${name}`, label: t('builder.eventNames.rowAction', { label: name }) });
    }
  }
  if (c.type === 'buttonGroup') {
    for (const item of (c.props as any).items ?? []) {
      if (item?.id) events.push({ name: `action:${item.id}`, label: t('builder.eventNames.rowAction', { label: item.label ?? item.id }) });
    }
  }
  return events;
});

// ---- problems, by where they are
const pageProblems = computed(() => props.problems.filter((p) => p.pageId === page.value?.id));
const componentProblems = computed(() =>
  component.value ? pageProblems.value.filter((p) => p.componentId === component.value!.id) : []
);
const problemsAtProp = (key: string) => componentProblems.value.filter((p) => p.prop === key);
const problemsAtEvent = (name: string) => componentProblems.value.filter((p) => p.event === name);
const hasErrorAt = (key: string) => problemsAtProp(key).some((p) => p.severity === 'error');
// Anything not shown under a field or an event goes at the top of the panel.
const otherComponentProblems = computed(() => {
  const keys = new Set(fields.value.map((f) => f.key));
  const events = new Set(componentEvents.value.map((e) => e.name));
  return componentProblems.value.filter(
    (p) => !(p.prop && keys.has(p.prop)) && !(p.event && events.has(p.event))
  );
});
// The page's own: its load actions, plus anything not tied to a component or runnable.
const ownPageProblems = computed(() =>
  pageProblems.value.filter((p) => !p.componentId && !p.runnable)
);
const runnableProblems = (name: string) =>
  pageProblems.value.filter((p) => p.runnable === name && !p.componentId);
const runnablesHaveErrors = computed(() =>
  pageProblems.value.some((p) => p.runnable && !p.componentId && p.severity === 'error')
);

const pageComponents = computed(() => (page.value?.components ?? []).map((c) => ({ id: c.id, type: c.type })));

// ---- location: the page's grid, or a container / tab the component can move into
// (not itself, nor anything inside it). Encoded "id" or "id:tab"; the page is PAGE.
const PAGE_LOCATION = '@page';
const locations = computed(() => {
  const c = component.value;
  const components = page.value?.components ?? [];
  if (!c) return [];
  const inside = descendantIds(components, c.id);
  // What moves along: the component and everything in it (all must fit a list's template).
  const moving = [c.type, ...components.filter((x) => inside.has(x.id)).map((x) => x.type)];
  const result = [{ value: PAGE_LOCATION, label: t('builder.location.page') }];
  for (const target of components) {
    if (target.id === c.id || inside.has(target.id) || !isContainer(target)) continue;
    if (refusedInside(components, moving, target.id)) continue;
    if (target.type === 'tabs') {
      for (const tab of ((target.props as any).tabs ?? []) as AppTab[]) {
        result.push({ value: `${target.id}:${tab.id}`, label: `${target.id} › ${tab.label}` });
      }
    } else {
      result.push({ value: target.id, label: target.id });
    }
  }
  return result;
});
const location = computed(() => {
  const parent = component.value?.parent;
  if (!parent) return PAGE_LOCATION;
  return parent.tab ? `${parent.id}:${parent.tab}` : parent.id;
});

function setLocation(value: string) {
  if (!component.value || value === location.value) return;
  if (value === PAGE_LOCATION) return builderStore.moveComponent(component.value.id, null);
  const [id, tab] = value.split(':');
  builderStore.moveComponent(component.value.id, tab ? { id, tab } : { id });
}

// Frame: card or none. Picking the type's default drops the field from the source.
const FRAMES = coreValidations.appObject.APP_COMPONENT_FRAMES;
function setFrame(value: string) {
  if (!component.value) return;
  const frame = value as (typeof FRAMES)[number];
  const typeDefault = frameOf({ type: component.value.type });
  builderStore.updateComponent(component.value.id, { frame: frame === typeDefault ? null : frame });
}

function setPropValue(key: string, value: unknown) {
  if (!component.value) return;
  const next: Record<string, unknown> = { ...(component.value.props as Record<string, unknown>) };
  if (value === undefined || value === false) delete next[key];
  else next[key] = value;
  builderStore.updateComponent(component.value.id, { props: next });
}

// ------------------------------------------------------------------ form: generate from workflow

const generateOpen = ref(false);
const generateRef = ref<InstanceType<typeof FormGenerate> | null>(null);

/**
 * Replaces the form's fields with the workflow's settable variables, and wires Submit
 * to a `<formId>Submit` runnable that sends every field as the matching input, then
 * shows a confirmation and clears the form.
 */
function onGenerate(data: { taskIdentifier: string; workflowName: string; fields: AppFormField[] }) {
  const form = component.value;
  const currentPage = page.value;
  if (!form || form.type !== 'form' || !currentPage) return;
  const alias = builderStore.ensureWorkflowAlias(data.taskIdentifier, data.workflowName);
  const name = `${form.id}Submit`;
  builderStore.saveRunnable(currentPage.runnables[name] ? name : null, name, {
    mode: 'run',
    workflow: alias,
    trigger: 'manual',
    inputs: Object.fromEntries(data.fields.map((f) => [f.name, `{= ${form.id}.values.${f.name} =}`])),
    outputs: [],
    persist: true,
    onSuccess: [
      { type: 'toast', message: t('builder.form.submittedToast', { name: data.workflowName }), variant: 'success' },
      { type: 'reset', component: form.id },
    ],
    // Workflows with an approval step: the submission was taken, so clear the form too.
    onPaused: [
      { type: 'toast', message: t('builder.form.pausedToast', { name: data.workflowName }), variant: 'default' },
      { type: 'reset', component: form.id },
    ],
    onError: [],
  } as AppRunnable);
  const props = form.props as Record<string, unknown>;
  builderStore.updateComponent(form.id, {
    props: { ...props, fields: data.fields, title: props.title || data.workflowName },
    events: { ...((form.events ?? {}) as Record<string, AppAction[]>), submit: [{ type: 'run', runnable: name }] },
  });
  generateOpen.value = false;
}

// A form's fields as one binding: edited like `data` (JSON written in, or a binding).
const BOUND_FIELDS: PropField = { key: 'fields', label: 'fields', type: 'data' };
const fieldsFromDataOn = ref(false);
const fieldsFromData = computed(
  () => fieldsFromDataOn.value || typeof (component.value?.props as any)?.fields === 'string'
);
watch(
  () => component.value?.id,
  () => (fieldsFromDataOn.value = false)
);
function setFieldsFromData(on: boolean) {
  fieldsFromDataOn.value = on;
  // Back to a written list: the binding can't be turned into fields, so start empty.
  if (!on && typeof (component.value?.props as any)?.fields === 'string') setPropValue('fields', []);
}

function propText(field: PropField): string {
  const value = (component.value?.props as Record<string, unknown> | undefined)?.[field.key];
  if (value == null) return '';
  // `data` holds JSON or one binding (a string): a binding is shown as written.
  return field.type === 'json' || typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

function setProp(field: PropField, raw: string) {
  if (!component.value || raw === propText(field)) return;
  const next: Record<string, unknown> = { ...(component.value.props as Record<string, unknown>) };
  const text = raw.trim();
  if (text === '') {
    delete next[field.key];
  } else if (field.type === 'number') {
    const num = Number(text);
    if (Number.isNaN(num)) return;
    next[field.key] = num;
  } else if (field.type === 'data' && /^(\{=[\s\S]*=\}|\{\{[\s\S]*\}\})$/.test(text)) {
    // A binding to the data (e.g. a runnable's output), kept as written.
    next[field.key] = text;
  } else if (field.type === 'json' || field.type === 'data') {
    // The editor shows why it doesn't parse; keep the last valid value meanwhile.
    try {
      next[field.key] = JSON.parse(text);
    } catch {
      return;
    }
  } else {
    next[field.key] = field.numeric && /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : raw;
  }
  builderStore.updateComponent(component.value.id, { props: next });
}

function eventActions(event: string): AppAction[] {
  return ((component.value?.events ?? {}) as Record<string, AppAction[]>)[event] ?? [];
}

function setEventActions(event: string, actions: AppAction[]) {
  if (!component.value) return;
  const next = { ...((component.value.events ?? {}) as Record<string, AppAction[]>) };
  if (actions.length) next[event] = actions;
  else delete next[event];
  builderStore.updateComponent(component.value.id, { events: next });
}

// ------------------------------------------------------------------ page

const pageName = ref('');
const pageIcon = ref('');
watch(
  () => page.value?.id,
  () => {
    pageName.value = page.value?.name ?? '';
    pageIcon.value = page.value?.icon ?? '';
  },
  { immediate: true }
);

const deletePageOpen = ref(false);

const activeTab = ref<string | number>('properties');

// The problems list can ask to show a component's properties or a runnable.
watch(
  () => builderStore.focusRequest,
  (request) => {
    if (!request) return;
    activeTab.value = request.tab;
    if (request.runnable && page.value?.runnables[request.runnable]) openRunnable(request.runnable);
    builderStore.focusRequest = null;
  }
);

// ------------------------------------------------------------------ data (runnables)

const runnableDialogOpen = ref(false);
const editingRunnable = ref<string | null>(null);
const runnableEditRef = ref<InstanceType<typeof RunnableEdit> | null>(null);

function workflowName(alias: string): string {
  const id = builderStore.source?.workflows[alias]?.identifier;
  return workflows.value.find((w) => w.identifier === id)?.name ?? id ?? alias;
}

function openRunnable(name: string | null) {
  editingRunnable.value = name;
  runnableDialogOpen.value = true;
}

function onRunnableSubmit(data: {
  name: string;
  taskIdentifier: string;
  workflowName: string;
  runnable: RunnableDraft;
}) {
  lastSavedRunnable = data.name;
  const alias = builderStore.ensureWorkflowAlias(data.taskIdentifier, data.workflowName);
  builderStore.saveRunnable(editingRunnable.value, data.name, { ...data.runnable, workflow: alias } as AppRunnable);
  runnableDialogOpen.value = false;
}

let lastSavedRunnable: string | null = null;

// Leaving for the workflow builder keeps the runnable when it can be saved; the app
// itself is saved on route leave (AppEdit), and the builder's back arrow returns here.
// This entry is tagged with the runnable first, so coming back reopens its dialog.
async function onEditWorkflow(identifier: string) {
  let reopen = editingRunnable.value;
  if (runnableEditRef.value?.canSubmit) {
    runnableEditRef.value.submit();
    reopen = lastSavedRunnable;
  }
  runnableDialogOpen.value = false;
  if (reopen && page.value) {
    // Awaited: a push fired before the replace commits can drop the replace.
    await router.replace({ query: { ...route.query, page: page.value.id, runnable: reopen } });
  }
  router.push({ name: 'TaskEdit', params: { tid: identifier } });
}

// A workflow created from the runnable dialog becomes its selected workflow.
const newWorkflowOpen = ref(false);
const newWorkflowRef = ref<InstanceType<typeof NewTaskForm> | null>(null);

async function onWorkflowCreated(identifier: string) {
  await refetchWorkflows();
  runnableEditRef.value?.selectWorkflow(identifier);
  newWorkflowOpen.value = false;
}

// ------------------------------------------------------------------ state

const stateRows = ref<Array<{ key: string; value: string }>>([]);
watch(
  () => builderStore.identifier,
  () => {
    stateRows.value = Object.entries(builderStore.source?.state ?? {}).map(([key, value]) => ({
      key,
      value: JSON.stringify(value),
    }));
  },
  { immediate: true }
);

const stateErrors = computed(() =>
  stateRows.value.map((row) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(row.key)) return 'builder.errors.namePattern';
    try {
      JSON.parse(row.value || 'null');
      return null;
    } catch {
      return 'builder.state.invalidJson';
    }
  })
);

function saveState() {
  if (stateErrors.value.some(Boolean)) return;
  const keys = stateRows.value.map((r) => r.key);
  if (new Set(keys).size !== keys.length) return;
  builderStore.setInitialState(Object.fromEntries(stateRows.value.map((r) => [r.key, JSON.parse(r.value || 'null')])));
}
</script>

<template>
  <Dialog
    v-model="runnableDialogOpen"
    :title="editingRunnable ? t('builder.runnable.editTitle') : t('builder.runnable.newTitle')"
    :description="t('builder.runnable.description')"
  >
    <RunnableEdit
      v-if="runnableDialogOpen && page"
      ref="runnableEditRef"
      :name="editingRunnable"
      :runnable="editingRunnable ? page.runnables[editingRunnable] : null"
      :task-identifier="editingRunnable ? (builderStore.source?.workflows[page.runnables[editingRunnable].workflow]?.identifier ?? null) : null"
      :workflows="workflows"
      :taken-names="runnableNames"
      :pages="pagesForActions"
      :runnables="runnableNames"
      :components="pageComponents"
      @submit="onRunnableSubmit"
      @edit-workflow="onEditWorkflow"
      @create-workflow="newWorkflowOpen = true"
    />
    <template #footer>
      <Button variant="outline" @click="runnableDialogOpen = false">{{ t('common.cancel') }}</Button>
      <Button :disabled="!runnableEditRef?.canSubmit" @click="runnableEditRef?.submit()">{{ t('common.save') }}</Button>
    </template>
  </Dialog>

  <Dialog v-model="newWorkflowOpen" :title="t('tasks.new')" :description="t('tasks.newDescription')">
    <NewTaskForm v-if="newWorkflowOpen" ref="newWorkflowRef" :navigate="false" :project="builderStore.projectIdentifier" @created="onWorkflowCreated" />
    <template #footer>
      <Button variant="outline" @click="newWorkflowOpen = false">{{ t('common.cancel') }}</Button>
      <Button :disabled="newWorkflowRef?.isWaiting" @click="newWorkflowRef?.submit()">
        <Loader2 v-if="newWorkflowRef?.isWaiting" class="w-4 h-4 mr-2 animate-spin" />
        {{ newWorkflowRef?.isWaiting ? t('common.creating') : t('common.create') }}
      </Button>
    </template>
  </Dialog>

  <Dialog v-model="generateOpen" :title="t('builder.form.generate')" :description="t('builder.form.generateDescription')">
    <FormGenerate v-if="generateOpen" ref="generateRef" :workflows="workflows" @submit="onGenerate" />
    <template #footer>
      <Button variant="outline" @click="generateOpen = false">{{ t('common.cancel') }}</Button>
      <Button :disabled="!generateRef?.canSubmit" @click="generateRef?.submit()">{{ t('builder.form.generateAction') }}</Button>
    </template>
  </Dialog>

  <Dialog v-model="deletePageOpen" :title="t('builder.deletePage.title')" :description="t('builder.deletePage.description', { name: page?.name ?? '' })">
    <template #footer>
      <Button variant="outline" @click="deletePageOpen = false">{{ t('common.cancel') }}</Button>
      <Button
        variant="destructive"
        @click="page && builderStore.deletePage(page.id); deletePageOpen = false"
      >
        {{ t('common.delete') }}
      </Button>
    </template>
  </Dialog>

  <Sidebar side="right">
    <SidebarContent class="p-2">
      <SidebarGroup>
        <SidebarGroupContent>
          <Tabs v-model="activeTab" class="w-full">
            <TabsList class="w-full">
              <TabsTrigger value="properties">{{ t('builder.properties') }}</TabsTrigger>
              <TabsTrigger value="data" class="gap-1">
                {{ t('builder.dataTab') }}
                <span v-if="runnablesHaveErrors" class="size-1.5 rounded-full bg-destructive" :aria-label="t('builder.problems.title')" />
              </TabsTrigger>
              <TabsTrigger value="state">{{ t('builder.stateTab') }}</TabsTrigger>
            </TabsList>

            <!-- PROPERTIES -->
            <TabsContent value="properties" class="data-[state=inactive]:hidden">
              <!-- Component -->
              <div v-if="component" :key="component.id" class="flex flex-col gap-3 mt-3">
                <Label class="text-xs text-muted-foreground uppercase tracking-wide">
                  {{ t(`builder.components.${component.type}`) }}
                </Label>
                <ProblemNotes :problems="otherComponentProblems" />
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">{{ t('builder.componentId') }}</Label>
                  <Input v-model="idInput" class="h-7 text-xs font-mono" @change="saveId" @keydown.enter="saveId" />
                  <p v-if="idError" class="text-xs text-destructive m-0">{{ idError }}</p>
                  <p v-else class="text-xs text-muted-foreground m-0">{{ t('builder.componentIdHint') }}</p>
                </div>
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">{{ t('builder.componentName') }}</Label>
                  <Input v-model="nameInput" class="h-7 text-xs" @change="saveName" />
                </div>
                <div v-if="locations.length > 1 || component.parent" class="flex flex-col gap-1">
                  <Label class="text-xs">{{ t('builder.location.label') }}</Label>
                  <Select :model-value="location" @update:model-value="(v) => setLocation(String(v))">
                    <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in locations" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div class="flex flex-col gap-1">
                  <Label class="text-xs">{{ t('builder.frame.label') }}</Label>
                  <Select :model-value="frameOf(component)" @update:model-value="(v) => setFrame(String(v))">
                    <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="frame in FRAMES" :key="frame" :value="frame">
                        {{ t(`builder.frame.${frame}`) }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div class="flex flex-col gap-1">
                  <div class="flex items-center justify-between gap-2">
                    <Label class="text-xs">{{ t('builder.fill.label') }}</Label>
                    <Switch
                      :model-value="component.fill === true"
                      @update:model-value="(v: boolean) => builderStore.updateComponent(component!.id, { fill: v })"
                    />
                  </div>
                  <p class="text-xs text-muted-foreground m-0">{{ t('builder.fill.hint') }}</p>
                </div>

                <Separator />
                <div v-for="field in fields" :key="field.key" class="flex flex-col gap-1">
                  <Label class="text-xs flex items-center gap-1">
                    {{ t(`builder.props.${field.label}`) }}
                    <BindingHint v-if="isBindable(field)" />
                  </Label>
                  <div v-if="field.type === 'switch'" class="flex justify-end -mt-6">
                    <Switch
                      :model-value="((component.props as any)[field.key] ?? field.default) === true"
                      @update:model-value="(v: boolean) => setPropValue(field.key, v)"
                    />
                  </div>
                  <template v-else-if="field.type === 'fields'">
                    <!-- Written out one by one, or one binding to a list a workflow returns -->
                    <div class="flex items-center justify-between gap-2">
                      <Label :for="`prop-${component.id}-fromData`" class="text-xs font-normal text-muted-foreground">
                        {{ t('builder.form.fromData') }}
                      </Label>
                      <Switch
                        :id="`prop-${component.id}-fromData`"
                        :model-value="fieldsFromData"
                        @update:model-value="setFieldsFromData"
                      />
                    </div>
                    <template v-if="fieldsFromData">
                      <JsonEditor
                        :model-value="propText(BOUND_FIELDS)"
                        :analyze="bindingAnalyzer"
                        allow-binding
                        :suggestions="pageSuggestions"
                        :expand-label="`${component.name} · ${t('builder.props.fields')}`"
                        placeholder="{= runnables.type.outputs.fields =}"
                        @commit="(v) => setProp(BOUND_FIELDS, v)"
                      />
                      <p class="text-xs text-muted-foreground m-0">{{ t('builder.form.fromDataHint') }}</p>
                    </template>
                    <template v-else>
                      <FormFieldsEditor
                        :model-value="((component.props as any).fields ?? []) as AppFormField[]"
                        @update:model-value="(fields) => setPropValue('fields', fields)"
                      />
                      <Button size="sm" variant="secondary" class="h-7 text-xs" @click="generateOpen = true">
                        <Wand2 class="size-3" /> {{ t('builder.form.generate') }}
                      </Button>
                    </template>
                  </template>
                  <TabsEditor
                    v-else-if="field.type === 'tabs'"
                    :model-value="((component.props as any).tabs ?? []) as AppTab[]"
                    @update:model-value="(tabs) => setPropValue('tabs', tabs)"
                  />
                  <Select
                    v-else-if="field.type === 'select'"
                    :model-value="propText(field) || undefined"
                    @update:model-value="(v) => setProp(field, String(v))"
                  >
                    <SelectTrigger class="h-7 text-xs" :aria-invalid="hasErrorAt(field.key) || undefined"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</SelectItem>
                    </SelectContent>
                  </Select>
                  <!-- Multi-line: expandable to a big editor (with a live preview for Markdown text) -->
                  <ExpandableBindingInput
                    v-else-if="isBindable(field) && field.type === 'textarea'"
                    :model-value="propText(field)"
                    :label="`${component.name} · ${t(`builder.props.${field.label}`)}`"
                    :markdown-preview="component.type === 'text' && field.key === 'content' && (component.props as any).markdown ? (component.props as Record<string, unknown>) : null"
                    @commit="(v) => setProp(field, v)"
                  />
                  <BindingInput
                    v-else-if="isBindable(field) && field.type === 'text'"
                    :model-value="propText(field)"
                    :suggestions="pageSuggestions"
                    @commit="(v) => setProp(field, v)"
                  />
                  <!-- Code (a custom component's HTML): kept as written, expandable to full screen -->
                  <CodePropEditor
                    v-else-if="field.type === 'code'"
                    :id="`prop-${component.id}-${field.key}`"
                    :model-value="propText(field)"
                    :language="field.language"
                    :label="`${component.name} · ${t(`builder.props.${field.label}`)}`"
                    :preview="component.type === 'custom' ? (component.props as Record<string, unknown>) : null"
                    @commit="(v) => setPropValue(field.key, v)"
                  />
                  <!-- JSON (and data: JSON written in, or one binding), expandable to full screen -->
                  <JsonEditor
                    v-else-if="field.type === 'json' || field.type === 'data'"
                    :model-value="propText(field)"
                    :analyze="bindingAnalyzer"
                    :allow-binding="field.type === 'data'"
                    :suggestions="field.type === 'data' ? pageSuggestions : undefined"
                    :expand-label="`${component.name} · ${t(`builder.props.${field.label}`)}`"
                    :placeholder="field.type === 'data' ? DATA_PLACEHOLDER : ''"
                    @commit="(v) => setProp(field, v)"
                  />
                  <Textarea
                    v-else-if="field.type === 'textarea'"
                    :model-value="propText(field)"
                    :rows="3"
                    class="text-xs"
                    :aria-invalid="hasErrorAt(field.key) || undefined"
                    @change="(e: Event) => setProp(field, (e.target as HTMLTextAreaElement).value)"
                  />
                  <Input
                    v-else
                    :type="field.type === 'number' ? 'number' : 'text'"
                    :model-value="propText(field)"
                    class="h-7 text-xs"
                    :aria-invalid="hasErrorAt(field.key) || undefined"
                    @change="(e: Event) => setProp(field, (e.target as HTMLInputElement).value)"
                  />
                  <ProblemNotes :problems="problemsAtProp(field.key)" />
                </div>

                <!-- A list view: what its template can use as item.<field>, and where that came from -->
                <div v-if="component.type === 'listView'" class="rounded-md border bg-muted/30 p-2 text-xs flex flex-col gap-1.5">
                  <p class="m-0 font-medium">{{ t('builder.listView.itemFields') }}</p>
                  <template v-if="listFields[component.id]?.fields.length">
                    <div class="flex flex-wrap gap-1">
                      <code
                        v-for="field in listFields[component.id].fields"
                        :key="field"
                        class="font-mono text-[11px] bg-muted rounded px-1"
                      >{{ listItemNames(component)[0] }}.{{ field }}</code>
                    </div>
                    <p class="m-0 text-muted-foreground">{{ t(`builder.listView.from.${listFields[component.id].from}`) }}</p>
                  </template>
                  <p v-else class="m-0 text-muted-foreground">{{ t('builder.listView.noFields') }}</p>
                </div>

                <template v-if="componentEvents.length">
                  <Separator />
                  <Label class="text-xs text-muted-foreground uppercase tracking-wide">{{ t('builder.events') }}</Label>
                  <template v-for="event in componentEvents" :key="event.name">
                    <ActionListEditor
                      :label="event.label"
                      :model-value="eventActions(event.name)"
                      :pages="pagesForActions"
                      :runnables="runnableNames"
                      :components="pageComponents"
                      @update:model-value="(actions) => setEventActions(event.name, actions)"
                    />
                    <ProblemNotes :problems="problemsAtEvent(event.name)" />
                  </template>
                </template>
              </div>

              <!-- Page -->
              <div v-else-if="page" class="flex flex-col gap-3 mt-3">
                <Label class="text-xs text-muted-foreground uppercase tracking-wide">{{ t('builder.page') }}</Label>
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">{{ t('common.name') }}</Label>
                  <Input
                    v-model="pageName"
                    class="h-7 text-xs"
                    @change="pageName.trim() && builderStore.updatePage({ name: pageName.trim() })"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">{{ t('builder.pageIcon') }}</Label>
                  <Input v-model="pageIcon" class="h-7 text-xs" placeholder="LayoutDashboard" @change="builderStore.updatePage({ icon: pageIcon.trim() })" />
                </div>
                <div class="flex items-center justify-between">
                  <Label class="text-xs">{{ t('builder.showInMenu') }}</Label>
                  <Switch :model-value="page.showInMenu" @update:model-value="(v: boolean) => builderStore.updatePage({ showInMenu: v })" />
                </div>

                <Separator />
                <ActionListEditor
                  :label="t('builder.eventNames.load')"
                  :model-value="page.events?.load ?? []"
                  :pages="pagesForActions"
                  :runnables="runnableNames"
                  :components="pageComponents"
                  @update:model-value="builderStore.setPageLoadActions"
                />
                <ProblemNotes :problems="ownPageProblems" />

                <template v-if="(builderStore.source?.pages.length ?? 0) > 1">
                  <Separator />
                  <Button size="sm" variant="outline" class="text-destructive" @click="deletePageOpen = true">
                    <Trash2 class="w-3.5 h-3.5 mr-1" /> {{ t('builder.deletePage.title') }}
                  </Button>
                </template>
              </div>
            </TabsContent>

            <!-- DATA -->
            <TabsContent value="data" class="data-[state=inactive]:hidden">
              <div class="flex items-center justify-between mt-3 mb-1">
                <span class="text-xs text-muted-foreground font-medium uppercase tracking-wide">{{ t('builder.runnablesTitle') }}</span>
                <Button size="icon" variant="ghost" class="h-6 w-6" :disabled="!page" @click="openRunnable(null)">
                  <Plus class="w-3.5 h-3.5" />
                </Button>
              </div>
              <Separator class="mb-2" />
              <p v-if="!runnableNames.length" class="text-xs text-muted-foreground italic">{{ t('builder.noRunnables') }}</p>
              <div
                v-for="(runnable, name) in page?.runnables ?? {}"
                :key="name"
                class="group/runnable flex flex-wrap items-start gap-2 rounded-md border p-2 mb-1.5 text-xs"
                :class="{ 'border-destructive/60': runnableProblems(String(name)).some((p) => p.severity === 'error') }"
              >
                <component :is="runnable.mode === 'run' ? Play : History" class="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div class="flex-1 min-w-0">
                  <p class="font-mono font-medium m-0 truncate">{{ name }}</p>
                  <p class="text-muted-foreground m-0 truncate">{{ workflowName(runnable.workflow) }}</p>
                  <p class="text-muted-foreground m-0">
                    {{ t(`builder.runnable.modes.${runnable.mode}`) }} · {{ t(`builder.runnable.triggers.${runnable.trigger}`) }}
                  </p>
                </div>
                <button class="opacity-0 group-hover/runnable:opacity-100" :title="t('common.edit')" @click="openRunnable(String(name))">
                  <Pencil class="w-3 h-3" />
                </button>
                <button class="opacity-0 group-hover/runnable:opacity-100" :title="t('common.delete')" @click="builderStore.deleteRunnable(String(name))">
                  <Trash2 class="w-3 h-3 text-destructive" />
                </button>
                <ProblemNotes :problems="runnableProblems(String(name))" class="basis-full" />
              </div>
              <p class="text-xs text-muted-foreground mt-2">{{ t('builder.runnablesHint') }}</p>
            </TabsContent>

            <!-- STATE -->
            <TabsContent value="state" class="data-[state=inactive]:hidden">
              <div class="flex items-center justify-between mt-3 mb-1">
                <span class="text-xs text-muted-foreground font-medium uppercase tracking-wide">{{ t('builder.stateTab') }}</span>
                <Button size="icon" variant="ghost" class="h-6 w-6" @click="stateRows.push({ key: '', value: 'null' })">
                  <Plus class="w-3.5 h-3.5" />
                </Button>
              </div>
              <Separator class="mb-2" />
              <div v-for="(row, index) in stateRows" :key="index" class="flex flex-col gap-1 mb-2">
                <div class="flex items-center gap-1">
                  <Input v-model="row.key" class="h-7 text-xs font-mono w-28" placeholder="name" @change="saveState" />
                  <Input v-model="row.value" class="h-7 text-xs font-mono flex-1" placeholder="null" @change="saveState" />
                  <Button size="icon" variant="ghost" class="h-7 w-7" @click="stateRows.splice(index, 1); saveState()">
                    <Trash2 class="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                <p v-if="row.key && stateErrors[index]" class="text-xs text-destructive m-0">{{ t(stateErrors[index]!) }}</p>
              </div>
              <p class="text-xs text-muted-foreground">{{ t('builder.state.hint') }}</p>
            </TabsContent>
          </Tabs>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>
