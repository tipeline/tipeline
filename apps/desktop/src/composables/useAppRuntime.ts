import {
  onScopeDispose,
  reactive,
  ref,
  shallowRef,
  watch,
  type Ref,
} from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  AppAction,
  AppComponent,
  AppFormField,
  AppPage,
  AppSource,
} from '@tipeline/schemas';
import { generateIdentifier } from '@tipeline/utils';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { invokeCore } from '@/utils/invoke';
import { resolveBinding } from '@/utils/appBindings';
import { emptyTableEdits, emptyTableSelection } from '@/utils/tableEdits';
import { historyFilterValues, toDayRange } from '@/utils/appDates';
import { runAppRunnable, type AppRunEvent } from '@/utils/runAppRunnable';
import { formFields, validateForm } from '@/utils/appForm';
import { chosenOptions, normalizeOptions } from '@/utils/appOptions';
import { openAppFile, openAppUrl } from '@/utils/appOpen';
import { getActivePinia } from 'pinia';
import { useConnectionStore } from '@/store/connectionStore';
import { isHidden } from '@/components/app/widgets/visibility';
import { SEND } from '@/ipc-channels';
import { sliderInitial, type SliderSettings } from '@/utils/appSlider';
import { normalizeColor } from '@/utils/appColor';
import { appErrorText } from '@/utils/appErrors';
import { literalProps, mapBindableProps } from '@/utils/appLiteral';

export interface RunnableState {
  isRunning: boolean;
  /** Rows of a `history` runnable. */
  data: unknown[] | null;
  /** Final values of a `run` runnable's outputs. */
  outputs: Record<string, unknown>;
  pipelineIdentifier: string;
  error: string | null;
  lastRunAt: number | null;
  /** Steps of the latest run, for a Run Console (newest last, capped). */
  log: RunLogEntry[];
  /** How the latest run went, for a status line ('idle' until the first run). */
  status: 'idle' | 'running' | 'finished' | 'failed' | 'paused' | 'canceled';
  startedAt: number | null;
  finishedAt: number | null;
  /** Workflow steps the latest run has finished (not capped like `log`). */
  steps: number;
  /** The step that last finished. */
  lastStep: string;
  /** The step that raised an error during the latest run, if any. */
  failedStep: string;
  /** The request that started the latest run — names it for a cancel. */
  correlationId: string;
  /**
   * The list view item an event in started the latest run, if any: while it runs,
   * only that item's copy of a component shows busy (not every item's).
   */
  startedFor: { listId: string; index: number } | null;
  /**
   * When the latest outputs were produced, if they came from the workflow cache
   * (`runnables.<name>.cachedAt`); null when the latest run produced them itself.
   */
  cachedAt: number | null;
}

export interface RunLogEntry {
  at: number;
  kind:
    | 'started'
    | 'action'
    | 'error'
    | 'finished'
    | 'failed'
    | 'paused'
    | 'canceled';
  /** Action name (group.action), or the runnable for started/finished/failed. */
  name: string;
  /** Short result preview or error message. */
  detail?: string;
}

/** A runnable's state as a widget's status line shows it. */
export interface RunStatus extends RunnableState {
  name: string;
  /** The workflow the runnable runs, for linking to the run. */
  workflowIdentifier: string;
}

const LOG_LIMIT = 200;

function preview(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function pushLog(st: RunnableState, entry: Omit<RunLogEntry, 'at'>) {
  st.log.push({ at: Date.now(), ...entry });
  if (st.log.length > LOG_LIMIT) st.log.splice(0, st.log.length - LOG_LIMIT);
}

/** Resets a runnable's run fields for a run that started at `startedAt`. */
function beginRun(st: RunnableState, name: string, startedAt: number) {
  st.isRunning = true;
  st.error = null;
  st.log = [];
  st.status = 'running';
  st.startedAt = startedAt;
  st.finishedAt = null;
  st.steps = 0;
  st.lastStep = '';
  st.failedStep = '';
  // Set again once the workflow starts — so it never names the previous run.
  st.pipelineIdentifier = '';
  st.correlationId = '';
  st.startedFor = null;
  pushLog(st, { kind: 'started', name });
}

function endRun(st: RunnableState, status: RunnableState['status']) {
  st.isRunning = false;
  st.status = status;
  st.finishedAt = Date.now();
}

/** Applies a step event of a run (a finished step, or a step's error). */
function applyStep(st: RunnableState, event: AppRunEvent) {
  if (event.type === 'action') {
    st.steps++;
    st.lastStep = event.data.name ?? '';
    pushLog(st, {
      kind: 'action',
      name: event.data.name ?? '',
      detail: preview(event.data.result),
    });
  } else if (event.type === 'action_error') {
    st.failedStep = event.data.name ?? '';
    pushLog(st, {
      kind: 'error',
      name: event.data.name ?? '',
      detail: preview(event.data.error),
    });
  }
}

/** A run in progress as core lists it (appRunsActive). */
interface ActiveAppRun {
  correlationId: string;
  runnable: string;
  pipelineIdentifier: string;
  startedAt: number;
  steps: number;
  lastStep: string;
}

interface PendingConfirm {
  message: string;
  resolve: (ok: boolean) => void;
}

/**
 * What a page runtime asks of whoever shows it. The main page and a page shown in a
 * dialog get different hosts: e.g. `navigate` from a dialog closes it first, and
 * `closeModal` only does something inside a dialog.
 */
/** How `openModal` shows its page: a dialog or a drawer, which side, how wide. */
export interface AppModalLook {
  display?: 'dialog' | 'drawer';
  side?: 'right' | 'left';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface AppRuntimeHost {
  navigate(pageId: string, params: Record<string, unknown>): void;
  /** Resolves when the dialog closes: true if closed by `closeModal`, false if dismissed. */
  openModal(pageId: string, params: Record<string, unknown>, look?: AppModalLook): Promise<boolean>;
  closeModal(): void;
}

function emptyRunnableState(): RunnableState {
  return {
    isRunning: false,
    data: null,
    outputs: {},
    pipelineIdentifier: '',
    error: null,
    lastRunAt: null,
    log: [],
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    steps: 0,
    lastStep: '',
    failedStep: '',
    cachedAt: null,
    correlationId: '',
    startedFor: null,
  };
}

const truthy = (v: unknown) =>
  v === true ||
  (typeof v === 'string' && v !== '' && v !== 'false') ||
  (typeof v === 'number' && v !== 0);

/** Starting value of a form field / input of the given kind. */
function initialValue(kind: string, value: unknown, settings?: SliderSettings): unknown {
  switch (kind) {
    case 'slider':
      return sliderInitial(value, settings ?? {});
    case 'color':
      // Stored as hex whatever it's written as (#abc, rgb()); not a color: as written.
      return normalizeColor(value, true) ?? value ?? null;
    case 'checkbox':
      return truthy(value);
    case 'multiselect':
      return Array.isArray(value)
        ? value
        : value == null || value === ''
          ? []
          : [value];
    case 'number':
    case 'currency': {
      if (value == null || value === '') return null;
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }
    default:
      return value ?? (kind === 'select' ? null : '');
  }
}

// A slider's bounds may be bindings: resolved like its default.
const sliderSettings = (p: Record<string, any>, resolve: (v: unknown) => unknown): SliderSettings => ({
  min: resolve(p.min),
  max: resolve(p.max),
  step: resolve(p.step),
  range: p.range,
  required: p.required,
});

/** One message of a chat component (`<id>.messages`). */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** ISO time it was added. */
  at: string;
}

/** Which item of a list view a component is drawn for. */
export interface ItemScope {
  listId: string;
  item: unknown;
  index: number;
  /** What the template calls them (the list's itemName / indexName). */
  itemName?: string;
  indexName?: string;
}

/**
 * Whether a runnable's run keeps a component busy. Inside a list view (`scope`), a run
 * one item started only keeps that item's copy busy; any other run — started outside
 * the list, or by another list — keeps every copy busy (e.g. the list reloading).
 */
export function isRunningFor(st: RunnableState | undefined, scope?: ItemScope): boolean {
  if (!st?.isRunning) return false;
  const by = st.startedFor;
  return !scope || !by || by.listId !== scope.listId || by.index === scope.index;
}

/**
 * Component events that ask for what's shown now — the visible days, the table page,
 * the search text, a pagination's page. One that finds its runnable busy isn't
 * dropped: it fires once that run ends, and only the latest one per component counts.
 */
const LATEST_EVENTS = new Set(['rangeChange', 'pageChange', 'search']);
const asksForLatest = (type: string, event: string) =>
  LATEST_EVENTS.has(event) || (type === 'pagination' && event === 'change');

/** The binding roots an item adds: the element and its position (from 0), by the names the list gives them. */
const itemContext = (scope: ItemScope) => ({
  [scope.itemName || 'item']: scope.item,
  [scope.indexName || 'index']: scope.index,
});

/**
 * Runtime for one page of an App: per-page component state and runnable results,
 * binding resolution, and event actions. The app-wide `state` can be shared with
 * other pages (e.g. a page shown in a dialog) by passing it in.
 *
 * - Component and runnable state reset whenever the page (or its params) changes —
 *   a page starts fresh, like reloading it. Inputs and forms start at their defaults.
 * - Responses that arrive after the page changed are dropped (generation counter),
 *   so a slow run can't write into the next page.
 * - A runnable that is already running ignores further triggers (no double submit).
 *   Except events that say what's shown changed (asksForLatest, e.g. a calendar's
 *   rangeChange): those wait for the run to end, then fire once with the latest
 *   state — so what's on screen is what gets loaded last.
 */
export function useAppRuntime(options: {
  appIdentifier: Ref<string>;
  source: Ref<AppSource | null>;
  pageId: Ref<string | null>;
  /** Parameters the page was opened with. Owned by the runtime when omitted. */
  params?: Ref<Record<string, unknown>>;
  /** Shared app state. When omitted, the runtime owns it and seeds it from `source.state`. */
  state?: Record<string, unknown>;
  /** Page-level navigation. Defaults to switching this runtime's own page. */
  host?: AppRuntimeHost;
}) {
  const { t } = useI18n();
  const { translateError } = useErrorT();

  const ownsState = !options.state;
  const state = options.state ?? reactive<Record<string, unknown>>({});
  const components = reactive<Record<string, Record<string, unknown>>>({});
  const runnables = reactive<Record<string, RunnableState>>({});
  const pageParams = options.params ?? ref<Record<string, unknown>>({});
  const pendingConfirm = shallowRef<PendingConfirm | null>(null);
  let generation = 0;
  // Runs this page started (their requests' correlationIds), runs it follows that
  // were started elsewhere (correlationId → runnable), and runs seen ending — so a
  // run that ended while appRunsActive was in flight isn't picked up as running.
  // All per page: cleared when the page resets.
  const ownRuns = new Set<string>();
  const followed = new Map<string, string>();
  const ended = new Set<string>();
  // Events (asksForLatest) that found their runnable busy, by component and event (a later one
  // replaces an earlier): fired when that runnable's run ends.
  const waiting = new Map<string, { runnable: string; handlers: AppAction[]; scope?: ItemScope }>();

  const host: AppRuntimeHost = options.host ?? {
    navigate: (pageId, params) => {
      pageParams.value = params;
      options.pageId.value = pageId;
    },
    openModal: async () => false,
    closeModal: () => {},
  };

  const page = (): AppPage | null =>
    options.source.value?.pages.find((p) => p.id === options.pageId.value) ??
    null;

  /** Whether the desktop talks to a core on another machine (its files aren't here). */
  function isRemoteCore(): boolean {
    try {
      return getActivePinia() ? useConnectionStore().isRemote : false;
    } catch {
      return false;
    }
  }

  /** The binding context. Call inside a computed so reads are tracked. */
  function context(
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      ...components,
      state,
      runnables,
      page: { id: options.pageId.value, params: pageParams.value },
      ...extra,
    };
  }

  /** A component's props with bindings resolved — inside a list view, for one item. */
  function resolveProps(
    component: AppComponent,
    scope?: ItemScope
  ): Record<string, unknown> {
    const ctx = context(scope ? itemContext(scope) : {});
    // A custom component's code is passed as written (see appLiteral).
    return mapBindableProps(component.type, component.props ?? {}, (props) => resolveBinding(props, ctx) as Record<string, unknown>);
  }

  /**
   * A form's starting values, one per field. Written-out fields resolve their own
   * (bindable) defaults; bound fields come resolved already, and their defaults are
   * taken as they are (a default may be text such as a template with `{{ }}` in it).
   */
  function formStartValues(
    written: unknown,
    resolve: (v: unknown) => unknown
  ): Record<string, unknown> {
    const bound = typeof written === 'string';
    const own = bound ? (v: unknown) => v : resolve;
    return Object.fromEntries(
      formFields(bound ? resolve(written) : written).map((f) => [
        f.name,
        initialValue(f.type, own(f.default), sliderSettings(f, own)),
      ])
    );
  }

  /** The value(s) an input or form starts with — its (bindable) defaults resolved now. */
  function initialComponentState(
    component: AppComponent
  ): Record<string, unknown> {
    const props = component.props as Record<string, any>;
    const resolve = (v: unknown) => resolveBinding(v, context());
    switch (component.type) {
      case 'input':
        return {
          value: initialValue(
            ['number', 'currency', 'slider', 'color'].includes(props.inputType) ? props.inputType : 'text',
            resolve(props.default),
            sliderSettings(props, resolve)
          ),
        };
      case 'select': {
        const value = initialValue(
          props.multiple ? 'multiselect' : 'select',
          resolve(props.default)
        );
        return {
          value,
          selectedOptions: chosenOptions(value, normalizeOptions(resolve(props.options))),
          search: '',
        };
      }
      case 'checkbox':
        return { value: initialValue('checkbox', resolve(props.default)) };
      case 'listView':
        return { selectedItem: null, selectedIndex: null };
      case 'dateRange': {
        const range = toDayRange(resolve(props.default));
        return { value: range, from: range?.from ?? null, to: range?.to ?? null };
      }
      case 'tabs': {
        // The default tab when it names one, else the first.
        const ids = ((props.tabs ?? []) as Array<{ id: string }>).map((tab) => tab.id);
        const preferred = resolve(props.defaultTab);
        return {
          activeTab: ids.includes(preferred as string) ? preferred : ids[0],
        };
      }
      case 'table':
        // A paged table starts at page 1; `page` / `pageSize` feed server-side paging.
        // `changes` / `hasChanges` / `selectedRows` exist from the start, so bindings
        // to them resolve before anything is edited or checked.
        return {
          ...(props.pageSize ? { page: 1, pageSize: props.pageSize } : {}),
          ...emptyTableEdits(),
          ...emptyTableSelection(),
        };
      case 'form':
        return { values: formStartValues(props.fields, resolve), errors: {} };
      case 'fileDrop':
        return { files: [], value: props.multiple === false ? null : [] };
      case 'chat':
        return { messages: chatStart(component), message: '' };
      case 'embed':
        return { message: null };
      case 'kanban':
        return { selectedCard: null, selectedIndex: null, lastMove: null };
      case 'timeline':
        return { selectedItem: null, selectedIndex: null };
      case 'media':
        return { playing: false, currentTime: 0, duration: null, ended: false };
      case 'custom':
        return { lastEvent: null, value: null };
      case 'gallery':
        return { selectedItem: null, selectedIndex: null, index: 0 };
      case 'avatar':
        return { selectedItem: null, selectedIndex: null };
      case 'tree': {
        // The default ticks (ids); the leaves' rows are filled in once the tree has its data.
        const ticks = resolve(props.defaultChecked);
        return { selectedNode: null, selectedId: null, checked: Array.isArray(ticks) ? ticks.map(String) : [], checkedLeaves: [] };
      }
      case 'pagination': {
        // Page 1 at the start (and on reset); `to` follows once the total is known.
        const size = Number.isInteger(props.pageSize) && props.pageSize > 0 ? props.pageSize : 10;
        return { page: 1, pageSize: size, offset: 0, from: 1, to: size };
      }
      case 'calendar':
        // from / to come with the first view the calendar shows.
        return { from: null, to: null, selectedEvent: null, selectedDate: null };
      case 'timer':
        return {
          running: timerOn(resolve(props.running)),
          ticks: 0,
          lastTick: null,
          nextAt: null,
        };
      default:
        return {};
    }
  }

  function confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      pendingConfirm.value = {
        message,
        resolve: (ok) => {
          pendingConfirm.value = null;
          resolve(ok);
        },
      };
    });
  }

  /** Runs a runnable of the current page. Resolves to whether it succeeded. */
  /**
   * Runs a runnable of the current page. Resolves to whether it succeeded. `extra`
   * adds binding roots its inputs and handlers can use — `item` / `index` when an
   * event inside a list view's item started it.
   */
  async function run(
    name: string,
    extra: Record<string, unknown> = {},
    scope?: ItemScope,
    /**
     * quiet: no toast for a failure (the caller shows it, e.g. in a chat).
     * refresh: run the workflow even when its outputs are cached, and store the new ones.
     */
    opts: { quiet?: boolean; refresh?: boolean } = {}
  ): Promise<boolean> {
    const currentPage = page();
    const def = currentPage?.runnables[name];
    if (!currentPage || !def) return false;
    const st = (runnables[name] ??= emptyRunnableState());
    if (st.isRunning) return false;

    if (def.mode === 'run' && def.confirm) {
      const message = String(resolveBinding(def.confirm, context(extra)));
      if (!(await confirm(message))) return false;
    }

    const gen = generation;
    beginRun(st, name, Date.now());
    if (scope) st.startedFor = { listId: scope.listId, index: scope.index };
    const end = (status: RunnableState['status']) => endRun(st, status);
    const log = (entry: Omit<RunLogEntry, 'at'>) => {
      if (gen === generation) pushLog(st, entry);
    };
    try {
      let result: Record<string, unknown>;
      if (def.mode === 'run') {
        const inputs = resolveBinding(def.inputs, context(extra)) as Record<
          string,
          unknown
        >;
        const correlationId = generateIdentifier();
        ownRuns.add(correlationId);
        st.correlationId = correlationId;
        let started = false;
        const { outputs, pipelineIdentifier, status, cachedAt } = await runAppRunnable(
          {
            appIdentifier: options.appIdentifier.value,
            pageId: currentPage.id,
            runnable: name,
            inputs: JSON.parse(JSON.stringify(inputs ?? {})),
            ...(opts.refresh ? { cache: 'refresh' as const } : {}),
          },
          (event) => {
            if (gen !== generation) return;
            // The first start is the workflow's own; sub-workflows start later.
            if (event.type === 'start' && !started) {
              started = true;
              st.pipelineIdentifier = event.data.pipelineIdentifier ?? '';
            }
            applyStep(st, event);
          },
          correlationId
        );
        if (gen !== generation) return false;
        st.pipelineIdentifier = pipelineIdentifier;
        // Canceled: not a success and not a failure — whoever canceled it knows. The
        // rest of the action list doesn't run.
        if (status === 'canceled') {
          end('canceled');
          log({ kind: 'canceled', name });
          return false;
        }
        // Stopped at an approval step: not done yet, so onPaused runs instead of
        // onSuccess, and the rest of the action list doesn't. The run continues in the
        // background once someone decides.
        if (status === 'paused') {
          end('paused');
          log({ kind: 'paused', name });
          if (def.onPaused?.length)
            await runActions(def.onPaused, { ...extra, result: { pipelineIdentifier } }, scope);
          else toast.info(t('apps.runtime.awaitingApproval', { name }));
          return false;
        }
        st.outputs = outputs;
        st.cachedAt = cachedAt ? Date.parse(cachedAt) : null;
        result = { outputs, pipelineIdentifier };
      } else {
        // Filter values may be bindings (e.g. a date range's from / to): resolve them
        // now and send them; core uses them instead of the saved ones.
        const { mode: _mode, ...saved } = def.filter ?? {};
        const filter = historyFilterValues(
          resolveBinding(saved, context(extra)) as Record<string, unknown>
        );
        const rows = await invokeCore<unknown[]>(SEND.APP_HISTORY_FETCH, {
          appIdentifier: options.appIdentifier.value,
          pageId: currentPage.id,
          runnable: name,
          ...(Object.keys(filter).length ? { filter } : {}),
        });
        if (gen !== generation) return false;
        st.data = Array.isArray(rows) ? rows : [];
        result = { data: st.data };
      }
      st.lastRunAt = Date.now();
      end('finished');
      log({ kind: 'finished', name });
      await runActions(def.onSuccess, { ...extra, result }, scope);
      return true;
    } catch (e: any) {
      if (gen !== generation) return false;
      const detail = translateError(e?.message || t('common.unknownError'));
      // The app shows the reason without the engine's action tag; the console keeps it.
      const message = appErrorText(detail);
      st.error = message;
      end('failed');
      log({ kind: 'failed', name, detail });
      if (def.onError.length)
        await runActions(def.onError, { ...extra, error: { message } }, scope);
      else if (!opts.quiet)
        toast.error(t('apps.runtime.runFailed', { name }), {
          description: message,
        });
      return false;
    } finally {
      if (gen === generation) {
        st.isRunning = false;
        fireWaiting(name);
      }
    }
  }

  /** Fires the events that waited for `name`'s run to end (see asksForLatest). */
  function fireWaiting(name: string) {
    for (const [key, w] of waiting) {
      if (w.runnable !== name) continue;
      waiting.delete(key);
      void runActions(w.handlers, w.scope ? itemContext(w.scope) : {}, w.scope);
    }
  }

  /**
   * Shows a run of this page that was started elsewhere — another window, or this one
   * before it navigated away and back — as the runnable's current run. Only its
   * progress and result: the actions that follow a run (onSuccess…) belong to
   * whoever started it.
   */
  function follow(run: ActiveAppRun) {
    const { correlationId } = run;
    if (ownRuns.has(correlationId) || followed.has(correlationId)) return;
    if (ended.has(correlationId)) return;
    if (page()?.runnables[run.runnable]?.mode !== 'run') return;
    const st = runnables[run.runnable];
    if (!st || st.isRunning) return;
    beginRun(st, run.runnable, run.startedAt);
    st.pipelineIdentifier = run.pipelineIdentifier;
    st.correlationId = correlationId;
    st.steps = run.steps;
    st.lastStep = run.lastStep;
    followed.set(correlationId, run.runnable);
  }

  // Every window gets every run's events on stream:broadcast.
  function onBroadcast(_: unknown, msg: any) {
    const correlationId = msg?.correlationId;
    if (!correlationId) return;
    const app = msg.data?.app;
    if (
      msg.type === 'start' &&
      app?.appIdentifier === options.appIdentifier.value &&
      app?.pageId === options.pageId.value
    ) {
      follow({
        correlationId,
        runnable: app.runnable,
        pipelineIdentifier: msg.data.pipelineIdentifier ?? '',
        startedAt: Date.now(),
        steps: 0,
        lastStep: '',
      });
      return;
    }
    if (msg.type === 'end_all' || msg.type === 'error') ended.add(correlationId);

    // A run waiting for approval that someone canceled (here or anywhere): core
    // announces its end by pipelineIdentifier, as no request of ours is open for it.
    if (msg.type === 'end' && msg.data?.status === 'canceled') {
      for (const [runnable, st] of Object.entries(runnables)) {
        if (st.status !== 'paused') continue;
        if (st.pipelineIdentifier !== msg.data.pipelineIdentifier) continue;
        endRun(st, 'canceled');
        pushLog(st, { kind: 'canceled', name: runnable });
      }
    }

    const name = followed.get(correlationId);
    const st = name ? runnables[name] : undefined;
    if (!name || !st) return;
    if (msg.type === 'action' || msg.type === 'action_error') {
      applyStep(st, { type: msg.type, data: msg.data ?? {} });
    } else if (msg.type === 'end_all') {
      followed.delete(correlationId);
      const status: 'paused' | 'canceled' | 'finished' =
        msg.data?.status === 'paused' || msg.data?.status === 'canceled'
          ? msg.data.status
          : 'finished';
      st.pipelineIdentifier = msg.data?.pipelineIdentifier ?? st.pipelineIdentifier;
      if (status === 'finished') {
        st.outputs = msg.data?.outputs ?? {};
        st.lastRunAt = Date.now();
      }
      endRun(st, status);
      pushLog(st, { kind: status, name });
      fireWaiting(name);
    } else if (msg.type === 'error') {
      followed.delete(correlationId);
      const error = msg.error;
      const detail = translateError(
        (typeof error === 'string' ? error : error?.message) ||
          t('common.unknownError')
      );
      st.error = appErrorText(detail);
      endRun(st, 'failed');
      pushLog(st, { kind: 'failed', name, detail });
      fireWaiting(name);
    }
  }
  const ipc = typeof window !== 'undefined' ? window.ipcRenderer : undefined;
  ipc?.on('stream:broadcast', onBroadcast);
  onScopeDispose(() => ipc?.off('stream:broadcast', onBroadcast));

  /** Picks up runs of this page already in progress when it opens. */
  async function followActiveRuns(pageId: string) {
    const gen = generation;
    try {
      const runs = await invokeCore<ActiveAppRun[]>(SEND.APP_RUNS_ACTIVE, {
        appIdentifier: options.appIdentifier.value,
        pageId,
      });
      if (gen !== generation || !Array.isArray(runs)) return;
      for (const run of runs) follow(run);
    } catch {
      // Not knowing about a run elsewhere only means the form looks idle.
    }
  }

  function navigate(pageId: string, params: Record<string, unknown> = {}) {
    if (!options.source.value?.pages.some((p) => p.id === pageId)) return;
    host.navigate(pageId, params);
  }

  // ---- timers: ticking lives here, not in the widget, so a hidden timer (unmounted
  // by its grid) keeps going. Leaving the page (resetPage) or the runtime stops them.
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** A resolved `running` prop: on unless false / "false" (omitted = on). */
  function timerOn(running: unknown): boolean {
    return running !== false && String(running ?? '').trim() !== 'false';
  }

  function timerSeconds(component: AppComponent): number {
    const n = Number(resolveProps(component).interval ?? 30);
    return Number.isFinite(n) && n >= 1 ? n : 30;
  }

  /** (Re)starts a timer's countdown from now — or stops it when it isn't running. */
  function scheduleTimer(component: AppComponent) {
    clearTimeout(timers.get(component.id));
    timers.delete(component.id);
    const st = (components[component.id] ??= {});
    if (!st.running) {
      st.nextAt = null;
      return;
    }
    const ms = timerSeconds(component) * 1000;
    st.nextAt = Date.now() + ms;
    timers.set(
      component.id,
      setTimeout(() => fireTimer(component.id), ms)
    );
  }

  /** A tick: counts it, fires `tick`, and counts down again (or stops, without `repeat`). */
  function fireTimer(id: string) {
    const component = page()?.components.find((c) => c.id === id);
    if (component?.type !== 'timer') return;
    const st = (components[id] ??= {});
    st.ticks = Number(st.ticks ?? 0) + 1;
    st.lastTick = new Date().toISOString();
    if ((component.props as Record<string, unknown>).repeat === false) st.running = false;
    scheduleTimer(component);
    handleComponentEvent(component, 'tick', { ticks: st.ticks });
  }

  // ---- chat: a conversation, kept here (like timers) so it outlives its widget.

  /** A chat's messages to start with: its welcome message, if any. */
  function chatStart(component: AppComponent): ChatMessage[] {
    const welcome = String(resolveBinding((component.props as any).welcome ?? '', context()) ?? '').trim();
    return welcome ? [{ role: 'assistant', text: welcome, at: new Date().toISOString() }] : [];
  }

  /**
   * Sends a chat message: adds it, fires `send`, runs the chat's runnable (which sees
   * `<id>.message` and `<id>.messages`, this one included) and adds its reply — the
   * `reply` output (default `reply`) — or its error. Fires `reply` after a reply.
   * False when there's nothing to send or the chat is still waiting for a reply.
   */
  async function sendChat(id: string, text: string): Promise<boolean> {
    const component = page()?.components.find((c) => c.id === id);
    if (component?.type !== 'chat') return false;
    const message = text.trim();
    const props = component.props as Record<string, any>;
    const st = (components[id] ??= {});
    if (!message || st.waiting) return false;
    const messages = Array.isArray(st.messages) ? (st.messages as ChatMessage[]) : [];
    st.messages = [...messages, { role: 'user', text: message, at: new Date().toISOString() }];
    st.message = message;
    handleComponentEvent(component, 'send', { message });
    const name = typeof props.runnable === 'string' ? props.runnable : '';
    if (!name || !page()?.runnables[name]) return true;
    st.waiting = true;
    const gen = generation;
    try {
      const ok = await run(name, {}, undefined, { quiet: true }); // the chat shows a failure
      if (gen !== generation) return false; // left the page meanwhile
      const result = runnables[name];
      const output = (result?.outputs ?? {}) as Record<string, unknown>;
      const raw = output[props.reply || 'reply'];
      const reply = ok && raw !== undefined && raw !== null ? (typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)) : null;
      st.messages = [
        ...(st.messages as ChatMessage[]),
        reply !== null
          ? { role: 'assistant', text: reply, at: new Date().toISOString() }
          : {
              role: 'error',
              text: result?.error || t('apps.chat.noReply', { output: props.reply || 'reply' }),
              at: new Date().toISOString(),
            },
      ];
      if (reply !== null) handleComponentEvent(component, 'reply', { reply });
    } finally {
      if (gen === generation) st.waiting = false;
    }
    return true;
  }

  /** Pauses or resumes a timer (its widget's button). Resuming counts down afresh. */
  function setTimerRunning(id: string, running: boolean) {
    const component = page()?.components.find((c) => c.id === id);
    if (component?.type !== 'timer') return;
    (components[id] ??= {}).running = running;
    scheduleTimer(component);
  }

  function stopTimers() {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
  }
  onScopeDispose(stopTimers);

  // A bound `running` or `interval` (e.g. `{{ state.autoRefresh }}`) takes effect when
  // what it resolves to changes.
  watch(
    () =>
      (page()?.components ?? [])
        .filter((c) => c.type === 'timer')
        .map((c) => {
          const props = resolveProps(c);
          return [c.id, timerOn(props.running), String(props.interval ?? '')] as const;
        }),
    (now, before) => {
      for (const [id, running, interval] of now) {
        const old = before?.find(([oldId]) => oldId === id);
        if (!old || (old[1] === running && old[2] === interval)) continue;
        const component = page()?.components.find((c) => c.id === id);
        if (!component || !components[id]) continue;
        if (old[1] !== running) components[id].running = running;
        scheduleTimer(component);
      }
    }
  );

  // A form whose fields are bound (e.g. to a workflow's output) gets them once that
  // resolves, and again whenever they change. A field still there with the same type
  // and default keeps what was typed into it; a new or changed one starts at its default.
  watch(
    () =>
      (page()?.components ?? [])
        .filter((c) => c.type === 'form' && typeof (c.props as any)?.fields === 'string')
        .map((c) => [c.id, formFields(resolveProps(c).fields)] as const),
    (now, before) => {
      for (const [id, fields] of now) {
        const old = before?.find(([oldId]) => oldId === id)?.[1];
        const st = components[id];
        if (!st || JSON.stringify(old) === JSON.stringify(fields)) continue;
        const kept = (st.values ?? {}) as Record<string, unknown>;
        const same = (f: AppFormField) => {
          const was = old?.find((o) => o.name === f.name);
          return !!was && was.type === f.type && JSON.stringify(was.default) === JSON.stringify(f.default);
        };
        components[id] = {
          ...st,
          values: Object.fromEntries(
            fields.map((f) => [
              f.name,
              same(f) && f.name in kept ? kept[f.name] : initialValue(f.type, f.default, sliderSettings(f, (v) => v)),
            ])
          ),
          errors: {},
        };
      }
    }
  );

  function resetComponent(id: string) {
    const component = page()?.components.find((c) => c.id === id);
    if (!component) return;
    // A table drops its unsaved edits and unchecks its rows; it stays on its page
    // and keeps the row last clicked.
    if (component.type === 'table')
      components[id] = { ...components[id], ...emptyTableEdits(), ...emptyTableSelection() };
    // A pagination goes back to page 1 but keeps the page size the person chose.
    else if (component.type === 'pagination') {
      const size = components[id]?.pageSize ?? initialComponentState(component).pageSize;
      components[id] = { page: 1, pageSize: size, offset: 0, from: 1, to: size };
    } else components[id] = initialComponentState(component);
    if (component.type === 'timer') scheduleTimer(component);
  }

  /**
   * Runs actions in order. A failed `run` stops the rest of the list, so a
   * "save, then refresh" chain never refreshes after a failed save; so does a
   * dismissed dialog, and anything that leaves the page.
   */
  async function runActions(
    actions: AppAction[] | undefined,
    extra: Record<string, unknown> = {},
    scope?: ItemScope
  ) {
    const resolveParams = (params: unknown) =>
      (resolveBinding(params ?? {}, context(extra)) ?? {}) as Record<
        string,
        unknown
      >;
    for (const action of actions ?? []) {
      switch (action.type) {
        case 'run':
          if (!(await run(action.runnable, extra, scope, { refresh: action.refresh }))) return;
          break;
        case 'navigate':
          navigate(action.page, resolveParams(action.params));
          return; // the page is gone — nothing after a navigation can apply to it
        case 'openModal': {
          if (!options.source.value?.pages.some((p) => p.id === action.page))
            return;
          const gen = generation;
          const closed = await host.openModal(
            action.page,
            resolveParams(action.params),
            { display: action.display, side: action.side, size: action.size }
          );
          if (!closed || gen !== generation) return;
          break;
        }
        case 'closeModal':
          host.closeModal();
          return;
        case 'reset':
          resetComponent(action.component);
          break;
        case 'setState':
          state[action.key] = resolveBinding(action.value, context(extra));
          break;
        case 'openUrl':
        case 'openFile': {
          // A refused or failed open says why and stops the list, like a failed run.
          const target = String(
            resolveBinding(action.type === 'openUrl' ? action.url : action.path, context(extra)) ?? ''
          ).trim();
          // Nothing to open (e.g. a binding to a value not there yet) — say so, rather
          // than "not found" with no name.
          if (!target) {
            toast.error(t(action.type === 'openUrl' ? 'apps.open.errors.noUrl' : 'apps.open.errors.noPath'));
            return;
          }
          let result;
          try {
            result =
              action.type === 'openUrl'
                ? await openAppUrl(target)
                : await openAppFile(target, action.mode ?? 'open', isRemoteCore(), options.appIdentifier.value);
          } catch (e: any) {
            result = { ok: false as const, error: 'openFailed', detail: e?.message };
          }
          if (!result.ok) {
            toast.error(t(`apps.open.errors.${result.error}`, { target }));
            return;
          }
          if ('canceled' in result && result.canceled) return; // "Save as…" dismissed
          if ('savedTo' in result && result.savedTo) toast.success(t('apps.open.saved', { path: result.savedTo }));
          break;
        }
        case 'toast': {
          const message = String(
            resolveBinding(action.message, context(extra)) ?? ''
          );
          if (action.variant === 'success') toast.success(message);
          else if (action.variant === 'error') toast.error(message);
          else toast(message);
          break;
        }
      }
    }
  }

  /** Called by widgets: updates the component's exposed state, then runs its handlers. */
  /**
   * An event inside a list view's item first makes that item the list's selected one,
   * so handlers (and the runnables they start) can use `item` / `index` — or
   * `<listId>.selectedItem`, like a table's row actions use `selectedRow`.
   */
  function handleComponentEvent(
    component: AppComponent,
    event: string,
    payload?: Record<string, unknown>,
    scope?: ItemScope
  ) {
    if (scope)
      Object.assign((components[scope.listId] ??= {}), {
        selectedItem: scope.item,
        selectedIndex: scope.index,
      });
    if (payload) Object.assign((components[component.id] ??= {}), payload);
    const handlers = (
      component.events as Record<string, AppAction[]> | undefined
    )?.[event];
    if (!handlers?.length) return;
    // Asking for what's shown while the runnable still loads the previous view: wait
    // for it, then ask once with whatever is shown by then.
    if (asksForLatest(component.type, event)) {
      const busy = handlers.find(
        (a) => a.type === 'run' && runnables[a.runnable]?.isRunning
      ) as { runnable: string } | undefined;
      if (busy) {
        waiting.set(`${component.id}:${event}`, { runnable: busy.runnable, handlers, scope });
        return;
      }
    }
    void runActions(handlers, scope ? itemContext(scope) : {}, scope);
  }

  /** Lets a widget publish state (an input's value, a table's selection) without firing an event. */
  function setComponentState(id: string, patch: Record<string, unknown>) {
    Object.assign((components[id] ??= {}), patch);
  }

  /**
   * Checks one step of a stepper (a `tabs` component shown as steps) before Next or
   * Finish: every shown required input, select, date range and file dropzone in it
   * needs a value, filled-in ones must be well formed (an email, a phone…),
   * and every form in it must be valid. Failing fields show their error (inputs
   * through `error`, forms through `errors`). Nested containers count; a nested tabs
   * only its open tab; list views hold no values.
   */
  function checkStep(tabsId: string, stepId: string): boolean {
    const all = page()?.components ?? [];
    let valid = true;
    const visit = (parentId: string, tab?: string) => {
      for (const component of all) {
        if (component.parent?.id !== parentId) continue;
        if (tab !== undefined && component.parent.tab !== tab) continue;
        const props = resolveProps(component) as Record<string, any>;
        if (isHidden(component.type, props)) continue;
        const st = (components[component.id] ??= {});
        switch (component.type) {
          case 'input':
          case 'select':
          case 'dateRange':
          case 'fileDrop': {
            const type: AppFormField['type'] =
              component.type === 'input'
                ? props.inputType ?? 'text'
                : component.type === 'select'
                  ? props.multiple
                    ? 'multiselect'
                    : 'select'
                  : component.type === 'fileDrop' && props.multiple !== false
                    ? 'multiselect'
                    : 'text';
            // Required ones need a value; any filled one must be well formed (an email…).
            const error =
              validateForm([{ name: 'value', type, required: !!props.required, language: props.language }], { value: st.value })
                .value ?? null;
            st.error = error;
            if (error) valid = false;
            break;
          }
          case 'form': {
            const errors = validateForm(
              formFields(props.fields),
              (st.values ?? {}) as Record<string, unknown>
            );
            st.errors = errors;
            if (Object.keys(errors).length) valid = false;
            break;
          }
          case 'container':
            visit(component.id);
            break;
          case 'tabs':
            visit(component.id, (st.activeTab ?? props.tabs?.[0]?.id) as string | undefined);
            break;
        }
      }
    };
    visit(tabsId, stepId);
    return valid;
  }

  function resetPage() {
    generation++;
    stopTimers();
    ownRuns.clear();
    followed.clear();
    ended.clear();
    waiting.clear();
    pendingConfirm.value?.resolve(false);
    for (const key of Object.keys(components)) delete components[key];
    for (const key of Object.keys(runnables)) delete runnables[key];
    const current = page();
    if (!current) return;
    for (const name of Object.keys(current.runnables))
      runnables[name] = emptyRunnableState();
    for (const component of current.components) components[component.id] = {};
    // Defaults may refer to state, page params or other components — resolve them
    // once everything above exists.
    for (const component of current.components)
      components[component.id] = initialComponentState(component);
    for (const component of current.components)
      if (component.type === 'timer') scheduleTimer(component);

    if (Object.values(current.runnables).some((def) => def.mode === 'run'))
      void followActiveRuns(current.id);

    const onLoad = Object.entries(current.runnables)
      .filter(([, def]) => def.trigger === 'load')
      .map(([name]) => run(name));
    void Promise.all([...onLoad, runActions(current.events?.load)]);
  }

  // A detached copy of the declared defaults — the source may be a reactive proxy,
  // which structuredClone can't copy, so strip reactivity with a JSON round-trip.
  function initialState(source: AppSource | null): Record<string, unknown> {
    return JSON.parse(JSON.stringify(source?.state ?? {}));
  }

  // When the runtime owns app state, it is seeded once per app (from `state`
  // defaults), not per page.
  if (ownsState) {
    watch(
      () => options.appIdentifier.value,
      () => {
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, initialState(options.source.value));
      }
    );
    watch(
      () => options.source.value,
      (source, previous) => {
        if (source && !previous) Object.assign(state, initialState(source));
      },
      { immediate: true }
    );
  }
  watch(
    [
      () => options.source.value,
      () => options.pageId.value,
      () => pageParams.value,
    ],
    resetPage,
    {
      immediate: true,
    }
  );

  return {
    state,
    components,
    runnables,
    pendingConfirm,
    context,
    resolveProps,
    run,
    runActions,
    navigate,
    resetComponent,
    handleComponentEvent,
    setComponentState,
    checkStep,
    fireTimer,
    setTimerRunning,
    sendChat,
  };
}

export { initialValue as initialFieldValue };
