import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { effectScope, nextTick, reactive, ref } from 'vue';
import type { AppSource } from '@tipeline/schemas';

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));
vi.mock('@/components/ui/sonner', () => ({ toast }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/composables/useErrorT', () => ({
  useErrorT: () => ({ translateError: (m: string) => m }),
}));
vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/utils/runAppRunnable', () => ({ runAppRunnable: vi.fn() }));

import { isRunningFor, useAppRuntime } from '@/composables/useAppRuntime';
import { dayEnd, dayStart } from '@/utils/appDates';
import { invokeCore } from '@/utils/invoke';
import { runAppRunnable } from '@/utils/runAppRunnable';

/** A table's state before anything is edited or checked (and after `reset`). */
const NO_TABLE_EDITS = {
  edits: {},
  added: [],
  deleted: [],
  changes: { added: [], updated: [], deleted: [] },
  hasChanges: false,
  selectedKeys: [],
  selectedRows: [],
};

/** A promise you resolve/reject from the test. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>(
    (res, rej) => ((resolve = res), (reject = rej))
  );
  return { promise, resolve, reject };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick();
};

function makeSource(): AppSource {
  return {
    schemaVersion: 2,
    workflows: {
      invoices: { identifier: 'task-list' },
      approval: { identifier: 'task-approve' },
    },
    state: { status: 'pending' },
    pages: [
      {
        id: 'queue',
        name: 'Queue',
        showInMenu: true,
        events: { load: [{ type: 'setState', key: 'visited', value: true }] },
        runnables: {
          list: {
            mode: 'history',
            workflow: 'invoices',
            trigger: 'load',
            source: 'actionResults',
            filter: { mode: 'latest' },
            onSuccess: [],
            onError: [],
          },
          approve: {
            mode: 'run',
            workflow: 'approval',
            trigger: 'manual',
            inputs: {
              invoiceId: '{= invoiceTable.selectedRow.id =}',
              note: 'by {{ state.status }}',
            },
            outputs: ['status'],
            persist: true,
            onSuccess: [
              {
                type: 'setState',
                key: 'status',
                value: '{= result.outputs.status =}',
              },
              {
                type: 'toast',
                message: 'Approved {{ invoiceTable.selectedRow.id }}',
                variant: 'success',
              },
              { type: 'run', runnable: 'list' },
            ],
            onError: [
              {
                type: 'setState',
                key: 'lastError',
                value: '{{ error.message }}',
              },
            ],
          },
          guarded: {
            mode: 'run',
            workflow: 'approval',
            trigger: 'manual',
            inputs: {},
            outputs: [],
            persist: false,
            confirm: 'Really approve {{ state.status }}?',
            onSuccess: [],
            onError: [],
          },
        },
        components: [
          {
            id: 'invoiceTable',
            type: 'table',
            name: 'Invoices',
            layout: { x: 0, y: 0, w: 12, h: 4 },
            props: { data: '{= runnables.list.data =}' },
            events: { rowClick: [{ type: 'run', runnable: 'approve' }] },
          },
        ],
      },
      {
        id: 'other',
        name: 'Other',
        showInMenu: true,
        events: {},
        runnables: {},
        components: [],
      },
    ],
  };
}

function setup(source = makeSource()) {
  const scope = effectScope();
  const pageId = ref<string | null>('queue');
  const runtime = scope.run(() =>
    useAppRuntime({ appIdentifier: ref('app-1'), source: ref(source), pageId })
  )!;
  return { runtime, pageId, scope, source };
}

/** History fetches only (page load also asks core for runs in progress). */
const historyFetches = () =>
  vi.mocked(invokeCore).mock.calls.filter(([c]) => c === 'appHistoryFetch');

let activeRuns: unknown[] = [];

describe('useAppRuntime', () => {
  let scope: ReturnType<typeof effectScope> | null = null;

  beforeEach(() => {
    activeRuns = [];
    vi.mocked(invokeCore)
      .mockReset()
      .mockImplementation(async (channel: string) =>
        channel === 'appRunsActive' ? activeRuns : [{ id: 1 }, { id: 2 }]
      );
    vi.mocked(runAppRunnable)
      .mockReset()
      .mockResolvedValue({
        pipelineIdentifier: 'p-1',
        outputs: { status: 'approved' },
      });
    toast.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    toast.info.mockReset();
  });

  afterEach(() => scope?.stop());

  it('on page load: initializes state, runs load-trigger runnables and page load actions', async () => {
    const s = setup();
    scope = s.scope;
    await flush();

    expect(invokeCore).toHaveBeenCalledWith('appHistoryFetch', {
      appIdentifier: 'app-1',
      pageId: 'queue',
      runnable: 'list',
    });
    expect(s.runtime.runnables.list.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(s.runtime.state).toMatchObject({ status: 'pending', visited: true });
    // the table's data binding resolves to the rows
    expect(s.runtime.resolveProps(s.source.pages[0].components[0])).toEqual({
      data: [{ id: 1 }, { id: 2 }],
    });
    expect(runAppRunnable).not.toHaveBeenCalled();
  });

  it('a component event publishes its state, then runs handlers that read it', async () => {
    const s = setup();
    scope = s.scope;
    await flush();
    vi.mocked(invokeCore).mockClear();

    s.runtime.handleComponentEvent(
      s.source.pages[0].components[0],
      'rowClick',
      { selectedRow: { id: 42 } }
    );
    await flush();

    expect(runAppRunnable).toHaveBeenCalledWith(
      {
        appIdentifier: 'app-1',
        pageId: 'queue',
        runnable: 'approve',
        inputs: { invoiceId: 42, note: 'by pending' },
      },
      expect.any(Function),
      expect.any(String)
    );
    // onSuccess, in order: result into state, toast with bindings, refresh the list
    expect(s.runtime.state.status).toBe('approved');
    expect(s.runtime.runnables.approve.outputs).toEqual({ status: 'approved' });
    expect(toast.success).toHaveBeenCalledWith('Approved 42');
    expect(historyFetches()).toHaveLength(1);
  });

  it('keeps a step-by-step log of the latest run for Run Consoles', async () => {
    vi.mocked(runAppRunnable).mockImplementation(
      async (_p: any, onEvent?: any) => {
        onEvent?.({ type: 'start', data: {} });
        onEvent?.({
          type: 'action',
          data: { name: 'file.read', result: 'x'.repeat(300) },
        });
        onEvent?.({
          type: 'action_error',
          data: { name: 'script.runScript', error: 'boom' },
        });
        return { pipelineIdentifier: 'p', outputs: {} };
      }
    );
    const s = setup();
    scope = s.scope;
    await flush();

    await s.runtime.run('approve');
    const log = s.runtime.runnables.approve.log.map((e) => [
      e.kind,
      e.name,
      e.detail?.length ?? e.detail,
    ]);

    expect(log).toEqual([
      ['started', 'approve', undefined],
      ['action', 'file.read', 118], // long results are cut to 117 chars + "…"
      ['error', 'script.runScript', 4],
      ['finished', 'approve', undefined],
    ]);

    // a new run starts a fresh log
    vi.mocked(runAppRunnable).mockRejectedValueOnce(new Error('nope'));
    await s.runtime.run('approve');
    expect(s.runtime.runnables.approve.log.map((e) => e.kind)).toEqual([
      'started',
      'failed',
    ]);
  });

  it('tracks status, step count and timing of the latest run for status lines', async () => {
    const pending = deferred<any>();
    let emit: (e: any) => void = () => {};
    vi.mocked(runAppRunnable).mockImplementation((_p: any, onEvent?: any) => {
      emit = onEvent;
      return pending.promise;
    });
    const s = setup();
    scope = s.scope;
    await flush();
    const st = s.runtime.runnables.approve;
    expect(st.status).toBe('idle');

    const done = s.runtime.run('approve');
    expect(st).toMatchObject({ status: 'running', steps: 0, finishedAt: null });
    expect(st.startedAt).toBeTypeOf('number');

    emit({ type: 'action', data: { name: 'file.read' } });
    emit({ type: 'action', data: { name: 'http.get' } });
    expect(st).toMatchObject({ steps: 2, lastStep: 'http.get' });

    pending.resolve({ pipelineIdentifier: 'p-9', outputs: {} });
    await done;
    expect(st).toMatchObject({
      status: 'finished',
      steps: 2,
      pipelineIdentifier: 'p-9',
    });
    expect(st.finishedAt).toBeGreaterThanOrEqual(st.startedAt!);

    // a failure names the step that errored, not the last one that worked
    vi.mocked(runAppRunnable).mockImplementationOnce(
      async (_p: any, onEvent?: any) => {
        onEvent?.({ type: 'action', data: { name: 'file.read' } });
        onEvent?.({ type: 'action_error', data: { name: 'email.send' } });
        throw new Error('smtp down');
      }
    );
    await s.runtime.run('approve');
    expect(st).toMatchObject({
      status: 'failed',
      steps: 1,
      lastStep: 'file.read',
      failedStep: 'email.send',
      error: 'smtp down',
    });

    // a new run clears the previous failure
    vi.mocked(runAppRunnable).mockResolvedValueOnce({
      pipelineIdentifier: 'p-10',
      outputs: {},
      status: 'paused',
    });
    await s.runtime.run('approve');
    expect(st).toMatchObject({ status: 'paused', failedStep: '', error: null });
  });

  it('a canceled run is neither a success nor a failure, and stops the action chain', async () => {
    vi.mocked(runAppRunnable).mockResolvedValue({
      pipelineIdentifier: '',
      outputs: {},
      status: 'canceled',
    });
    const s = setup();
    scope = s.scope;
    await flush();

    expect(await s.runtime.run('approve')).toBe(false);

    expect(s.runtime.runnables.approve).toMatchObject({
      isRunning: false,
      status: 'canceled',
      error: null,
    });
    expect(s.runtime.runnables.approve.log.map((e) => e.kind)).toEqual(['started', 'canceled']);
    expect(s.runtime.state.status).toBe('pending'); // no onSuccess
    expect(s.runtime.state.lastError).toBeUndefined(); // no onError
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a failed run records the error and runs onError instead of onSuccess', async () => {
    vi.mocked(runAppRunnable).mockRejectedValue(
      new Error('Variable "invoiceId" is private')
    );
    const s = setup();
    scope = s.scope;
    await flush();

    const ok = await s.runtime.run('approve');

    expect(ok).toBe(false);
    expect(s.runtime.runnables.approve).toMatchObject({
      isRunning: false,
      error: 'Variable "invoiceId" is private',
    });
    expect(s.runtime.state.lastError).toBe('Variable "invoiceId" is private');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled(); // onError handled it
  });

  it('the app shows a failure without the engine’s action tag; the run log keeps it', async () => {
    vi.mocked(runAppRunnable).mockRejectedValue(new Error('[script.runScript] "Translate" has no owner yet'));
    const s = setup();
    scope = s.scope;
    await flush();

    await s.runtime.run('approve');

    expect(s.runtime.runnables.approve.error).toBe('"Translate" has no owner yet');
    expect(s.runtime.state.lastError).toBe('"Translate" has no owner yet'); // onError's error.message
    expect(s.runtime.runnables.approve.log.at(-1)?.detail).toBe('[script.runScript] "Translate" has no owner yet');
  });

  it('a run that stops at an approval step is neither a success nor a failure, and stops the chain', async () => {
    vi.mocked(runAppRunnable).mockResolvedValue({
      pipelineIdentifier: 'p-9',
      outputs: {},
      status: 'paused',
    });
    const s = setup();
    scope = s.scope;
    await flush();

    const ok = await s.runtime.runActions([
      { type: 'run', runnable: 'approve' },
      { type: 'setState', key: 'after', value: 1 },
    ]);

    expect(ok).toBeUndefined();
    expect(s.runtime.state.status).toBe('pending'); // onSuccess did not run
    expect(s.runtime.state.lastError).toBeUndefined(); // nor onError
    expect(s.runtime.state.after).toBeUndefined();
    expect(s.runtime.runnables.approve).toMatchObject({
      isRunning: false,
      pipelineIdentifier: 'p-9',
      error: null,
    });
    expect(s.runtime.runnables.approve.log.at(-1)).toMatchObject({
      kind: 'paused',
      name: 'approve',
    });
    expect(toast.info).toHaveBeenCalledWith('apps.runtime.awaitingApproval');
  });

  it('runs onPaused (with the waiting run) instead of the default notice when it has actions', async () => {
    vi.mocked(runAppRunnable).mockResolvedValue({
      pipelineIdentifier: 'p-9',
      outputs: {},
      status: 'paused',
    });
    const source = makeSource();
    (source.pages[0].runnables.approve as any).onPaused = [
      {
        type: 'setState',
        key: 'waitingRun',
        value: '{= result.pipelineIdentifier =}',
      },
    ];
    const s = setup(source);
    scope = s.scope;
    await flush();

    expect(await s.runtime.run('approve')).toBe(false);
    expect(s.runtime.state.waitingRun).toBe('p-9');
    expect(s.runtime.state.status).toBe('pending'); // still not onSuccess
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('without onError a failure is shown as a toast, and a failed run stops the action chain', async () => {
    vi.mocked(invokeCore).mockRejectedValue(new Error('boom'));
    const s = setup();
    scope = s.scope;
    await flush();
    toast.error.mockClear();

    await s.runtime.runActions([
      { type: 'run', runnable: 'list' },
      { type: 'setState', key: 'after', value: 1 },
    ]);

    expect(toast.error).toHaveBeenCalledWith('apps.runtime.runFailed', {
      description: 'boom',
    });
    expect(s.runtime.state.after).toBeUndefined();
  });

  it('ignores a second trigger while the runnable is already running', async () => {
    const pending = deferred<any>();
    vi.mocked(runAppRunnable).mockReturnValue(pending.promise);
    const s = setup();
    scope = s.scope;
    await flush();

    const first = s.runtime.run('approve');
    const second = await s.runtime.run('approve');
    pending.resolve({ pipelineIdentifier: 'p', outputs: {} });

    expect(second).toBe(false);
    expect(await first).toBe(true);
    expect(runAppRunnable).toHaveBeenCalledTimes(1);
  });

  describe('events that ask for what is shown, while the runnable is busy', () => {
    /** A calendar whose rangeChange loads its days, and a button that submits. */
    function calendarSource() {
      const source = makeSource();
      source.pages[0].runnables.days = {
        mode: 'run',
        workflow: 'invoices',
        trigger: 'manual',
        inputs: { from: '{{ cal.from }}', to: '{{ cal.to }}' },
        outputs: ['events'],
        persist: false,
        onSuccess: [{ type: 'setState', key: 'loaded', value: '{= result.outputs.from =}' }],
        onError: [],
      } as any;
      const cal = { id: 'cal', type: 'calendar', name: 'C', layout: { x: 0, y: 40, w: 12, h: 40 }, props: {}, events: { rangeChange: [{ type: 'run', runnable: 'days' }] } } as any;
      const save = { id: 'save', type: 'button', name: 'S', layout: { x: 0, y: 80, w: 2, h: 5 }, props: {}, events: { click: [{ type: 'run', runnable: 'days' }] } } as any;
      source.pages[0].components.push(cal, save);
      return { source, cal, save };
    }
    const daysRuns = () =>
      vi.mocked(runAppRunnable).mock.calls.filter(([req]) => req.runnable === 'days').map(([req]) => req.inputs);

    it('runs once more, with only the latest range, after the run in progress ends', async () => {
      const { source, cal } = calendarSource();
      const runs = [deferred<any>(), deferred<any>()];
      let call = 0;
      vi.mocked(runAppRunnable).mockImplementation(() => runs[call++].promise);
      const s = setup(source);
      scope = s.scope;
      await flush();

      s.runtime.handleComponentEvent(cal, 'rangeChange', { from: '2026-09-27', to: '2026-11-07' });
      await flush();
      // Moved twice while the month loads: only the last range is asked for, and only later.
      s.runtime.handleComponentEvent(cal, 'rangeChange', { from: '2026-08-30', to: '2026-10-10' });
      s.runtime.handleComponentEvent(cal, 'rangeChange', { from: '2026-10-13', to: '2026-10-13' });
      await flush();
      expect(daysRuns()).toEqual([{ from: '2026-09-27', to: '2026-11-07' }]);

      runs[0].resolve({ pipelineIdentifier: 'p1', outputs: { from: 'month' } });
      await flush();
      expect(daysRuns()).toEqual([
        { from: '2026-09-27', to: '2026-11-07' },
        { from: '2026-10-13', to: '2026-10-13' },
      ]);
      // The stale run still finished normally (its onSuccess ran) before the new one.
      expect(s.runtime.state.loaded).toBe('month');

      runs[1].resolve({ pipelineIdentifier: 'p2', outputs: { from: 'day' } });
      await flush();
      expect(s.runtime.state.loaded).toBe('day');
      expect(daysRuns()).toHaveLength(2);
    });

    it('also asks again when the run in progress fails', async () => {
      const { source, cal } = calendarSource();
      const first = deferred<any>();
      vi.mocked(runAppRunnable).mockReturnValueOnce(first.promise);
      const s = setup(source);
      scope = s.scope;
      await flush();

      s.runtime.handleComponentEvent(cal, 'rangeChange', { from: 'a', to: 'a' });
      await flush();
      s.runtime.handleComponentEvent(cal, 'rangeChange', { from: 'b', to: 'b' });
      first.reject(new Error('boom'));
      await flush();
      expect(daysRuns()).toEqual([{ from: 'a', to: 'a' }, { from: 'b', to: 'b' }]);
    });

    it('other events (a button click) are still ignored while it runs', async () => {
      const { source, save } = calendarSource();
      const first = deferred<any>();
      vi.mocked(runAppRunnable).mockReturnValueOnce(first.promise);
      const s = setup(source);
      scope = s.scope;
      await flush();

      s.runtime.handleComponentEvent(save, 'click');
      await flush();
      s.runtime.handleComponentEvent(save, 'click');
      first.resolve({ pipelineIdentifier: 'p', outputs: {} });
      await flush();
      expect(daysRuns()).toHaveLength(1);
    });

    it('a pagination change waits too; leaving the page forgets what was waiting', async () => {
      const { source } = calendarSource();
      const pager = { id: 'pager', type: 'pagination', name: 'P', layout: { x: 0, y: 90, w: 12, h: 5 }, props: { total: 100, pageSize: 10 }, events: { change: [{ type: 'run', runnable: 'days' }] } } as any;
      source.pages[0].components.push(pager);
      source.pages[0].runnables.days.inputs = { from: '{{ pager.page }}', to: '' } as any;
      const first = deferred<any>();
      vi.mocked(runAppRunnable).mockReturnValueOnce(first.promise);
      const s = setup(source);
      scope = s.scope;
      await flush();

      s.runtime.handleComponentEvent(pager, 'change', { page: 2 });
      await flush();
      s.runtime.handleComponentEvent(pager, 'change', { page: 3 });
      first.resolve({ pipelineIdentifier: 'p', outputs: {} });
      await flush();
      expect(daysRuns()).toEqual([{ from: '2', to: '' }, { from: '3', to: '' }]);

      // Waiting, then the page changes: nothing fires later.
      const again = deferred<any>();
      vi.mocked(runAppRunnable).mockReturnValueOnce(again.promise);
      s.runtime.handleComponentEvent(pager, 'change', { page: 4 });
      await flush();
      s.runtime.handleComponentEvent(pager, 'change', { page: 5 });
      await s.runtime.runActions([{ type: 'navigate', page: 'other', params: {} }]);
      again.resolve({ pipelineIdentifier: 'p', outputs: {} });
      await flush();
      expect(daysRuns()).toHaveLength(3);
    });
  });

  it('asks for confirmation first, and cancelling does not run', async () => {
    const s = setup();
    scope = s.scope;
    await flush();

    const cancelled = s.runtime.run('guarded');
    await flush();
    expect(s.runtime.pendingConfirm.value?.message).toBe(
      'Really approve pending?'
    );
    s.runtime.pendingConfirm.value!.resolve(false);
    expect(await cancelled).toBe(false);
    expect(runAppRunnable).not.toHaveBeenCalled();

    const confirmed = s.runtime.run('guarded');
    await flush();
    s.runtime.pendingConfirm.value!.resolve(true);
    expect(await confirmed).toBe(true);
    expect(runAppRunnable).toHaveBeenCalledTimes(1);
  });

  it('drops responses that arrive after navigating away, and keeps app state across pages', async () => {
    const pending = deferred<any>();
    const s = setup();
    scope = s.scope;
    await flush();
    vi.mocked(runAppRunnable).mockReturnValue(pending.promise);

    const run = s.runtime.run('approve');
    await s.runtime.runActions([
      { type: 'navigate', page: 'other', params: { id: 9 } },
    ]);
    await flush();
    pending.resolve({ pipelineIdentifier: 'p', outputs: { status: 'late' } });

    expect(await run).toBe(false);
    expect(s.pageId.value).toBe('other');
    expect(s.runtime.runnables.approve).toBeUndefined();
    expect(s.runtime.state.status).toBe('pending');
    expect(s.runtime.context().page).toEqual({
      id: 'other',
      params: { id: 9 },
    });
  });

  it('navigate ignores unknown pages and ends the action list', async () => {
    const s = setup();
    scope = s.scope;
    await flush();

    await s.runtime.runActions([
      { type: 'navigate', page: 'missing' },
      { type: 'setState', key: 'after', value: 1 },
    ]);

    expect(s.pageId.value).toBe('queue');
    expect(s.runtime.state.after).toBeUndefined();
  });

  it('sliders start at their default kept inside min..max, else at min (a range: min..max)', async () => {
    const source = makeSource();
    source.state = { ...source.state, top: 40 };
    const slider = (id: string, props: Record<string, unknown>) =>
      ({ id, type: 'input', name: id, layout: { x: 0, y: 20, w: 4, h: 6 }, props: { inputType: 'slider', ...props }, events: {} }) as any;
    source.pages[0].components.push(
      slider('plain', {}),
      slider('stepped', { min: 10, max: 20, step: 5, default: 18 }),
      slider('price', { range: true, max: '{= state.top =}' }),
      slider('typed', { range: true, max: 2000, default: '[300, 1200]' }),
      {
        id: 'survey',
        type: 'form',
        name: 'Survey',
        layout: { x: 0, y: 30, w: 6, h: 10 },
        props: { fields: [{ name: 'score', type: 'slider', max: 10 }, { name: 'span', type: 'slider', range: true, min: 1, max: 5, default: [4, 2] }, { name: 'nps', type: 'slider', max: 10, required: true }] },
        events: {},
      } as any
    );
    const s = setup(source);
    scope = s.scope;
    await flush();

    expect(s.runtime.components.plain.value).toBe(0);
    expect(s.runtime.components.stepped.value).toBe(20); // 18 → nearest step
    expect(s.runtime.components.price.value).toEqual([0, 40]); // max from a binding
    expect(s.runtime.components.typed.value).toEqual([300, 1200]);
    expect(s.runtime.components.survey.values).toEqual({ score: 0, span: [2, 4], nps: null }); // required: unanswered
  });

  it('a custom component’s code reaches it as written; its other props resolve', async () => {
    const source = makeSource();
    const code = '<p>{{ state.whatever }} {{ nothing.here }}</p>';
    const custom = { id: 'widget', type: 'custom', name: 'W', layout: { x: 0, y: 30, w: 6, h: 10 }, props: { code, data: '{= state.selected =}' }, events: {} } as any;
    source.pages[0].components.push(custom);
    source.state = { ...source.state, selected: { id: 3 } };
    const s = setup(source);
    scope = s.scope;
    await flush();

    const resolved = s.runtime.resolveProps(custom);
    expect(resolved.code).toBe(code);
    expect(resolved.data).toEqual({ id: 3 });
  });

  it('a pagination starts on page 1, follows change, and reset puts it back on page 1', async () => {
    const source = makeSource();
    const pager = { id: 'pager', type: 'pagination', name: 'P', layout: { x: 0, y: 40, w: 12, h: 5 }, props: { total: 57, pageSize: 25 }, events: {} } as any;
    source.pages[0].components.push(pager);
    const s = setup(source);
    scope = s.scope;
    await flush();

    expect(s.runtime.components.pager).toEqual({ page: 1, pageSize: 25, offset: 0, from: 1, to: 25 });
    s.runtime.handleComponentEvent(pager, 'change', { page: 3, pageSize: 25, offset: 50, from: 51, to: 57 });
    s.runtime.setComponentState(pager.id, { page: 3, pageSize: 50, offset: 100 });
    await s.runtime.runActions([{ type: 'reset', component: 'pager' }]);
    // page 1 again — with the page size the person chose
    expect(s.runtime.components.pager).toEqual({ page: 1, pageSize: 50, offset: 0, from: 1, to: 50 });
  });

  it('a color input (and form field) starts as hex, whatever its default is written as', async () => {
    const source = makeSource();
    const brand = { id: 'brand', type: 'input', name: 'B', layout: { x: 0, y: 40, w: 4, h: 8 }, props: { inputType: 'color', default: 'rgb(255, 0, 128)' }, events: {} } as any;
    const theme = { id: 'theme', type: 'form', name: 'T', layout: { x: 4, y: 40, w: 4, h: 20 }, props: { fields: [{ name: 'accent', type: 'color', default: '#ABC' }, { name: 'none', type: 'color' }] }, events: {} } as any;
    source.pages[0].components.push(brand, theme);
    const s = setup(source);
    scope = s.scope;
    await flush();

    expect(s.runtime.components.brand.value).toBe('#ff0080');
    expect(s.runtime.components.theme.values).toEqual({ accent: '#aabbcc', none: null });
  });

  it('an avatar group remembers who was clicked', async () => {
    const source = makeSource();
    const team = { id: 'team', type: 'avatar', name: 'T', layout: { x: 0, y: 40, w: 4, h: 7 }, props: { data: [{ name: 'Ada' }] }, events: {} } as any;
    source.pages[0].components.push(team);
    const s = setup(source);
    scope = s.scope;
    await flush();
    expect(s.runtime.components.team).toEqual({ selectedItem: null, selectedIndex: null });
  });

  it('a tree starts with its default ticks and nothing selected; reset goes back to them', async () => {
    const source = makeSource();
    const tree = { id: 'folders', type: 'tree', name: 'T', layout: { x: 0, y: 40, w: 4, h: 30 }, props: { selection: 'multiple', defaultChecked: ['inv', 7] }, events: {} } as any;
    source.pages[0].components.push(tree);
    const s = setup(source);
    scope = s.scope;
    await flush();

    const start = { selectedNode: null, selectedId: null, checked: ['inv', '7'], checkedLeaves: [] };
    expect(s.runtime.components.folders).toEqual(start);
    s.runtime.setComponentState(tree.id, { selectedNode: { id: 'x' }, selectedId: 'x', checked: [], checkedLeaves: [] });
    await s.runtime.runActions([{ type: 'reset', component: 'folders' }]);
    expect(s.runtime.components.folders).toEqual(start);
  });

  it('tabs open on their default tab, follow change events, and reset back to the default', async () => {
    const source = makeSource();
    source.state = { ...source.state, tab: 'details' };
    const tabs = {
      id: 'sections',
      type: 'tabs',
      name: 'Sections',
      layout: { x: 0, y: 4, w: 12, h: 6 },
      props: {
        tabs: [
          { id: 'summary', label: 'Summary' },
          { id: 'details', label: 'Details' },
        ],
        defaultTab: '{{ state.tab }}',
      },
      events: { change: [{ type: 'setState', key: 'seen', value: '{= sections.activeTab =}' }] },
    } as any;
    source.pages[0].components.push(tabs, { id: 'plain', type: 'tabs', name: 'Plain', layout: { x: 0, y: 10, w: 12, h: 4 }, props: { tabs: [{ id: 'a', label: 'A' }], defaultTab: 'missing' }, events: {} } as any);
    const s = setup(source);
    scope = s.scope;
    await flush();

    expect(s.runtime.components.sections).toEqual({ activeTab: 'details' });
    expect(s.runtime.components.plain).toEqual({ activeTab: 'a' }); // unknown default → first tab

    s.runtime.handleComponentEvent(tabs, 'change', { activeTab: 'summary' });
    await flush();
    expect(s.runtime.components.sections.activeTab).toBe('summary');
    expect(s.runtime.state.seen).toBe('summary');

    s.runtime.resetComponent('sections');
    expect(s.runtime.components.sections.activeTab).toBe('details');
  });

  it('checkStep: required inputs, selects, date ranges and forms of the step, through containers', async () => {
    const source = makeSource();
    const at = (id: string, type: string, parent: any, props: any = {}) =>
      ({ id, type, name: id, layout: { x: 0, y: 0, w: 4, h: 4 }, parent, props, events: {} }) as any;
    const step = (tab: string) => ({ id: 'wizard', tab });
    source.pages[0].components.push(
      at('wizard', 'tabs', undefined, { display: 'steps', tabs: [{ id: 'who', label: 'Who' }, { id: 'when', label: 'When' }] }),
      at('name', 'input', step('who'), { required: true }),
      at('nick', 'input', step('who')), // not required
      at('mail', 'input', step('who'), { inputType: 'email' }), // not required, but must be well formed
      at('box', 'container', step('who')),
      at('role', 'select', { id: 'box' }, { required: true, multiple: true, options: ['a', 'b'] }),
      at('secret', 'input', { id: 'box' }, { required: true, visible: false }), // hidden: skipped
      at('dates', 'dateRange', step('when'), { required: true }),
      at('extra', 'form', step('when'), { fields: [{ name: 'note', type: 'text', required: true }] }),
      at('attachments', 'fileDrop', step('when'), { required: true })
    );
    const s = setup(source);
    scope = s.scope;
    await flush();

    expect(s.runtime.checkStep('wizard', 'who')).toBe(false);
    expect(s.runtime.components.name.error).toBe('required');
    expect(s.runtime.components.role.error).toBe('required'); // [] counts as empty
    expect(s.runtime.components.nick.error).toBeNull();
    expect(s.runtime.components.secret.error).toBeUndefined();
    // the other step is left alone
    expect(s.runtime.components.dates.error).toBeUndefined();

    s.runtime.setComponentState('mail', { value: 'ada@' });
    s.runtime.setComponentState('name', { value: 'Ada' });
    s.runtime.setComponentState('role', { value: ['a'] });
    expect(s.runtime.checkStep('wizard', 'who')).toBe(false); // the email
    expect(s.runtime.components.mail.error).toBe('invalidEmail');
    s.runtime.setComponentState('mail', { value: 'ada@example.com' });
    expect(s.runtime.checkStep('wizard', 'who')).toBe(true);
    expect(s.runtime.components.name.error).toBeNull();

    expect(s.runtime.checkStep('wizard', 'when')).toBe(false);
    expect(s.runtime.components.dates.error).toBe('required');
    expect(s.runtime.components.extra.errors).toEqual({ note: 'required' });
    expect(s.runtime.components.attachments.error).toBe('required'); // [] is empty
    s.runtime.setComponentState('attachments', { value: ['/tmp/a.pdf'] });
    s.runtime.setComponentState('dates', { value: { from: '2026-10-01', to: '2026-10-02' } });
    s.runtime.setComponentState('extra', { values: { note: 'hi' } });
    expect(s.runtime.checkStep('wizard', 'when')).toBe(true);
    expect(s.runtime.components.extra.errors).toEqual({});
  });

  describe('timers', () => {
    const timer = (props: Record<string, unknown>) =>
      ({
        id: 'refresh',
        type: 'timer',
        name: 'Refresh',
        layout: { x: 0, y: 20, w: 4, h: 6 },
        props,
        events: { tick: [{ type: 'setState', key: 'ticked', value: '{= refresh.ticks =}' }] },
      }) as any;
    const withTimer = (props: Record<string, unknown>, state: Record<string, unknown> = {}) => {
      const source = makeSource();
      source.state = { ...source.state, ...state };
      source.pages[0].components.push(timer(props));
      return setup(source);
    };

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('ticks every interval, runs its handlers and counts; leaving the page stops it', async () => {
      const s = withTimer({ interval: 5 });
      scope = s.scope;
      expect(s.runtime.components.refresh).toMatchObject({ running: true, ticks: 0, lastTick: null });
      expect(s.runtime.components.refresh.nextAt).toBe(Date.now() + 5000);

      await vi.advanceTimersByTimeAsync(4999);
      expect(s.runtime.state.ticked).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(s.runtime.state.ticked).toBe(1);
      await vi.advanceTimersByTimeAsync(10000);
      expect(s.runtime.state.ticked).toBe(3);
      expect(typeof s.runtime.components.refresh.lastTick).toBe('string');

      s.pageId.value = null;
      await flush();
      await vi.advanceTimersByTimeAsync(20000);
      expect(s.runtime.state.ticked).toBe(3);
    });

    it('pause / resume, run now, and no repeat (a countdown)', async () => {
      const s = withTimer({ interval: 2, repeat: false });
      scope = s.scope;
      s.runtime.setTimerRunning('refresh', false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(s.runtime.state.ticked).toBeUndefined();
      expect(s.runtime.components.refresh.nextAt).toBeNull();

      s.runtime.fireTimer('refresh'); // run now, even paused
      expect(s.runtime.state.ticked).toBe(1);

      s.runtime.setTimerRunning('refresh', true);
      await vi.advanceTimersByTimeAsync(2000);
      expect(s.runtime.state.ticked).toBe(2);
      expect(s.runtime.components.refresh.running).toBe(false); // once, then stops
      await vi.advanceTimersByTimeAsync(10000);
      expect(s.runtime.state.ticked).toBe(2);

      s.runtime.resetComponent('refresh');
      expect(s.runtime.components.refresh).toMatchObject({ running: true, ticks: 0 });
    });

    it('a bound running / interval takes effect when it changes', async () => {
      const s = withTimer({ interval: '{= state.every =}', running: '{{ state.auto }}' }, { auto: false, every: 3 });
      scope = s.scope;
      expect(s.runtime.components.refresh.running).toBe(false);
      await vi.advanceTimersByTimeAsync(10000);
      expect(s.runtime.state.ticked).toBeUndefined();

      s.runtime.state.auto = true;
      await flush();
      expect(s.runtime.components.refresh.running).toBe(true);
      await vi.advanceTimersByTimeAsync(3000);
      expect(s.runtime.state.ticked).toBe(1);

      s.runtime.state.every = 10;
      await flush();
      await vi.advanceTimersByTimeAsync(9000);
      expect(s.runtime.state.ticked).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(s.runtime.state.ticked).toBe(2);
    });
  });

  it('chat: a message runs the runnable with the conversation; its reply (or error) joins it', async () => {
    const source = makeSource();
    source.pages[0].runnables.answer = {
      mode: 'run', workflow: 'approval', trigger: 'manual', persist: false,
      inputs: { message: '{{ talk.message }}', history: '{= talk.messages =}' }, outputs: ['reply'], onSuccess: [], onError: [], onPaused: [],
    } as any;
    source.pages[0].components.push({
      id: 'talk', type: 'chat', name: 'Talk', layout: { x: 0, y: 30, w: 6, h: 40 },
      props: { runnable: 'answer', welcome: 'Hi {{ state.status }}' },
      events: { send: [{ type: 'setState', key: 'sent', value: '{= talk.message =}' }], reply: [{ type: 'setState', key: 'got', value: '{= talk.reply =}' }] },
    } as any);
    const s = setup(source);
    scope = s.scope;
    await flush();
    expect(s.runtime.components.talk.messages).toMatchObject([{ role: 'assistant', text: 'Hi pending' }]);

    vi.mocked(runAppRunnable).mockResolvedValueOnce({ pipelineIdentifier: '', outputs: { reply: 'Sure!' }, status: 'completed' });
    await s.runtime.sendChat('talk', '  hello  ');
    const call = vi.mocked(runAppRunnable).mock.calls.at(-1)![0];
    expect(call.inputs).toMatchObject({ message: 'hello', history: [{ role: 'assistant' }, { role: 'user', text: 'hello' }] });
    expect(s.runtime.components.talk.messages.map((m: any) => `${m.role}:${m.text}`)).toEqual(['assistant:Hi pending', 'user:hello', 'assistant:Sure!']);
    expect(s.runtime.state).toMatchObject({ sent: 'hello', got: 'Sure!' });
    expect(s.runtime.components.talk.waiting).toBe(false);

    // A failed run: its error in the chat, and no toast (the chat shows it).
    toast.error.mockReset();
    vi.mocked(runAppRunnable).mockRejectedValueOnce(new Error('no key'));
    await s.runtime.sendChat('talk', 'again');
    expect(s.runtime.components.talk.messages.at(-1)).toMatchObject({ role: 'error', text: 'no key' });
    expect(toast.error).not.toHaveBeenCalled();

    expect(await s.runtime.sendChat('talk', '   ')).toBe(false); // nothing to send
    s.runtime.resetComponent('talk');
    expect(s.runtime.components.talk.messages).toHaveLength(1); // the welcome again
  });

  it('a history runnable filters by a date range component: resolved, as local day bounds', async () => {
    const source = makeSource();
    const page = source.pages[0];
    (page.runnables.list as any).filter = {
      mode: 'dateRange',
      dateFrom: '{= period.from =}',
      dateTo: '{= period.to =}',
    };
    page.components.push({
      id: 'period',
      type: 'dateRange',
      name: 'Period',
      layout: { x: 0, y: 40, w: 4, h: 10 },
      props: { default: { from: '2026-10-01', to: '2026-10-05' } },
      events: { change: [{ type: 'run', runnable: 'list' }] },
    } as any);
    const s = setup(source);
    scope = s.scope;
    await flush();

    expect(s.runtime.components.period).toEqual({
      value: { from: '2026-10-01', to: '2026-10-05' },
      from: '2026-10-01',
      to: '2026-10-05',
    });
    const sent = () => (historyFetches().at(-1)![1] as any).filter;
    expect(sent()).toEqual({ dateFrom: dayStart('2026-10-01'), dateTo: dayEnd('2026-10-05') });

    // clearing the range re-runs it with no dates: every run
    s.runtime.handleComponentEvent(page.components.at(-1)!, 'change', { value: null, from: null, to: null });
    await flush();
    expect(sent()).toEqual({ dateFrom: '', dateTo: '' });

    s.runtime.resetComponent('period');
    expect(s.runtime.components.period.to).toBe('2026-10-05');
  });

  it('a list view item: bindings see item / index, and its events select it and pass it on', async () => {
    const source = makeSource();
    const page = source.pages[0];
    (page.runnables.approve as any).inputs = { invoiceId: '{= item.id =}', note: 'row {{ index }}' };
    const list = {
      id: 'cards',
      type: 'listView',
      name: 'Cards',
      layout: { x: 0, y: 40, w: 12, h: 30 },
      props: { data: [{ id: 7, name: 'Acme' }, { id: 8, name: 'Globex' }] },
      events: {},
    } as any;
    const button = {
      id: 'approveBtn',
      type: 'button',
      name: 'Approve',
      layout: { x: 0, y: 0, w: 3, h: 4 },
      parent: { id: 'cards' },
      props: { label: 'Approve {{ item.name }}' },
      events: { click: [{ type: 'setState', key: 'last', value: '{= item.name =}' }, { type: 'run', runnable: 'approve' }] },
    } as any;
    page.components.push(list, button);
    const s = setup(source);
    scope = s.scope;
    await flush();

    expect(s.runtime.components.cards).toEqual({ selectedItem: null, selectedIndex: null });
    const second = { listId: 'cards', item: { id: 8, name: 'Globex' }, index: 1 };
    expect(s.runtime.resolveProps(button, second).label).toBe('Approve Globex');

    s.runtime.handleComponentEvent(button, 'click', undefined, second);
    await flush();
    expect(s.runtime.components.cards).toEqual({ selectedItem: { id: 8, name: 'Globex' }, selectedIndex: 1 });
    expect(s.runtime.state.last).toBe('Globex');
    expect(runAppRunnable).toHaveBeenCalledWith(
      expect.objectContaining({ runnable: 'approve', inputs: { invoiceId: 8, note: 'row 1' } }),
      expect.any(Function),
      expect.any(String)
    );

    s.runtime.resetComponent('cards');
    expect(s.runtime.components.cards).toEqual({ selectedItem: null, selectedIndex: null });
  });

  it('a run started from one list item keeps only that item busy', async () => {
    const run = deferred<any>();
    vi.mocked(runAppRunnable).mockReturnValueOnce(run.promise);
    const source = makeSource();
    const page = source.pages[0];
    const button = {
      id: 'approveBtn',
      type: 'button',
      name: 'Approve',
      layout: { x: 0, y: 0, w: 3, h: 4 },
      parent: { id: 'cards' },
      props: {},
      events: { click: [{ type: 'run', runnable: 'approve' }] },
    } as any;
    page.components.push(
      { id: 'cards', type: 'listView', name: 'Cards', layout: { x: 0, y: 40, w: 12, h: 30 }, props: { data: [{ id: 1 }, { id: 2 }, { id: 3 }] }, events: {} } as any,
      button
    );
    const s = setup(source);
    scope = s.scope;
    await flush();

    const item = (index: number) => ({ listId: 'cards', item: { id: index + 1 }, index });
    s.runtime.handleComponentEvent(button, 'click', undefined, item(1));
    await flush();

    const st = s.runtime.runnables.approve;
    expect(st.isRunning).toBe(true);
    expect(st.startedFor).toEqual({ listId: 'cards', index: 1 });
    expect([0, 1, 2].map((i) => isRunningFor(st, item(i)))).toEqual([false, true, false]);
    // outside the list (or in another list), the run still shows
    expect(isRunningFor(st)).toBe(true);
    expect(isRunningFor(st, { listId: 'other', item: {}, index: 0 })).toBe(true);

    run.resolve({ pipelineIdentifier: 'p-1', outputs: {} });
    await flush();
    expect(isRunningFor(st, item(1))).toBe(false);

    // a run started any other way keeps every item busy
    vi.mocked(runAppRunnable).mockReturnValueOnce(new Promise(() => {}));
    void s.runtime.run('approve');
    await flush();
    expect(st.startedFor).toBeNull();
    expect([0, 1, 2].map((i) => isRunningFor(st, item(i)))).toEqual([true, true, true]);
  });

  it('a list view can name its item and index (like a forEach loop)', async () => {
    const source = makeSource();
    const page = source.pages[0];
    (page.runnables.approve as any).inputs = { invoiceId: '{= record.id =}', note: 'at {{ position }}' };
    const button = {
      id: 'go',
      type: 'button',
      name: 'Go',
      layout: { x: 0, y: 0, w: 3, h: 4 },
      parent: { id: 'cards' },
      props: { label: '{{ record.name }} #{{ position }}' },
      events: { click: [{ type: 'run', runnable: 'approve' }] },
    } as any;
    page.components.push(
      { id: 'cards', type: 'listView', name: 'Cards', layout: { x: 0, y: 40, w: 12, h: 30 }, props: { data: [], itemName: 'record', indexName: 'position' }, events: {} } as any,
      button
    );
    const s = setup(source);
    scope = s.scope;
    await flush();

    const second = { listId: 'cards', item: { id: 8, name: 'Globex' }, index: 1, itemName: 'record', indexName: 'position' };
    expect(s.runtime.resolveProps(button, second).label).toBe('Globex #1');
    s.runtime.handleComponentEvent(button, 'click', undefined, second);
    await flush();
    expect(runAppRunnable).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: { invoiceId: 8, note: 'at 1' } }),
      expect.any(Function),
      expect.any(String)
    );
  });

  describe('runs started elsewhere (another window, or before navigating back)', () => {
    type Listener = (e: unknown, msg: any) => void;
    let listeners: Listener[] = [];
    const broadcast = (msg: any) => listeners.forEach((l) => l(null, msg));
    const otherRun = {
      correlationId: 'c-other',
      runnable: 'approve',
      pipelineIdentifier: 'p-other',
      startedAt: 1000,
      steps: 2,
      lastStep: 'http.get',
    };

    beforeEach(() => {
      listeners = [];
      (globalThis as any).window = {
        ipcRenderer: {
          on: (_: string, l: Listener) => listeners.push(l),
          off: (_: string, l: Listener) =>
            (listeners = listeners.filter((x) => x !== l)),
        },
      };
    });
    afterEach(() => delete (globalThis as any).window);

    it('shows a run already in progress when the page opens, and blocks a second one', async () => {
      activeRuns = [otherRun];
      const s = setup();
      scope = s.scope;
      await flush();

      expect(invokeCore).toHaveBeenCalledWith('appRunsActive', {
        appIdentifier: 'app-1',
        pageId: 'queue',
      });
      expect(s.runtime.runnables.approve).toMatchObject({
        isRunning: true,
        status: 'running',
        startedAt: 1000,
        steps: 2,
        lastStep: 'http.get',
        pipelineIdentifier: 'p-other',
      });
      expect(await s.runtime.run('approve')).toBe(false);
      expect(runAppRunnable).not.toHaveBeenCalled();
    });

    it('a rangeChange that found a followed run waits for its end, then runs here', async () => {
      activeRuns = [otherRun];
      const source = makeSource();
      const cal = { id: 'cal', type: 'calendar', name: 'C', layout: { x: 0, y: 40, w: 12, h: 40 }, props: {}, events: { rangeChange: [{ type: 'run', runnable: 'approve' }] } } as any;
      source.pages[0].components.push(cal);
      const s = setup(source);
      scope = s.scope;
      await flush();

      s.runtime.handleComponentEvent(cal, 'rangeChange', { from: 'x', to: 'y' });
      await flush();
      expect(runAppRunnable).not.toHaveBeenCalled();

      broadcast({ type: 'end_all', correlationId: 'c-other', data: { pipelineIdentifier: 'p-other', outputs: {}, status: 'completed' } });
      await flush();
      expect(runAppRunnable).toHaveBeenCalledTimes(1);
    });

    it("follows the run to its end without running the starter's onSuccess", async () => {
      activeRuns = [otherRun];
      const s = setup();
      scope = s.scope;
      await flush();

      broadcast({ type: 'action', correlationId: 'c-other', data: { name: 'file.write' } });
      broadcast({ type: 'action', correlationId: 'c-unrelated', data: { name: 'x.y' } });
      expect(s.runtime.runnables.approve).toMatchObject({ steps: 3, lastStep: 'file.write' });

      broadcast({
        type: 'end_all',
        correlationId: 'c-other',
        data: { pipelineIdentifier: 'p-other', outputs: { status: 'approved' }, status: 'completed' },
      });
      expect(s.runtime.runnables.approve).toMatchObject({
        isRunning: false,
        status: 'finished',
        outputs: { status: 'approved' },
      });
      expect(s.runtime.state.status).toBe('pending'); // onSuccess's setState didn't run
      expect(toast.success).not.toHaveBeenCalled();
      expect(historyFetches()).toHaveLength(1); // only the page-load fetch, not onSuccess's
    });

    it('shows a followed run that was canceled as canceled', async () => {
      activeRuns = [otherRun];
      const s = setup();
      scope = s.scope;
      await flush();

      broadcast({
        type: 'end_all',
        correlationId: 'c-other',
        data: { pipelineIdentifier: 'p-other', outputs: {}, status: 'canceled' },
      });
      expect(s.runtime.runnables.approve).toMatchObject({ isRunning: false, status: 'canceled' });
      expect(s.runtime.runnables.approve.lastRunAt).toBeNull();
    });

    it('follows a run another window starts on the same page, including its failure', async () => {
      const s = setup();
      scope = s.scope;
      await flush();
      const app = { appIdentifier: 'app-1', pageId: 'queue', runnable: 'approve' };

      broadcast({
        type: 'start',
        correlationId: 'c-x',
        data: { pipelineIdentifier: 'p-x', app: { ...app, pageId: 'other' } },
      });
      broadcast({
        type: 'start',
        correlationId: 'c-y',
        data: { pipelineIdentifier: 'p-y', app: { ...app, appIdentifier: 'app-2' } },
      });
      expect(s.runtime.runnables.approve.isRunning).toBe(false);

      broadcast({ type: 'start', correlationId: 'c-z', data: { pipelineIdentifier: 'p-z', app } });
      expect(s.runtime.runnables.approve).toMatchObject({
        isRunning: true,
        pipelineIdentifier: 'p-z',
      });

      broadcast({ type: 'action_error', correlationId: 'c-z', data: { name: 'email.send' } });
      broadcast({ type: 'error', correlationId: 'c-z', error: { message: 'smtp down' } });
      expect(s.runtime.runnables.approve).toMatchObject({
        status: 'failed',
        failedStep: 'email.send',
        error: 'smtp down',
      });
      expect(s.runtime.state.lastError).toBeUndefined(); // onError is the starter's
    });

    it('does not count its own run twice (own channel + broadcast)', async () => {
      const pending = deferred<any>();
      let own = '';
      let emit: (e: any) => void = () => {};
      vi.mocked(runAppRunnable).mockImplementation((_p, onEvent, correlationId) => {
        own = correlationId!;
        emit = onEvent!;
        return pending.promise;
      });
      const s = setup();
      scope = s.scope;
      await flush();

      const done = s.runtime.run('approve');
      const app = { appIdentifier: 'app-1', pageId: 'queue', runnable: 'approve' };
      emit({ type: 'start', data: { pipelineIdentifier: 'p-own', app } });
      broadcast({ type: 'start', correlationId: own, data: { pipelineIdentifier: 'p-own', app } });
      emit({ type: 'action', data: { name: 'file.read' } });
      broadcast({ type: 'action', correlationId: own, data: { name: 'file.read' } });

      expect(s.runtime.runnables.approve).toMatchObject({
        steps: 1,
        pipelineIdentifier: 'p-own', // known from the start, not only at the end
      });
      pending.resolve({ pipelineIdentifier: 'p-own', outputs: {} });
      await done;
    });

    it('picks its own run back up after navigating away and back', async () => {
      const pending = deferred<any>();
      let own = '';
      vi.mocked(runAppRunnable).mockImplementation((_p, _onEvent, correlationId) => {
        own = correlationId!;
        return pending.promise;
      });
      const s = setup();
      scope = s.scope;
      await flush();
      void s.runtime.run('approve');

      s.pageId.value = 'other';
      await flush();
      activeRuns = [{ ...otherRun, correlationId: own, steps: 0, lastStep: '' }];
      s.pageId.value = 'queue';
      await flush();
      expect(s.runtime.runnables.approve).toMatchObject({ isRunning: true, status: 'running' });

      // The original request resolving doesn't touch the new page...
      pending.resolve({ pipelineIdentifier: 'p-own', outputs: { status: 'x' } });
      await flush();
      expect(s.runtime.runnables.approve.isRunning).toBe(true);
      // ...its end, seen on the broadcast, does.
      broadcast({
        type: 'end_all',
        correlationId: own,
        data: { pipelineIdentifier: 'p-own', outputs: { status: 'x' } },
      });
      expect(s.runtime.runnables.approve).toMatchObject({ status: 'finished' });
    });

    it('ignores a listed run that ended while the list was on its way', async () => {
      const list = deferred<unknown[]>();
      vi.mocked(invokeCore).mockImplementation(async (channel: string) =>
        channel === 'appRunsActive' ? list.promise : []
      );
      const s = setup();
      scope = s.scope;
      await flush();

      broadcast({ type: 'end_all', correlationId: 'c-other', data: {} });
      list.resolve([otherRun]);
      await flush();
      expect(s.runtime.runnables.approve.isRunning).toBe(false);
    });

    it('knows the request of a run it follows or started, to cancel it', async () => {
      activeRuns = [otherRun];
      const s = setup();
      scope = s.scope;
      await flush();
      expect(s.runtime.runnables.approve.correlationId).toBe('c-other');

      broadcast({ type: 'end_all', correlationId: 'c-other', data: {} });
      let own = '';
      vi.mocked(runAppRunnable).mockImplementation(async (_p, _e, correlationId) => {
        own = correlationId!;
        expect(s.runtime.runnables.approve.correlationId).toBe(own); // set before it starts
        return { pipelineIdentifier: 'p', outputs: {}, status: 'completed' };
      });
      await s.runtime.run('approve');
      expect(own).not.toBe('');
    });

    it('a run waiting for approval that someone cancels shows as canceled', async () => {
      vi.mocked(runAppRunnable).mockResolvedValue({
        pipelineIdentifier: 'p-wait',
        outputs: {},
        status: 'paused',
      });
      const s = setup();
      scope = s.scope;
      await flush();
      await s.runtime.run('approve');
      expect(s.runtime.runnables.approve.status).toBe('paused');

      broadcast({ type: 'end', correlationId: 'x', data: { pipelineIdentifier: 'p-other', status: 'canceled' } });
      expect(s.runtime.runnables.approve.status).toBe('paused');
      broadcast({ type: 'end', correlationId: 'x', data: { pipelineIdentifier: 'p-wait', status: 'canceled' } });
      expect(s.runtime.runnables.approve.status).toBe('canceled');
      expect(s.runtime.runnables.approve.log.at(-1)?.kind).toBe('canceled');
    });

    it('stops listening when the runtime is disposed', async () => {
      const s = setup();
      await flush();
      expect(listeners).toHaveLength(1);
      s.scope.stop();
      expect(listeners).toHaveLength(0);
    });
  });

  describe('inputs, forms and dialogs', () => {
    function formSource(): AppSource {
      const source = makeSource();
      source.state = { region: 'EU', status: 'pending' };
      source.pages[0].components.push(
        {
          id: 'customerForm',
          type: 'form',
          name: 'Form',
          layout: { x: 0, y: 4, w: 6, h: 4 },
          props: {
            fields: [
              { name: 'email', type: 'text' },
              { name: 'count', type: 'number', default: '5' },
              { name: 'region', type: 'select', default: '{= state.region =}' },
              { name: 'tags', type: 'multiselect' },
              { name: 'agree', type: 'checkbox', default: 'true' },
            ],
          },
          events: {},
        } as any,
        {
          id: 'search',
          type: 'input',
          name: 'Search',
          layout: { x: 6, y: 4, w: 6, h: 1 },
          props: { inputType: 'text', default: 'abc' },
          events: {},
        } as any
      );
      return source;
    }

    it('starts inputs and forms at their (bound) defaults, and reset restores them', async () => {
      const s = setup(formSource());
      scope = s.scope;
      await flush();

      expect(s.runtime.components.customerForm).toEqual({
        values: { email: '', count: 5, region: 'EU', tags: [], agree: true },
        errors: {},
      });
      expect(s.runtime.components.search).toEqual({ value: 'abc' });
      expect(s.runtime.components.invoiceTable).toEqual(NO_TABLE_EDITS);

      s.runtime.setComponentState('customerForm', {
        values: {
          email: 'x@y.z',
          count: 1,
          region: 'US',
          tags: ['a'],
          agree: false,
        },
      });
      s.runtime.setComponentState('search', { value: 'zzz' });
      await s.runtime.runActions([
        { type: 'reset', component: 'customerForm' },
        { type: 'reset', component: 'search' },
      ]);

      expect((s.runtime.components.customerForm as any).values.email).toBe('');
      expect(s.runtime.components.search).toEqual({ value: 'abc' });
    });

    it('a form with bound fields starts at their defaults and follows when they change', async () => {
      const source = makeSource();
      source.state = {
        fields: [
          { name: 'title', type: 'text', default: 'Hello' },
          { name: 'body', type: 'textarea', default: '<h1>{{ node.title }}</h1>' },
          { name: 'count', type: 'number', default: '3' },
          { name: 'bad', type: 'nope' },
          'not a field',
        ],
      };
      source.pages[0].components.push({
        id: 'nodeForm',
        type: 'form',
        name: 'Node',
        layout: { x: 0, y: 4, w: 6, h: 4 },
        props: { fields: '{= state.fields =}' },
        events: {},
      } as any);
      const s = setup(source);
      scope = s.scope;
      await flush();

      // Invalid entries are left out; a default with {{ }} in it is kept as written.
      expect(s.runtime.components.nodeForm).toEqual({
        values: { title: 'Hello', body: '<h1>{{ node.title }}</h1>', count: 3 },
        errors: {},
      });

      s.runtime.setComponentState('nodeForm', { values: { title: 'Typed', body: 'x', count: 9 } });
      // title unchanged (keeps what was typed); count's default changed; tags is new; body is gone.
      await s.runtime.runActions([
        {
          type: 'setState',
          key: 'fields',
          value: [
            { name: 'title', type: 'text', default: 'Hello' },
            { name: 'count', type: 'number', default: '4' },
            { name: 'tags', type: 'multiselect' },
          ],
        },
      ]);
      await flush();
      expect((s.runtime.components.nodeForm as any).values).toEqual({ title: 'Typed', count: 4, tags: [] });

      // reset starts every field again at its default.
      await s.runtime.runActions([{ type: 'reset', component: 'nodeForm' }]);
      expect((s.runtime.components.nodeForm as any).values).toEqual({ title: 'Hello', count: 4, tags: [] });
    });

    it('a form whose bound fields aren\'t known yet has no values', async () => {
      const source = makeSource();
      source.pages[0].components.push({
        id: 'nodeForm',
        type: 'form',
        name: 'Node',
        layout: { x: 0, y: 4, w: 6, h: 4 },
        props: { fields: '{= runnables.approve.outputs.fields =}' },
        events: {},
      } as any);
      const s = setup(source);
      scope = s.scope;
      await flush();
      expect(s.runtime.components.nodeForm).toEqual({ values: {}, errors: {} });
    });

    it('a paged table starts at page 1 and pageChange updates its page', async () => {
      const source = makeSource();
      (source.pages[0].components[0].props as any).pageSize = 10;
      const s = setup(source);
      scope = s.scope;
      await flush();

      expect(s.runtime.components.invoiceTable).toEqual({
        page: 1,
        pageSize: 10,
        ...NO_TABLE_EDITS,
      });
      s.runtime.handleComponentEvent(
        source.pages[0].components[0],
        'pageChange',
        { page: 3 }
      );
      expect(s.runtime.components.invoiceTable).toMatchObject({
        page: 3,
        pageSize: 10,
      });
    });

    it('reset drops a table’s unsaved edits and checked rows, but keeps its page and clicked row', async () => {
      const source = makeSource();
      (source.pages[0].components[0].props as any).pageSize = 10;
      const s = setup(source);
      scope = s.scope;
      await flush();

      s.runtime.setComponentState('invoiceTable', {
        page: 2,
        selectedRow: { id: 7 },
        edits: { '=7': { amount: 5 } },
        added: [],
        deleted: ['=8'],
        changes: { added: [], updated: [{ id: 7, amount: 5 }], deleted: [{ id: 8 }] },
        hasChanges: true,
        selectedKeys: ['=7', '=9'],
        selectedRows: [{ id: 7 }, { id: 9 }],
      });
      s.runtime.resetComponent('invoiceTable');

      expect(s.runtime.components.invoiceTable).toEqual({
        page: 2,
        pageSize: 10,
        selectedRow: { id: 7 },
        ...NO_TABLE_EDITS,
      });
    });

    it('openModal continues the chain when the dialog is closed, and stops when dismissed', async () => {
      const opened: Array<{
        page: string;
        params: unknown;
        resolve: (ok: boolean) => void;
      }> = [];
      const host = {
        navigate: vi.fn(),
        openModal: (page: string, params: Record<string, unknown>) =>
          new Promise<boolean>((resolve) =>
            opened.push({ page, params, resolve })
          ),
        closeModal: vi.fn(),
      };
      const scope2 = effectScope();
      const runtime = scope2.run(() =>
        useAppRuntime({
          appIdentifier: ref('app-1'),
          source: ref(makeSource()),
          pageId: ref('queue'),
          host,
        })
      )!;
      scope = scope2;
      await flush();

      const chain = () =>
        runtime.runActions([
          {
            type: 'openModal',
            page: 'other',
            params: { id: '{= state.status =}' },
          },
          { type: 'setState', key: 'afterModal', value: true },
        ]);

      const first = chain();
      await flush();
      expect(opened[0]).toMatchObject({
        page: 'other',
        params: { id: 'pending' },
      });
      opened[0].resolve(false); // dismissed
      await first;
      expect(runtime.state.afterModal).toBeUndefined();

      const second = chain();
      await flush();
      opened[1].resolve(true); // closed with closeModal
      await second;
      expect(runtime.state.afterModal).toBe(true);
    });

    it('openModal hands the host how to show the page (drawer, side, size)', async () => {
      const openModal = vi.fn(async () => true);
      const scope2 = effectScope();
      const runtime = scope2.run(() =>
        useAppRuntime({
          appIdentifier: ref('app-1'),
          source: ref(makeSource()),
          pageId: ref('queue'),
          host: { navigate: vi.fn(), openModal, closeModal: vi.fn() },
        })
      )!;
      scope = scope2;
      await flush();
      await runtime.runActions([{ type: 'openModal', page: 'other', display: 'drawer', side: 'left', size: 'lg' }]);
      await runtime.runActions([{ type: 'openModal', page: 'other' }]);
      expect(openModal.mock.calls).toEqual([
        ['other', {}, { display: 'drawer', side: 'left', size: 'lg' }],
        ['other', {}, { display: undefined, side: undefined, size: undefined }],
      ]);
    });

    it('openUrl / openFile ask the main process; a refusal says why and stops the list', async () => {
      const invoke = vi.fn(async (channel: string, arg: any) => {
        if (channel === 'app:open-url') return { ok: true };
        if (arg.path.endsWith('.command')) return { ok: false, error: 'program' };
        if (arg.mode === 'save') return { ok: true, canceled: true };
        return { ok: true };
      });
      (globalThis as any).window = { ipcRenderer: { invoke, on: vi.fn(), off: vi.fn() } };
      onTestFinished(() => delete (globalThis as any).window);
      const s = setup();
      scope = s.scope;
      await flush();
      const then = { type: 'setState', key: 'after', value: true } as const;

      await s.runtime.runActions([{ type: 'openUrl', url: 'https://example.com/{{ state.status }}' }, then]);
      expect(invoke).toHaveBeenLastCalledWith('app:open-url', { url: 'https://example.com/pending' });
      expect(s.runtime.state.after).toBe(true);

      s.runtime.state.after = false;
      await s.runtime.runActions([{ type: 'openFile', path: '/x/run.command', mode: 'open' }, then]);
      expect(toast.error).toHaveBeenCalledWith('apps.open.errors.program');
      expect(s.runtime.state.after).toBe(false);

      await s.runtime.runActions([{ type: 'openFile', path: '/x/a.pdf', mode: 'save' }, then]);
      // The app asking goes along: a trusted app may open files outside ~/Tipeline.
      expect(invoke).toHaveBeenLastCalledWith('app:open-file', { path: '/x/a.pdf', mode: 'save', appIdentifier: 'app-1' });
      expect(s.runtime.state.after).toBe(false); // "Save as…" dismissed

      await s.runtime.runActions([{ type: 'openFile', path: '/x/a.pdf', mode: 'reveal' }, then]);
      expect(s.runtime.state.after).toBe(true);

      // An empty path (a binding to a value not there yet) never reaches the main process.
      const calls = invoke.mock.calls.length;
      s.runtime.state.after = false;
      await s.runtime.runActions([{ type: 'openFile', path: '{{ state.missing }}', mode: 'open' }, then]);
      expect(invoke.mock.calls.length).toBe(calls);
      expect(toast.error).toHaveBeenLastCalledWith('apps.open.errors.noPath');
      expect(s.runtime.state.after).toBe(false);
    });

    it('closeModal and navigate go through the host and end the action list', async () => {
      const host = {
        navigate: vi.fn(),
        openModal: vi.fn(),
        closeModal: vi.fn(),
      };
      const scope2 = effectScope();
      const runtime = scope2.run(() =>
        useAppRuntime({
          appIdentifier: ref('app-1'),
          source: ref(makeSource()),
          pageId: ref('queue'),
          host,
        })
      )!;
      scope = scope2;
      await flush();

      await runtime.runActions([
        { type: 'closeModal' },
        { type: 'setState', key: 'x', value: 1 },
      ]);
      await runtime.runActions([
        { type: 'navigate', page: 'other', params: { a: 1 } },
      ]);

      expect(host.closeModal).toHaveBeenCalledTimes(1);
      expect(runtime.state.x).toBeUndefined();
      expect(host.navigate).toHaveBeenCalledWith('other', { a: 1 });
    });

    it('shares app state that is passed in instead of seeding its own', async () => {
      const shared = reactive<Record<string, unknown>>({ fromParent: 1 });
      const scope2 = effectScope();
      const runtime = scope2.run(() =>
        useAppRuntime({
          appIdentifier: ref('app-1'),
          source: ref(makeSource()),
          pageId: ref('queue'),
          state: shared,
        })
      )!;
      scope = scope2;
      await flush();

      expect(runtime.state).toBe(shared);
      expect(shared).toEqual({ fromParent: 1, visited: true });
    });
  });
});
