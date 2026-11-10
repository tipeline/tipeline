import { defineStore } from 'pinia';
import { computed, ref, shallowRef, toRaw } from 'vue';
import type {
  AppAction,
  AppComponent,
  AppComponentFrame,
  AppComponentParent,
  AppComponentType,
  AppPage,
  AppRunnable,
  AppSource,
} from '@tipeline/schemas';
import { coreValidations } from '@tipeline/schemas';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { toast } from '@/components/ui/sonner';
import { renameComponentReferences, renameRunnableReferences } from '@/utils/appRefactor';
import { mapBindableProps } from '@/utils/appLiteral';
import { bottomOf, descendantIds, isContainer, refusedInside } from '@/utils/appTree';
import { itemFields } from '@/utils/listItemFields';

const { RESERVED_BINDING_NAMES } = coreValidations.appObject;
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const SAVE_DELAY_MS = 500;
const HISTORY_LIMIT = 100;

type Layout = { x: number; y: number; w: number; h: number };

/** A runnable without its task alias — the alias is resolved from the chosen workflow on save. */
export type RunnableDraft = AppRunnable extends infer R ? (R extends AppRunnable ? Omit<R, 'workflow'> : never) : never;

/** Every action list in a page: page load, each component event, each runnable's handlers. */
function actionLists(page: AppPage): AppAction[][] {
  const lists: AppAction[][] = [];
  if (page.events?.load) lists.push(page.events.load);
  for (const component of page.components) {
    for (const actions of Object.values((component.events ?? {}) as Record<string, AppAction[]>)) lists.push(actions);
  }
  for (const runnable of Object.values(page.runnables)) {
    lists.push(runnable.onSuccess ?? [], runnable.onError ?? []);
    if (runnable.mode === 'run') lists.push(runnable.onPaused ?? []);
  }
  return lists;
}

function removeActions(page: AppPage, predicate: (action: AppAction) => boolean) {
  for (const list of actionLists(page)) {
    for (let i = list.length - 1; i >= 0; i--) if (predicate(list[i])) list.splice(i, 1);
  }
}

/** Applies `rewrite` to everything on a page that can hold bindings. */
function rewritePage(page: AppPage, rewrite: <T>(value: T) => T) {
  page.components = page.components.map(
    (c) => ({ ...c, props: mapBindableProps(c.type, c.props, rewrite), events: rewrite(c.events) }) as AppComponent
  );
  page.runnables = rewrite(page.runnables);
  page.events = rewrite(page.events);
}

function uniqueName(base: string, taken: (name: string) => boolean): string {
  let n = 1;
  while (taken(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/**
 * Editing state for the App builder. Selection is tracked by id (never by object
 * copy), edits mutate `source` in place and schedule a debounced save; the saved
 * response is never written back over local state, so in-flight saves can't undo
 * newer edits.
 */
export const useBuilderStore = defineStore('builder', () => {
  const identifier = ref<string | null>(null);
  const appName = ref('');
  // The app's project: a workflow created from the builder starts there too.
  const projectIdentifier = ref<string | null>(null);
  const source = ref<AppSource | null>(null);
  const loadError = ref<string | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const isDirty = ref(false);
  const savedIndicator = ref(false);
  const selectedPageId = ref<string | null>(null);
  const selectedComponentId = ref<string | null>(null);
  /** Palette type being dragged (set on mousedown in the palette). */
  const draggedType = ref<AppComponentType | null>(null);
  /** Asks the properties panel to show something (set by the problems list). */
  const focusRequest = shallowRef<{ tab: 'properties' | 'data'; runnable?: string } | null>(null);

  /** A copied component and everything inside it, pasted with `pasteComponent` (also across pages). */
  const clipboard = shallowRef<AppComponent[] | null>(null);
  /** The tab being edited in each tabs component (builder only, never saved). */
  const editorTabs = ref<Record<string, string>>({});
  /**
   * Fields of each list view's items, seen while previewing ("pageId/listId" →
   * fields). Builder-only and never saved; they feed `item.` autocomplete.
   */
  const listSamples = ref<Record<string, string[]>>({});

  // Undo/redo: JSON snapshots of `source`. `committed` is the snapshot as of the last
  // history point; every change made within one interaction (one tick) becomes a
  // single step — e.g. "generate from workflow" adds a runnable and updates a form.
  const undoStack = ref<string[]>([]);
  const redoStack = ref<string[]>([]);
  let committed = '';
  let commitQueued = false;
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);

  const selectedPage = computed<AppPage | null>(
    () => source.value?.pages.find((p) => p.id === selectedPageId.value) ?? null
  );
  const selectedComponent = computed<AppComponent | null>(
    () => selectedPage.value?.components.find((c) => c.id === selectedComponentId.value) ?? null
  );

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let savedTimer: ReturnType<typeof setTimeout> | null = null;
  let resaveAfterCurrent = false;

  // ------------------------------------------------------------------ load / save

  function reset() {
    undoStack.value = [];
    redoStack.value = [];
    committed = '';
    clipboard.value = null;
    editorTabs.value = {};
    listSamples.value = {};
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    resaveAfterCurrent = false;
    identifier.value = null;
    appName.value = '';
    projectIdentifier.value = null;
    source.value = null;
    loadError.value = null;
    isDirty.value = false;
    savedIndicator.value = false;
    selectedPageId.value = null;
    selectedComponentId.value = null;
  }

  async function load(id: string) {
    reset();
    isLoading.value = true;
    try {
      const result = await invokeCore(SEND.APP_DETAIL, { identifier: id });
      if (!result) {
        loadError.value = i18n.global.t('apps.notFound.title');
        return;
      }
      identifier.value = result.identifier;
      appName.value = result.name ?? '';
      // A new workflow made from the builder starts in the app's (first) project.
      projectIdentifier.value = result.projects?.[0]?.identifier ?? null;
      if (result.source_error) {
        loadError.value = result.source_error;
        return;
      }
      source.value = JSON.parse(result.source);
      committed = snapshot();
      selectedPageId.value = source.value?.pages[0]?.id ?? null;
    } catch (e: any) {
      loadError.value = e?.message ?? String(e);
    } finally {
      isLoading.value = false;
    }
  }

  const snapshot = () => JSON.stringify(toRaw(source.value));

  function scheduleSave() {
    isDirty.value = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  function commitHistory() {
    commitQueued = false;
    const now = snapshot();
    if (now === committed) return;
    if (committed) {
      undoStack.value.push(committed);
      if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift();
      redoStack.value = [];
    }
    committed = now;
  }

  /** Every edit ends here: records an undo step (once per tick) and schedules a save. */
  function touch() {
    if (!commitQueued) {
      commitQueued = true;
      queueMicrotask(commitHistory);
    }
    scheduleSave();
  }

  /** Keeps the selection pointing at things that still exist. */
  function fixSelection() {
    const pages = source.value?.pages ?? [];
    if (!pages.some((p) => p.id === selectedPageId.value)) selectedPageId.value = pages[0]?.id ?? null;
    if (!selectedPage.value?.components.some((c) => c.id === selectedComponentId.value)) selectedComponentId.value = null;
  }

  function restore(json: string) {
    source.value = JSON.parse(json);
    committed = json;
    fixSelection();
    scheduleSave();
  }

  function undo() {
    if (commitQueued) commitHistory();
    const previous = undoStack.value.pop();
    if (previous === undefined) return;
    redoStack.value.push(snapshot());
    restore(previous);
  }

  function redo() {
    if (commitQueued) commitHistory();
    const next = redoStack.value.pop();
    if (next === undefined) return;
    undoStack.value.push(snapshot());
    restore(next);
  }

  /** Replaces the whole source (the YAML view's Apply) — one undo step. */
  function replaceSource(next: AppSource) {
    source.value = JSON.parse(JSON.stringify(next));
    fixSelection();
    touch();
  }

  /** Drops workflow aliases no runnable uses any more. */
  function pruneWorkflows() {
    if (!source.value) return;
    const used = new Set(source.value.pages.flatMap((p) => Object.values(p.runnables).map((r) => r.workflow)));
    for (const alias of Object.keys(source.value.workflows)) if (!used.has(alias)) delete source.value.workflows[alias];
  }

  async function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (!source.value || !identifier.value || !isDirty.value) return;
    if (isSaving.value) {
      resaveAfterCurrent = true;
      return;
    }
    pruneWorkflows();
    isSaving.value = true;
    isDirty.value = false;
    try {
      await invokeCore(SEND.APP_UPDATE_SOURCE, {
        identifier: identifier.value,
        source: JSON.stringify(toRaw(source.value)),
      });
      savedIndicator.value = true;
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => (savedIndicator.value = false), 2000);
    } catch (e: any) {
      isDirty.value = true;
      toast.error(i18n.global.t('apps.saveFailed'), { description: e?.message ?? String(e) });
    } finally {
      isSaving.value = false;
      if (resaveAfterCurrent) {
        resaveAfterCurrent = false;
        void save();
      }
    }
  }

  // ------------------------------------------------------------------ selection

  function selectPage(id: string) {
    selectedPageId.value = id;
    selectedComponentId.value = null;
  }

  function selectComponent(id: string | null) {
    selectedComponentId.value = id;
    if (id) revealComponent(id);
  }

  /** Opens, in every tabs component around it, the tab that holds `id`. */
  function revealComponent(id: string) {
    const components = selectedPage.value?.components ?? [];
    const seen = new Set<string>();
    let current = components.find((c) => c.id === id);
    while (current?.parent && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = components.find((c) => c.id === current!.parent!.id);
      if (parent?.type === 'tabs' && current.parent.tab) editorTabs.value[parent.id] = current.parent.tab;
      current = parent;
    }
  }

  function setEditorTab(componentId: string, tab: string) {
    editorTabs.value[componentId] = tab;
  }

  function recordListSample(pageId: string, listId: string, items: unknown[]) {
    const fields = itemFields(items);
    if (fields.length) listSamples.value[`${pageId}/${listId}`] = fields;
  }

  // ------------------------------------------------------------------ pages

  function addPage(name: string) {
    if (!source.value) return;
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'page';
    const id = source.value.pages.some((p) => p.id === base)
      ? uniqueName(`${base}_`, (n) => !!source.value?.pages.some((p) => p.id === n))
      : base;
    source.value.pages.push({ id, name, showInMenu: true, runnables: {}, events: {}, components: [] });
    selectPage(id);
    touch();
  }

  function updatePage(patch: Partial<Pick<AppPage, 'name' | 'icon' | 'showInMenu'>>) {
    if (!selectedPage.value) return;
    Object.assign(selectedPage.value, patch);
    if (patch.icon === '') delete selectedPage.value.icon;
    touch();
  }

  /** Moves a page to `index` in the page list; the first page is the app's home page. */
  function movePage(id: string, index: number) {
    if (!source.value) return;
    const pages = source.value.pages;
    const from = pages.findIndex((p) => p.id === id);
    const to = Math.max(0, Math.min(index, pages.length - 1));
    if (from < 0 || from === to) return;
    pages.splice(to, 0, ...pages.splice(from, 1));
    touch();
  }

  function deletePage(id: string) {
    if (!source.value || source.value.pages.length <= 1) return;
    source.value.pages = source.value.pages.filter((p) => p.id !== id);
    for (const page of source.value.pages) {
      removeActions(page, (a) => (a.type === 'navigate' || a.type === 'openModal') && a.page === id);
    }
    if (selectedPageId.value === id) selectPage(source.value.pages[0].id);
    touch();
  }

  function setPageLoadActions(actions: AppAction[]) {
    if (!selectedPage.value) return;
    selectedPage.value.events = actions.length ? { load: actions } : {};
    touch();
  }

  // ------------------------------------------------------------------ components

  /** Adds a component to the page's grid, or inside a container / tab when `parent` is given. */
  function addComponent(
    type: AppComponentType,
    layout: Layout,
    defaults: { name: string; props: Record<string, unknown> },
    parent?: AppComponentParent | null
  ) {
    const page = selectedPage.value;
    if (!page) return;
    // A list view's template only takes value-less components (BuilderGrid says why).
    if (refusedInside(page.components, [type], parent?.id)) return;
    const id = uniqueName(type, (n) => page.components.some((c) => c.id === n));
    page.components.push({
      id,
      type,
      name: defaults.name,
      layout,
      ...(parent ? { parent: { ...parent } } : {}),
      props: JSON.parse(JSON.stringify(defaults.props)),
      events: {},
    } as AppComponent);
    selectComponent(id);
    touch();
  }

  function updateComponent(
    id: string,
    patch: {
      name?: string;
      /** null goes back to the type's default frame. */
      frame?: AppComponentFrame | null;
      /** false drops the field. */
      fill?: boolean;
      props?: Record<string, unknown>;
      events?: Record<string, AppAction[]>;
    }
  ) {
    const component = selectedPage.value?.components.find((c) => c.id === id);
    if (!component) return;
    const namesBefore = component.type === 'listView' ? listNames(component) : null;
    if (patch.name !== undefined) component.name = patch.name;
    if (patch.frame === null) delete component.frame;
    else if (patch.frame !== undefined) component.frame = patch.frame;
    if (patch.fill === false) delete component.fill;
    else if (patch.fill) component.fill = true;
    if (patch.props !== undefined) (component as any).props = patch.props;
    if (namesBefore) renameListItemNames(component, namesBefore);
    if (patch.events !== undefined) (component as any).events = patch.events;
    // A removed row or bulk action (or group button) takes its `action:<id>` / `bulk:<id>`
    // handlers with it.
    if (component.type === 'buttonGroup') {
      const itemIds = new Set(((component.props as any).items ?? []).map((i: any) => i?.id));
      const events = (component.events ?? {}) as Record<string, AppAction[]>;
      for (const event of Object.keys(events)) if (!itemIds.has(event.slice('action:'.length))) delete events[event];
    }
    if (component.type === 'table') {
      const ids = (key: string) => new Set(((component.props as any)[key] ?? []).map((a: any) => a?.id));
      const rowIds = ids('rowActions');
      const bulkIds = ids('bulkActions');
      const events = (component.events ?? {}) as Record<string, AppAction[]>;
      for (const event of Object.keys(events)) {
        if (event.startsWith('action:') && !rowIds.has(event.slice('action:'.length))) delete events[event];
        if (event.startsWith('bulk:') && !bulkIds.has(event.slice('bulk:'.length))) delete events[event];
      }
    }
    // Components in a removed tab move to the first tab, below what is there.
    if (component.type === 'tabs') {
      const tabIds = ((component.props as any).tabs ?? []).map((t: any) => t?.id).filter(Boolean) as string[];
      const page = selectedPage.value!;
      for (const child of page.components) {
        if (child.parent?.id !== id || !tabIds[0] || tabIds.includes(child.parent.tab ?? '')) continue;
        const target = { id, tab: tabIds[0] };
        child.layout = { ...child.layout, y: bottomOf(page.components, target) };
        child.parent = target;
      }
    }
    touch();
  }

  /** A list view's item / index names (default item / index). */
  function listNames(list: AppComponent): [string, string] {
    const props = list.props as { itemName?: string; indexName?: string };
    return [props.itemName || 'item', props.indexName || 'index'];
  }

  /**
   * A list view's item or index name changed: its template's bindings follow (like a
   * component rename). Runnables, which an item's button may start, follow too unless
   * another list view on the page still uses the old name.
   */
  function renameListItemNames(list: AppComponent, before: [string, string]) {
    const page = selectedPage.value!;
    const after = listNames(list);
    const renames = before.map((old, i) => [old, after[i]] as const).filter(([old, now]) => old !== now);
    if (!renames.length) return;
    // Through placeholders, so swapping the two names doesn't rename twice.
    const rename = <T>(value: T, pairs: ReadonlyArray<readonly [string, string]>): T => {
      let result = value;
      pairs.forEach(([old], i) => (result = renameComponentReferences(result, old, `zzListName${i}`)));
      pairs.forEach(([, now], i) => (result = renameComponentReferences(result, `zzListName${i}`, now)));
      return result;
    };
    const inside = descendantIds(page.components, list.id);
    page.components = page.components.map((c) =>
      inside.has(c.id)
        ? ({ ...c, props: mapBindableProps(c.type, c.props, (p) => rename(p, renames)), events: rename(c.events, renames) } as AppComponent)
        : c
    );
    const stillUsed = new Set(page.components.filter((c) => c.type === 'listView' && c.id !== list.id).flatMap(listNames));
    const forRunnables = renames.filter(([old]) => !stillUsed.has(old));
    if (forRunnables.length) page.runnables = rename(page.runnables, forRunnables);
  }

  /**
   * Moves a component (with everything inside it) to the page's grid (`parent` null)
   * or into a container / tab — at `layout` when it was dropped there, else below what
   * is already there. Moving a component into itself or into one of its own children
   * is ignored, and so is moving a component with a value (or a container holding
   * one) into a list view's template. Returns whether it moved.
   */
  function moveComponent(id: string, parent: AppComponentParent | null, layout?: Layout): boolean {
    const page = selectedPage.value;
    const component = page?.components.find((c) => c.id === id);
    if (!page || !component) return false;
    if (parent) {
      const target = page.components.find((c) => c.id === parent.id);
      if (!target || !isContainer(target) || parent.id === id || descendantIds(page.components, id).has(parent.id)) return false;
      const inside = descendantIds(page.components, id);
      const types = [component.type, ...page.components.filter((c) => inside.has(c.id)).map((c) => c.type)];
      if (refusedInside(page.components, types, parent.id)) return false;
    }
    const y = bottomOf(
      page.components.filter((c) => c.id !== id),
      parent
    );
    if (parent) component.parent = { ...parent };
    else delete component.parent;
    component.layout = layout ? { ...layout } : { ...component.layout, y };
    revealComponent(id);
    touch();
    return true;
  }

  /** Returns an i18n error key, or null when the id was changed. */
  function renameComponent(id: string, newId: string): string | null {
    const page = selectedPage.value;
    const component = page?.components.find((c) => c.id === id);
    if (!page || !component) return null;
    if (newId === id) return null;
    if (!NAME_PATTERN.test(newId)) return 'builder.errors.namePattern';
    if ((RESERVED_BINDING_NAMES as readonly string[]).includes(newId)) return 'builder.errors.reservedName';
    if (page.components.some((c) => c.id === newId)) return 'builder.errors.duplicateId';
    component.id = newId;
    for (const child of page.components) if (child.parent?.id === id) child.parent = { ...child.parent, id: newId };
    if (editorTabs.value[id] !== undefined) {
      editorTabs.value[newId] = editorTabs.value[id];
      delete editorTabs.value[id];
    }
    for (const list of actionLists(page)) {
      for (const action of list) if (action.type === 'reset' && action.component === id) action.component = newId;
    }
    // `{{ oldId.value }}`, `{= oldId.selectedRow.id =}`… everywhere on the page.
    rewritePage(page, (value) => renameComponentReferences(value, id, newId));
    if (selectedComponentId.value === id) selectedComponentId.value = newId;
    touch();
    return null;
  }

  /** Removes a component and, for a container or tabs, everything inside it. */
  function removeComponent(id: string) {
    const page = selectedPage.value;
    if (!page) return;
    const removed = descendantIds(page.components, id).add(id);
    page.components = page.components.filter((c) => !removed.has(c.id));
    removeActions(page, (a) => a.type === 'reset' && removed.has(a.component));
    if (selectedComponentId.value && removed.has(selectedComponentId.value)) selectedComponentId.value = null;
    touch();
  }

  function clearPage() {
    if (!selectedPage.value) return;
    selectedPage.value.components = [];
    removeActions(selectedPage.value, (a) => a.type === 'reset');
    selectedComponentId.value = null;
    touch();
  }

  function updateLayouts(layouts: Array<{ id: string } & Layout>) {
    const page = selectedPage.value;
    if (!page) return;
    let changed = false;
    for (const { id, x, y, w, h } of layouts) {
      const component = page.components.find((c) => c.id === id);
      if (!component) continue;
      const l = component.layout;
      if (l.x !== x || l.y !== y || l.w !== w || l.h !== h) {
        component.layout = { x, y, w, h };
        changed = true;
      }
    }
    if (changed) touch();
  }

  // ------------------------------------------------------------------ duplicate / copy / paste

  /** `id` and everything inside it, the component itself first. */
  function subtree(id: string): AppComponent[] {
    const components = selectedPage.value?.components ?? [];
    const root = components.find((c) => c.id === id);
    if (!root) return [];
    const inside = descendantIds(components, id);
    return [root, ...components.filter((c) => inside.has(c.id))];
  }

  /**
   * Adds a copy of `originals` — a component, then everything inside it — to the
   * current page, the component below everything else in its grid. Each copy gets a
   * new id, and references between the copies (bindings, `reset`, `parent`) follow
   * them; actions that would point at a runnable or component missing from this page
   * are dropped. Returns how many were.
   */
  function insertCopy(originals: AppComponent[]): number {
    const page = selectedPage.value;
    if (!page || !originals.length) return 0;
    const assigned = new Set<string>();
    const taken = (n: string) =>
      assigned.has(n) || page.components.some((c) => c.id === n) || (RESERVED_BINDING_NAMES as readonly string[]).includes(n);
    const ids = new Map<string, string>();
    for (const original of originals) {
      const base = `${original.id}Copy`;
      const id = taken(base) ? uniqueName(base, taken) : base;
      assigned.add(id);
      ids.set(original.id, id);
    }

    // Through placeholders, so a copy named like another original's new id
    // (e.g. "aCopy" next to "a") isn't renamed twice.
    const renameAll = <T>(value: T): T => {
      let result = value;
      originals.forEach((o, i) => (result = renameComponentReferences(result, o.id, `zzCopyPlaceholder${i}`)));
      originals.forEach((o, i) => (result = renameComponentReferences(result, `zzCopyPlaceholder${i}`, ids.get(o.id)!)));
      return result;
    };

    let dropped = 0;
    const copies = originals.map((original, index) => {
      // Everything renamed as before, except a custom component's code (see appLiteral).
      const { props, ...rest } = JSON.parse(JSON.stringify(original)) as AppComponent;
      const copy = { ...renameAll(rest), props: mapBindableProps(original.type, props, renameAll) } as AppComponent;
      copy.id = ids.get(original.id)!;
      if (index === 0) copy.name = `${original.name} (copy)`;
      if (copy.parent && ids.has(copy.parent.id)) copy.parent = { ...copy.parent, id: ids.get(copy.parent.id)! };
      for (const actions of Object.values((copy.events ?? {}) as Record<string, AppAction[]>)) {
        for (let i = actions.length - 1; i >= 0; i--) {
          const a = actions[i];
          if (a.type === 'reset' && ids.has(a.component)) a.component = ids.get(a.component)!;
          const missing =
            (a.type === 'run' && !page.runnables[a.runnable]) ||
            (a.type === 'reset' && !assigned.has(a.component) && !page.components.some((c) => c.id === a.component));
          if (missing) {
            actions.splice(i, 1);
            dropped++;
          }
        }
      }
      return copy;
    });

    // The copied component stays in its container when this page has it (and its
    // tab); otherwise it goes on the page's grid.
    const root = copies[0];
    if (root.parent) {
      const target = page.components.find((c) => c.id === root.parent!.id);
      const fits =
        target &&
        isContainer(target) &&
        (target.type !== 'tabs' || ((target.props as any).tabs ?? []).some((t: any) => t?.id === root.parent!.tab)) &&
        !refusedInside(page.components, copies.map((c) => c.type), root.parent.id);
      if (!fits) delete root.parent;
    }
    root.layout = { ...root.layout, y: bottomOf(page.components, root.parent) };
    page.components.push(...copies);
    selectComponent(root.id);
    touch();
    return dropped;
  }

  function duplicateComponent(id: string): number {
    return insertCopy(subtree(id));
  }

  function copyComponent(id: string) {
    const components = subtree(id);
    if (components.length) clipboard.value = JSON.parse(JSON.stringify(components));
  }

  function pasteComponent(): number {
    return clipboard.value ? insertCopy(clipboard.value) : 0;
  }

  // ------------------------------------------------------------------ runnables & workflows

  /** Alias for a workflow: reuses an existing one, else derives one from its name. */
  function ensureWorkflowAlias(taskIdentifier: string, workflowName: string): string {
    const workflows = source.value!.workflows;
    const existing = Object.entries(workflows).find(([, t]) => t.identifier === taskIdentifier);
    if (existing) return existing[0];
    const words = workflowName.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
    if (!NAME_PATTERN.test(base)) base = `workflow${base}`;
    const alias = workflows[base] ? uniqueName(base, (n) => !!workflows[n]) : base;
    workflows[alias] = { identifier: taskIdentifier };
    return alias;
  }

  /** Creates or replaces a runnable; renaming updates the `run` actions that use it. */
  function saveRunnable(previousName: string | null, name: string, runnable: AppRunnable) {
    const page = selectedPage.value;
    if (!page) return;
    if (previousName && previousName !== name) {
      delete page.runnables[previousName];
      // Added before renaming references, so its own handlers are renamed too.
      page.runnables[name] = runnable;
      for (const list of actionLists(page)) {
        for (const action of list) if (action.type === 'run' && action.runnable === previousName) action.runnable = name;
      }
      // `{= runnables.old.outputs… =}` everywhere on the page, and consoles showing it.
      rewritePage(page, (value) => renameRunnableReferences(value, previousName, name));
      for (const c of page.components) {
        if (c.type === 'runConsole' && (c.props as any).runnable === previousName) (c.props as any).runnable = name;
      }
    } else {
      page.runnables[name] = runnable;
    }
    touch();
  }

  function deleteRunnable(name: string) {
    const page = selectedPage.value;
    if (!page) return;
    delete page.runnables[name];
    removeActions(page, (a) => a.type === 'run' && a.runnable === name);
    touch();
  }

  // ------------------------------------------------------------------ state

  function setInitialState(state: Record<string, unknown>) {
    if (!source.value) return;
    source.value.state = state;
    touch();
  }

  return {
    identifier,
    appName,
    projectIdentifier,
    source,
    loadError,
    isLoading,
    isSaving,
    isDirty,
    savedIndicator,
    selectedPageId,
    selectedComponentId,
    selectedPage,
    selectedComponent,
    draggedType,
    load,
    reset,
    save,
    selectPage,
    selectComponent,
    addPage,
    updatePage,
    movePage,
    deletePage,
    setPageLoadActions,
    addComponent,
    updateComponent,
    renameComponent,
    removeComponent,
    moveComponent,
    clearPage,
    updateLayouts,
    ensureWorkflowAlias,
    saveRunnable,
    deleteRunnable,
    setInitialState,
    focusRequest,
    clipboard,
    editorTabs,
    setEditorTab,
    listSamples,
    recordListSample,
    duplicateComponent,
    copyComponent,
    pasteComponent,
    canUndo,
    canRedo,
    undo,
    redo,
    replaceSource,
  };
});
