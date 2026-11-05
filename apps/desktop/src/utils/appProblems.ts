import { coreValidations } from '@tipeline/schemas';
import type {
  AppAction,
  AppComponent,
  AppPage,
  AppSource,
} from '@tipeline/schemas';
import { bindingReferences, collectStrings } from '@/utils/appRefactor';
import { bindingSyntaxIssue, SYNTAX_PARAMS } from '@/utils/bindingSyntax';
import type { WorkflowVariable } from '@/utils/formFromWorkflow';
import { literalProps } from './appLiteral';
import { listViewAround } from '@/utils/appTree';

export interface AppProblem {
  severity: 'error' | 'warning';
  /** i18n key under builder.problems */
  code: string;
  params: Record<string, unknown>;
  pageId?: string;
  componentId?: string;
  runnable?: string;
  /** The component prop it's in (top-level key), when it's in one. */
  prop?: string;
  /** The event it's in — a component's (with componentId) or the page's `load`. */
  event?: string;
}

export interface WorkflowInfo {
  name: string;
  variables: WorkflowVariable[];
}

/**
 * Workflows by identifier: info when installed, null when not installed. Identifiers
 * that aren't in the map yet (still loading) are not checked.
 */
export type WorkflowCatalog = Map<string, WorkflowInfo | null>;

// Root names the runtime provides — never "unknown".
const RUNTIME_ROOTS = new Set(['page', 'result', 'error']);
const COMPONENT_FIELDS: Record<string, string[]> = {
  input: ['value'],
  select: ['value', 'selectedOptions', 'search'],
  checkbox: ['value'],
  dateRange: ['value', 'from', 'to'],
  form: ['values', 'errors'],
  table: ['selectedRow', 'selectedRows', 'page', 'pageSize', 'changes', 'hasChanges'],
  chart: ['selectedPoint'],
  approvals: ['lastDecision'],
  runs: ['selectedRun'],
  listView: ['selectedItem', 'selectedIndex'],
  tabs: ['activeTab'],
  container: [],
  keyValue: [],
  json: [],
  pdf: ['page', 'pages'],
  progress: [],
  buttonGroup: ['clicked'],
  chat: ['messages', 'message', 'reply', 'waiting'],
  map: ['selectedMarker', 'selectedIndex'],
  embed: ['message'],
  kanban: ['selectedCard', 'selectedIndex', 'lastMove'],
  timeline: ['selectedItem', 'selectedIndex'],
  media: ['playing', 'currentTime', 'duration', 'ended'],
  custom: ['lastEvent', 'value'],
  gallery: ['selectedItem', 'selectedIndex', 'index'],
  avatar: ['selectedItem', 'selectedIndex'],
  pagination: ['page', 'pageSize', 'offset', 'from', 'to'],
  tree: ['selectedNode', 'selectedId', 'checked', 'checkedLeaves'],
  calendar: ['selectedEvent', 'selectedIndex', 'selectedDate', 'selectedStart', 'selectedEnd', 'from', 'to'],
  timer: ['running', 'ticks', 'lastTick', 'nextAt'],
  fileDrop: ['value', 'files'],
};

function allActions(page: AppPage): AppAction[] {
  const lists: AppAction[][] = [page.events?.load ?? []];
  for (const c of page.components)
    lists.push(
      ...Object.values((c.events ?? {}) as Record<string, AppAction[]>)
    );
  for (const r of Object.values(page.runnables)) {
    lists.push(r.onSuccess ?? [], r.onError ?? []);
    if (r.mode === 'run') lists.push(r.onPaused ?? []);
  }
  return lists.flat();
}

/** State keys an app can have: declared defaults plus anything a setState writes. */
export function appStateKeys(source: AppSource): Set<string> {
  const stateKeys = new Set(Object.keys(source.state ?? {}));
  for (const page of source.pages)
    for (const a of allActions(page))
      if (a.type === 'setState') stateKeys.add(a.key);
  return stateKeys;
}

/** What a binding on one page can resolve against. */
export interface BindingScope {
  page: AppPage;
  stateKeys: Set<string>;
  components: Map<string, AppComponent>;
  /** Names a list view gives its items (`item` / `index` by default) that resolve here. */
  itemRoots?: string[];
}

export function bindingScope(source: AppSource, page: AppPage, options: { itemRoots?: string[] } = {}): BindingScope {
  return {
    page,
    stateKeys: appStateKeys(source),
    components: new Map(page.components.map((c) => [c.id, c])),
    itemRoots: options.itemRoots,
  };
}

/** The names a list view gives its element and position (itemName / indexName). */
export function listItemNames(list: AppComponent): [string, string] {
  const props = list.props as { itemName?: string; indexName?: string };
  return [props.itemName || 'item', props.indexName || 'index'];
}

/**
 * The item names `component` can use (those of the list view whose template it is in),
 * or — without one — those the page's runnables can, which an item's button may start
 * (every list view's on the page).
 */
export function itemRootsFor(page: AppPage, component?: AppComponent | null): string[] {
  if (component) {
    const list = listViewAround(page.components, component.parent?.id);
    return list ? listItemNames(list) : [];
  }
  return [...new Set(page.components.filter((c) => c.type === 'listView').flatMap(listItemNames))];
}

export type BindingIssue = Pick<AppProblem, 'severity' | 'code' | 'params'>;

/**
 * Why a referenced path (`state.x`, `runnables.r.outputs.y`, `table1.selectedRow`, …)
 * doesn't resolve on its page — null when it does. Used by the problems list and by the
 * binding fields, which underline the same references inline.
 */
export function bindingIssue(ref: string, scope: BindingScope): BindingIssue | null {
  const { page, stateKeys, components } = scope;
  const [root, second, third, fourth] = ref.split('.');
  if (RUNTIME_ROOTS.has(root)) return null;
  if (scope.itemRoots?.includes(root.replace(/\[\d+\]$/, ''))) return null;
  if (root === 'state') {
    if (second && !stateKeys.has(second.replace(/\[\d+\]$/, '')))
      return { severity: 'warning', code: 'stateUnknown', params: { ref, key: second } };
    return null;
  }
  if (root === 'runnables') {
    const r = second ? page.runnables[second] : undefined;
    if (!r)
      return { severity: 'error', code: 'runnableUnknown', params: { ref, runnable: second } };
    if (
      r.mode === 'run' &&
      third === 'outputs' &&
      fourth &&
      !(r.outputs ?? []).includes(fourth.replace(/\[\d+\]$/, ''))
    )
      return {
        severity: 'warning',
        code: 'outputNotRequested',
        params: { ref, runnable: second, variable: fourth },
      };
    return null;
  }
  const c = components.get(root.replace(/\[\d+\]$/, ''));
  if (!c)
    return { severity: 'error', code: 'componentUnknown', params: { ref, component: root } };
  if (c.type === 'form' && second === 'values' && third) {
    // Bound fields are only known when the page runs.
    if (typeof (c.props as any).fields === 'string') return null;
    const fields = ((c.props as any).fields ?? []).map((f: any) => f.name);
    if (!fields.includes(third))
      return { severity: 'warning', code: 'fieldUnknown', params: { ref, form: root, field: third } };
    return null;
  }
  if (second && COMPONENT_FIELDS[c.type] && !COMPONENT_FIELDS[c.type].includes(second))
    return {
      severity: 'warning',
      code: 'componentFieldUnknown',
      params: { ref, component: root, field: second },
    };
  return null;
}

/** Schema errors (same check core runs on save), located by their path. */
function schemaProblems(source: AppSource): AppProblem[] {
  try {
    coreValidations.appObject.parseAppSource(source);
    return [];
  } catch (e: any) {
    const lines = String(e?.message ?? '')
      .split('\n')
      .slice(1);
    return lines.map((line) => {
      const pageIndex = line.match(/^pages\[(\d+)\]/)?.[1];
      const componentIndex = line.match(
        /^pages\[\d+\]\.components\[(\d+)\]/
      )?.[1];
      const inComponent = line.match(
        /^pages\[\d+\]\.components\[\d+\]\.(props|events)\.(\w+)/
      );
      const page =
        pageIndex !== undefined ? source.pages[Number(pageIndex)] : undefined;
      return {
        severity: 'error' as const,
        code: 'schema',
        params: { detail: line },
        pageId: page?.id,
        componentId:
          componentIndex !== undefined
            ? page?.components[Number(componentIndex)]?.id
            : undefined,
        ...(inComponent?.[1] === 'props' && { prop: inComponent[2] }),
        ...(inComponent?.[1] === 'events' && { event: inComponent[2] }),
      };
    });
  }
}

/**
 * Everything worth fixing in an app, errors first: schema errors, workflows that
 * aren't installed, runnable inputs/outputs the workflow doesn't allow, bindings to
 * things that don't exist, and runnables nothing ever runs.
 */
export function analyzeApp(
  source: AppSource,
  workflows: WorkflowCatalog
): AppProblem[] {
  const problems: AppProblem[] = [...schemaProblems(source)];

  for (const [alias, ref] of Object.entries(source.workflows ?? {})) {
    if (workflows.get(ref.identifier) === null) {
      problems.push({
        severity: 'error',
        code: 'workflowMissing',
        params: { alias, identifier: ref.identifier },
      });
    }
  }

  const stateKeys = appStateKeys(source);

  for (const page of source.pages) {
    const at = { pageId: page.id };

    // ---- runnables vs. their workflow
    for (const [name, r] of Object.entries(page.runnables)) {
      const where = { ...at, runnable: name };
      const info = workflows.get(
        source.workflows?.[r.workflow]?.identifier ?? ''
      );
      if (info) {
        const byName = new Map(info.variables.map((v) => [v.name, v]));
        const isPrivate = (v: WorkflowVariable) =>
          (v.visibility ?? 'private') === 'private';
        if (r.mode === 'run') {
          for (const key of Object.keys(r.inputs ?? {})) {
            const v = byName.get(key);
            if (!v)
              problems.push({
                severity: 'error',
                code: 'inputUnknown',
                params: { runnable: name, variable: key, workflow: info.name },
                ...where,
              });
            else if (isPrivate(v))
              problems.push({
                severity: 'error',
                code: 'inputPrivate',
                params: { runnable: name, variable: key },
                ...where,
              });
            else if (v.output)
              problems.push({
                severity: 'error',
                code: 'inputOutput',
                params: { runnable: name, variable: key },
                ...where,
              });
          }
          for (const key of r.outputs ?? []) {
            const v = byName.get(key);
            if (!v)
              problems.push({
                severity: 'error',
                code: 'outputUnknown',
                params: { runnable: name, variable: key, workflow: info.name },
                ...where,
              });
            else if (isPrivate(v))
              problems.push({
                severity: 'error',
                code: 'outputPrivate',
                params: { runnable: name, variable: key },
                ...where,
              });
            else if (v.secret)
              problems.push({
                severity: 'error',
                code: 'outputSecret',
                params: { runnable: name, variable: key },
                ...where,
              });
          }
        } else if (
          r.source === 'variables' &&
          r.variableName &&
          !byName.has(r.variableName)
        ) {
          problems.push({
            severity: 'warning',
            code: 'historyVariableUnknown',
            params: { runnable: name, variable: r.variableName },
            ...where,
          });
        }
      }
      const triggered =
        r.trigger === 'load' ||
        source.pages.some(
          (p) =>
            p.id === page.id &&
            allActions(p).some((a) => a.type === 'run' && a.runnable === name)
        );
      if (!triggered)
        problems.push({
          severity: 'warning',
          code: 'runnableUnused',
          params: { runnable: name },
          ...where,
        });
    }

    // ---- bindings, located by the component / runnable they appear in
    const scope: BindingScope = {
      page,
      stateKeys,
      components: new Map(page.components.map((c) => [c.id, c])),
    };
    const pageItemRoots = itemRootsFor(page);
    const check = (refs: string[], where: Partial<AppProblem>, itemRoots: string[] = []) => {
      const here = itemRoots.length ? { ...scope, itemRoots } : scope;
      for (const ref of refs) {
        const issue = bindingIssue(ref, here);
        if (issue) problems.push({ ...issue, ...where });
      }
    };
    // Malformed bindings render as '' at runtime without a word — checked in every
    // string, including fields that aren't marked as bindable.
    const checkSyntax = (value: unknown, where: Partial<AppProblem>) => {
      for (const text of collectStrings(value)) {
        const issue = bindingSyntaxIssue(text);
        if (!issue) continue;
        const code = `binding${issue.code[0].toUpperCase()}${issue.code.slice(1)}`;
        const snippet = text.slice(issue.from, issue.to);
        problems.push({
          severity: 'error',
          code,
          params: {
            ...SYNTAX_PARAMS,
            ...issue.params,
            snippet: snippet.length > 40 ? `${snippet.slice(0, 39)}…` : snippet,
          },
          ...where,
        });
      }
    };
    // Located down to the prop / event, so the properties panel can show each one
    // under its field.
    for (const c of page.components as AppComponent[]) {
      const where = { ...at, componentId: c.id };
      const inItem = itemRootsFor(page, c);
      for (const [prop, value] of Object.entries(c.props ?? {})) {
        if (literalProps(c.type).includes(prop)) continue; // code: its {{ }} are its own
        check(bindingReferences(value), { ...where, prop }, inItem);
        checkSyntax(value, { ...where, prop });
      }
      for (const [event, actions] of Object.entries(c.events ?? {})) {
        check(bindingReferences(actions), { ...where, event }, inItem);
        checkSyntax(actions, { ...where, event });
      }
      if (
        c.type === 'runConsole' &&
        !page.runnables[(c.props as any).runnable]
      ) {
        problems.push({
          severity: 'warning',
          code: 'consoleRunnableUnknown',
          params: { runnable: (c.props as any).runnable },
          ...where,
          prop: 'runnable',
        });
      }
    }
    for (const [name, r] of Object.entries(page.runnables)) {
      check(bindingReferences(r), { ...at, runnable: name }, pageItemRoots);
      checkSyntax(r, { ...at, runnable: name });
    }
    for (const [event, actions] of Object.entries(page.events ?? {})) {
      check(bindingReferences(actions), { ...at, event });
      checkSyntax(actions, { ...at, event });
    }
  }

  return problems.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1
  );
}
