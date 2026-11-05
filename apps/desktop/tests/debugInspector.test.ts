// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/i18n';
import { MAIN_TRACK, useDebugTimeline } from '@/composables/useDebugTimeline';
import DebugStepInspector from '@/components/task/DebugStepInspector.vue';
import DebugStepList from '@/components/task/DebugStepList.vue';
import DebugVariablesPanel from '@/components/task/DebugVariablesPanel.vue';
import TaskPipelineDebugControls from '@/components/task/TaskPipelineDebugControls.vue';
import RunStepDetail from '@/components/run/RunStepDetail.vue';
import { flattenSteps, resultSummary, stepResult } from '@/utils/runSteps';
import type { StreamEvent } from '@/store/stream';

const PIPE = 'pipe1';
let clock = 1_000;

function event(type: StreamEvent['type'], data: any = {}, pipelineIdentifier = PIPE): StreamEvent {
  clock += 10;
  return { type, correlationId: 'c1', taskIdentifier: 'task1', pipelineIdentifier, timestamp: clock, data };
}

// The workflow as the debugger has it: canvas flags included.
const workflow = () => [
  { identifier: 'fetch', group: 'http', name: 'request', params: { url: '{{ url }}' } },
  {
    identifier: 'loop',
    group: 'flow',
    name: 'forEachLoop',
    params: { actions: [{ identifier: 'save', group: 'database', name: 'query', params: { sql: 'INSERT' } }] },
  },
  { identifier: 'off', group: 'file', name: 'write', disabled: true, params: {} },
  { identifier: 'close', group: 'database', name: 'close', finished: true, params: {} },
];

function setup() {
  const source = ref<any[]>(workflow());
  const subtasks = ref<{ pipelineId: string; taskId: string; actions: any[] }[]>([]);
  const events = ref<StreamEvent[]>([]);
  const isPaused = ref(false);
  const isRunning = ref(true);
  const timeline = useDebugTimeline({ taskId: 'task1', source, subtasks, events, isPaused, isRunning });
  const main = () => timeline.tracks.value[MAIN_TRACK];
  const step = (id: string, track = MAIN_TRACK) =>
    flattenSteps(timeline.tracks.value[track].actions).find((r) => r.key === id)?.action;
  return { source, subtasks, events, isPaused, isRunning, main, step, ...timeline };
}

describe('resultSummary and stepResult', () => {
  it('says what came back in a few words', () => {
    expect(resultSummary({ status: 200, data: [1, 2, 3] })).toBe('200 · 3 items');
    expect(resultSummary([1])).toBe('1 item');
    expect(resultSummary({ changes: 1 })).toBe('changes: 1');
    expect(resultSummary({ a: 1, b: 2 })).toBe('2 keys');
    expect(resultSummary('x'.repeat(50))).toBe('x'.repeat(40) + '…');
    expect(resultSummary(null)).toBe('');
  });

  it('says how far a loop got, or that a step failed or never ran', () => {
    const loop = (status: string, iterations: number) => ({
      status,
      params: { actions: [{ status: 'completed', iterations: Array.from({ length: iterations }, () => ({})) }] },
    });
    expect(stepResult(loop('running', 3), false)).toEqual({ key: 'pass', count: 3, tone: 'active' });
    expect(stepResult(loop('failed', 7), true)).toEqual({ key: 'failedOnPass', count: 7, tone: 'failed' });
    expect(stepResult(loop('completed', 12), true)).toEqual({ key: 'passes', count: 12, tone: 'done' });
    expect(stepResult({ status: 'completed', result: { status: 200, data: [] } }, false)).toEqual({ text: '200 · 0 items', tone: 'done' });
    expect(stepResult({ status: 'pending' }, true)).toEqual({ key: 'notRun', tone: 'muted' });
    expect(stepResult({ status: 'pending' }, false)).toBeNull();
    expect(stepResult({ status: 'skipped' }, true)).toBeNull();
  });
});

describe('useDebugTimeline', () => {
  it('starts from the workflow, keeping disabled steps as skipped', () => {
    const { main, step } = setup();
    expect(main().actions.map((a: any) => a.identifier)).toEqual(['fetch', 'loop', 'off', 'close']);
    expect(step('fetch').status).toBe('pending');
    expect(step('off').status).toBe('skipped');
    expect(step('close').finished).toBeUndefined();
  });

  it('fills in each step from its events and follows the last one', async () => {
    const { events, main, step, selected } = setup();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', params: { url: 'https://x.test' }, result: { status: 200, data: [] } }));
    await nextTick();

    expect(main().pipelineId).toBe(PIPE);
    expect(step('fetch').status).toBe('completed');
    expect(step('fetch').params.url).toBe('https://x.test');
    expect(selected.value).toEqual({ track: MAIN_TRACK, identifier: 'fetch' });
    expect(step('loop').status).toBe('running');
  });

  it('runs past a disabled step', async () => {
    const { events, step } = setup();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', result: 1 }));
    events.value.push(event('action', { identifier: 'save', result: 1 }));
    events.value.push(event('action', { identifier: 'loop', result: [] }));
    await nextTick();
    expect(step('off').status).toBe('skipped');
    expect(step('close').status).toBe('running');
  });

  it('shows a started loop as running, and the step inside it the run is on', async () => {
    const { source, events, isPaused, step } = setup();
    source.value = [
      { identifier: 'fetch', group: 'http', name: 'request', params: {} },
      {
        identifier: 'loop',
        group: 'flow',
        name: 'forEachLoop',
        params: {
          actions: [
            { identifier: 'save', group: 'database', name: 'query', params: {} },
            { identifier: 'send', group: 'email', name: 'send', params: {} },
          ],
        },
      },
    ];
    await nextTick();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', result: 1 }));
    events.value.push(event('action', { identifier: 'save', result: 1 }));
    await nextTick();
    expect(step('loop').status).toBe('running');
    expect(step('send').status).toBe('running');

    // Core pauses before "send": the loop is still running, "send" runs next.
    events.value.push(event('paused', { identifier: 'send', params: { to: 'sam@acme.com' } }));
    isPaused.value = true;
    await nextTick();
    expect(step('loop').status).toBe('running');
    expect(step('loop').next).toBeUndefined();
    expect(step('send').next).toBe(true);
    expect(step('send').status).toBe('pending');
    expect(step('send').nextParams).toEqual({ to: 'sam@acme.com' });

    // Next pass: "save" again, then "send" is next once more.
    isPaused.value = false;
    events.value.push(event('action', { identifier: 'send', result: 1 }));
    await nextTick();
    events.value.push(event('action', { identifier: 'save', result: 2 }));
    await nextTick();
    events.value.push(event('paused', { identifier: 'send', params: {} }));
    isPaused.value = true;
    await nextTick();
    expect(step('send').next).toBe(true);
    expect(step('send').status).toBe('pending');
    expect(step('save').iterations).toHaveLength(2);
  });

  it('marks a loop failed when a step inside it failed', async () => {
    const { events, step } = setup();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', result: 1 }));
    await nextTick();
    events.value.push(event('action_error', { identifier: 'save', error: 'boom' }));
    await nextTick();
    events.value.push(event('error', {}, ''));
    await nextTick();
    expect(step('save').status).toBe('failed');
    expect(step('loop').status).toBe('failed');
  });

  it('keeps a sub-workflow’s steps in a list of their own', async () => {
    const { events, subtasks, step, tracks, selected } = setup();
    events.value.push(event('start'));
    events.value.push(event('start', {}, 'sub-pipe'));
    subtasks.value.push({ pipelineId: 'sub-pipe', taskId: 'child', actions: [{ identifier: 'fetch', group: 'string', name: 'trim', params: {} }] });
    await nextTick();
    events.value.push(event('action', { identifier: 'fetch', result: 'sub' }, 'sub-pipe'));
    await nextTick();

    expect(tracks.value['sub-pipe'].taskId).toBe('child');
    expect(step('fetch', 'sub-pipe').result).toBe('sub');
    // The workflow's own step of the same name is untouched.
    expect(step('fetch').result).toBeUndefined();
    expect(selected.value).toEqual({ track: 'sub-pipe', identifier: 'fetch' });
  });

  it('marks the step that runs next while paused, and opens the inspector', async () => {
    const { events, isPaused, step, inspectorOpen } = setup();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', result: 1 }));
    events.value.push(event('paused', { identifier: 'loop', params: {} }));
    isPaused.value = true;
    await nextTick();

    // The loop hasn't started yet: it's the step that runs next.
    expect(step('loop').next).toBe(true);
    expect(step('loop').status).toBe('pending');
    expect(inspectorOpen.value).toBe(true);

    isPaused.value = false;
    await nextTick();
    expect(step('loop').status).toBe('running');
    expect(step('loop').next).toBeUndefined();
  });

  it('stays closed on pause once closed by hand, but a failure opens it', async () => {
    const { events, isPaused, inspectorOpen, closeInspector, selectedStep } = setup();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', result: 1 }));
    isPaused.value = true;
    await nextTick();
    closeInspector();

    isPaused.value = false;
    events.value.push(event('action', { identifier: 'save', result: 1 }));
    await nextTick();
    isPaused.value = true;
    await nextTick();
    expect(inspectorOpen.value).toBe(false);

    isPaused.value = false;
    events.value.push(event('action_error', { identifier: 'save', error: 'UNIQUE constraint failed' }));
    await nextTick();
    expect(inspectorOpen.value).toBe(true);
    expect(selectedStep.value.identifier).toBe('save');
    expect(selectedStep.value.status).toBe('failed');
  });

  it('starts over for a new run', async () => {
    const { events, step, inspectorOpen, source } = setup();
    events.value.push(event('start'));
    events.value.push(event('action_error', { identifier: 'fetch', error: 'boom' }));
    await nextTick();
    expect(step('fetch').status).toBe('failed');

    source.value = workflow();
    events.value = [];
    await nextTick();
    events.value.push(event('start', {}, 'pipe2'));
    await nextTick();
    expect(step('fetch').status).toBe('running');
    expect(step('fetch').error).toBeUndefined();
    expect(inspectorOpen.value).toBe(false);
  });

  it('selects a clicked step only when the list has it', () => {
    const { select, selected, inspectorOpen } = setup();
    select(MAIN_TRACK, 'nope');
    expect(inspectorOpen.value).toBe(false);
    select(MAIN_TRACK, 'save');
    expect(selected.value).toEqual({ track: MAIN_TRACK, identifier: 'save' });
    expect(inspectorOpen.value).toBe(true);
  });
});

describe('useDebugTimeline: variables and progress', () => {
  it('keeps each variable’s history and what the last step changed', async () => {
    const { events, variableHistory, lastChanged } = setup();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', changedVariables: [{ name: 'count', value: 1 }] }));
    await nextTick();
    events.value.push(event('action', { identifier: 'save', changedVariables: [{ name: 'count', value: 2 }, { name: 'last', value: 'a' }] }));
    await nextTick();
    expect(variableHistory.value.count.map((c) => c.value)).toEqual([1, 2]);
    expect(variableHistory.value.count[1].step?.identifier).toBe('save');
    expect([...lastChanged.value]).toEqual(['count', 'last']);
  });

  it('says where the run is: paused at a step in a loop, then failed', async () => {
    const { events, isPaused, progress } = setup();
    expect(progress.value.state).toBe('idle');
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', result: 1 }));
    await nextTick();
    events.value.push(event('action', { identifier: 'save', result: 1 }));
    events.value.push(event('paused', { identifier: 'close', params: {} }));
    isPaused.value = true;
    await nextTick();
    // Rows: fetch 1, loop 2, save 3, off 4, close 5 — paused before "close".
    expect(progress.value.state).toBe('paused');
    expect(progress.value.total).toBe(5);
    expect(progress.value.step?.number).toBe(5);

    isPaused.value = false;
    events.value.push(event('action_error', { identifier: 'save', error: 'boom' }));
    await nextTick();
    events.value.push(event('error', {}, ''));
    await nextTick();
    expect(progress.value.state).toBe('failed');
    expect(progress.value.step?.number).toBe(3);
  });

  it('names the step a paused run waits at inside a loop, and the pass', async () => {
    const { source, events, isPaused, progress } = setup();
    source.value = [
      { identifier: 'loop', group: 'flow', name: 'forEachLoop', params: { actions: [
        { identifier: 'save', group: 'database', name: 'query', params: {} },
        { identifier: 'send', group: 'email', name: 'send', params: {} },
      ] } },
    ];
    await nextTick();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'save', result: 1 }));
    events.value.push(event('paused', { identifier: 'send', params: {} }));
    isPaused.value = true;
    await nextTick();
    expect(progress.value.step?.action.identifier).toBe('send');
    expect(progress.value.around?.action.identifier).toBe('loop');
    expect(progress.value.around?.pass).toBe(1);
  });

  it('notes the variable a step saved its output to', async () => {
    const { events, step } = setup();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', result: 1, destination: 'orders' }));
    await nextTick();
    expect(step('fetch').destination).toBe('orders');
  });
});

describe('useDebugTimeline: commands', () => {
  it('waits at a failed step until the debugger decides', async () => {
    const { events, isPaused, progress, step } = setup();
    events.value.push(event('start'));
    events.value.push(event('action_error', { identifier: 'fetch', error: 'boom' }));
    events.value.push(event('paused', { identifier: 'fetch', failed: true, error: 'boom', params: {} }));
    isPaused.value = true;
    await nextTick();
    expect(progress.value.state).toBe('waiting');
    expect(progress.value.step?.number).toBe(1);
    expect(step('fetch').waiting).toBe(true);

    // Run it again: it works this time.
    isPaused.value = false;
    events.value.push(event('action', { identifier: 'fetch', result: 1 }));
    await nextTick();
    expect(step('fetch').status).toBe('completed');
    expect(step('fetch').waiting).toBeUndefined();
    expect(progress.value.state).toBe('running');
  });

  it('holds the branch around a failed step while it waits, then lets it run again', async () => {
    const { source, events, isPaused, step } = setup();
    source.value = [
      {
        identifier: 'branch',
        group: 'flow',
        name: 'ifConditional',
        params: { actions: [{ identifier: 'send', group: 'email', name: 'send', params: {} }] },
      },
    ];
    await nextTick();
    events.value.push(event('start'));
    events.value.push(event('action_error', { identifier: 'send', error: 'boom' }));
    events.value.push(event('paused', { identifier: 'send', failed: true, error: 'boom', params: {} }));
    isPaused.value = true;
    await nextTick();
    expect(step('branch').status).toBe('running');
    expect(step('branch').held).toBe(true);
    expect(step('send').held).toBeUndefined();

    const list = mount(DebugStepList, {
      props: { ended: false, actions: [step('branch')] },
      global: { plugins: [i18n] },
    });
    const dot = list.find('[data-status="running"]');
    expect(dot.attributes('title')).toBe('paused');
    expect(dot.find('.animate-spin').exists()).toBe(false);

    isPaused.value = false;
    events.value.push(event('action', { identifier: 'send', result: true }));
    await nextTick();
    expect(step('branch').held).toBeUndefined();
    await list.setProps({ actions: [{ ...step('branch') }] });
    expect(list.find('[data-status="running"] .animate-spin').exists()).toBe(true);
  });

  it('shows a step left out as skipped, and the run goes past it', async () => {
    const { events, step } = setup();
    events.value.push(event('start'));
    events.value.push(event('action', { identifier: 'fetch', skipped: true, result: null }));
    await nextTick();
    expect(step('fetch').status).toBe('skipped');
    expect(step('loop').status).toBe('running');
  });

  it('keeps a value changed by hand in the variable’s history', async () => {
    const { events, variableHistory } = setup();
    events.value.push(event('start'));
    events.value.push(event('paused', { identifier: 'fetch', params: {}, changedVariables: [{ name: 'who', value: 'Ana' }] }));
    await nextTick();
    expect(variableHistory.value.who).toEqual([expect.objectContaining({ value: 'Ana', manual: true, step: null })]);
  });
});

describe('DebugStepList', () => {
  function mountList(props: Record<string, unknown>) {
    return mount(DebugStepList, { props: { ended: false, ...props }, global: { plugins: [i18n] } });
  }
  const steps = () => [
    { identifier: 'a', group: 'http', name: 'request', status: 'completed', comment: 'Get new orders', result: { status: 200, data: [1, 2] }, params: {} },
    { identifier: 'b', group: 'array', name: 'filter', status: 'failed', error: 'boom', params: {} },
    { identifier: 'c', group: 'file', name: 'write', status: 'skipped', params: {} },
    { identifier: 'd', group: 'email', name: 'send', status: 'pending', next: true, params: {} },
  ];

  it('shows row numbers, names, what each step did, and the picked row', async () => {
    const wrapper = mountList({ actions: steps(), selectedKey: 'a' });
    const first = wrapper.find('[data-step="a"]');
    expect(first.text()).toContain('Get new orders');
    expect(first.text()).toContain('http.request');
    expect(first.find('[data-testid="debug-step-result"]').text()).toBe('200 · 2 items');
    expect(first.find('[data-testid="debug-step-select"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-step="b"] [data-testid="debug-step-result"]').text()).toBe('failed');
    expect(wrapper.find('[data-step="c"]').text()).toMatch(/^3/);
    expect(wrapper.find('[data-step="c"]').text()).toContain('skipped');
    expect(wrapper.find('[data-step="d"]').text()).toContain('next');

    await wrapper.find('[data-step="b"] [data-testid="debug-step-select"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['b']]);
    // No breakpoints given (a sub-workflow's list): no dots to click.
    expect(wrapper.find('[data-testid="debug-breakpoint"]').exists()).toBe(false);
  });

  it('toggles a breakpoint without picking the row', async () => {
    const wrapper = mountList({ actions: steps(), breakpoints: ['c'] });
    expect(wrapper.find('[data-step="c"] [data-testid="debug-breakpoint"]').attributes('aria-pressed')).toBe('true');
    await wrapper.find('[data-step="a"] [data-testid="debug-breakpoint"]').trigger('click');
    expect(wrapper.emitted('toggleBreakpoint')).toEqual([['a']]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});

describe('DebugVariablesPanel', () => {
  function mountPanel(props: Record<string, unknown> = {}) {
    return mount(DebugVariablesPanel, {
      props: {
        variables: [
          { name: 'count', type: 'number', value: 3 },
          { name: 'orders', type: 'array', value: [{ id: 1 }, { id: 2 }] },
          { name: 'token', type: 'secret', value: 'shh' },
        ],
        initial: { count: 0, orders: [] },
        history: {
          count: [
            { value: 2, timestamp: 1, step: { identifier: 'a', group: 'math', name: 'add', comment: 'Add one' } },
            { value: 3, timestamp: 2, step: { identifier: 'b', group: 'math', name: 'add', comment: 'Add again' } },
          ],
        },
        lastChanged: new Set(['count']),
        taskId: `t-${Math.random()}`,
        ...props,
      },
      global: { plugins: [i18n] },
    });
  }

  it('marks what the last step changed and what it was', async () => {
    const wrapper = mountPanel();
    expect(wrapper.find('[data-variable="count"] [data-testid="debug-variable-was"]').text()).toBe('was 2');
    expect(wrapper.find('[data-variable="orders"]').text()).toContain('[ 2 items ]');
    expect(wrapper.find('[data-variable="token"]').text()).not.toContain('shh');

    await wrapper.find('[data-testid="debug-variables-changed"]').trigger('click');
    expect(wrapper.findAll('[data-variable]').map((w) => w.attributes('data-variable'))).toEqual(['count']);
  });

  it('opens a variable with the step that set it and its history', async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-variable="count"] button').trigger('click');
    const opened = wrapper.find('[data-variable="count"]');
    expect(opened.text()).toContain('set by Add again');
    expect(opened.find('[data-testid="debug-variable-history"]').text()).toContain('Add one');

    await wrapper.find('[data-variable="orders"] button').trigger('click');
    expect(wrapper.find('[data-variable="orders"] [data-testid="json-tree"]').exists()).toBe(true);
  });

  it('changes a value while paused, as the variable’s type', async () => {
    const wrapper = mountPanel({ canEdit: true });
    await wrapper.find('[data-variable="count"] button').trigger('click');
    await wrapper.find('[data-variable="count"] [data-testid="debug-variable-change"]').trigger('click');
    const box = wrapper.find('[data-variable="count"] textarea');
    await box.setValue('nope');
    await wrapper.find('[data-testid="debug-variable-save"]').trigger('click');
    expect(wrapper.text()).toContain('isn’t a valid number');
    await box.setValue('42');
    await wrapper.find('[data-testid="debug-variable-save"]').trigger('click');
    expect(wrapper.emitted('setVariable')).toEqual([['count', 42]]);
  });

  it('has no Change value when the run isn’t paused', async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-variable="count"] button').trigger('click');
    expect(wrapper.find('[data-testid="debug-variable-change"]').exists()).toBe(false);
  });

  it('pins a variable to the top', async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-variable="orders"] button').trigger('click');
    const pin = wrapper.find('[data-variable="orders"]').findAll('button').find((b) => b.text() === 'Pin')!;
    await pin.trigger('click');
    expect(wrapper.findAll('[data-variable]')[0].attributes('data-variable')).toBe('orders');
    expect(wrapper.text()).toContain('Pinned');
  });
});

describe('RunStepDetail in the debugger', () => {
  it('shows an object output as a tree, and where it was saved', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    const wrapper = mount(RunStepDetail, {
      props: { action: { identifier: 'a', group: 'http', name: 'request', status: 'completed', destination: 'orders', result: { status: 200 }, params: {} }, ended: true, tree: true },
      global: { plugins: [i18n, router] },
    });
    expect(wrapper.find('[data-testid="json-tree"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('→ saved to orders');
  });
});

describe('DebugStepInspector', () => {
  function mountWith(props: Record<string, unknown>) {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    return mount(DebugStepInspector, { props, global: { plugins: [i18n, router] } });
  }

  it('shows a failed step’s error and input', () => {
    const wrapper = mountWith({
      action: { identifier: 's', group: 'database', name: 'query', status: 'failed', error: 'UNIQUE constraint failed', params: { sql: 'INSERT INTO orders' } },
      ended: true,
      canOpenRun: true,
    });
    expect(wrapper.find('[data-status="failed"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('UNIQUE constraint failed');
    expect(wrapper.text()).toContain('INSERT INTO orders');
    expect(wrapper.text()).toContain('Open run detail');
  });

  it('says which step runs next', () => {
    const wrapper = mountWith({
      action: { identifier: 's', group: 'email', name: 'send', status: 'pending', next: true, params: {} },
      ended: false,
      canOpenRun: false,
    });
    expect(wrapper.find('[data-status="next"]').text()).toBe('Runs next');
    expect(wrapper.text()).not.toContain('Open run detail');
  });

  it('offers to run or skip the step the run waits at, with its filled-in input', async () => {
    const wrapper = mountWith({
      action: { identifier: 's', group: 'email', name: 'send', status: 'pending', next: true, nextParams: { to: 'sam@acme.com', cc: '' }, params: { to: '{{ order.email }}' } },
      rawParams: { to: '{{ order.email }}', cc: '{{ order.contact.email }}' },
      ended: false,
      canOpenRun: false,
      canEdit: true,
    });
    expect(wrapper.text()).toContain('sam@acme.com');
    expect(wrapper.text()).not.toContain('{{ order.email }}');
    expect(wrapper.find('[data-testid="debug-empty-input"]').text()).toContain('cc came out empty');
    await wrapper.find('[data-testid="debug-run-step"]').trigger('click');
    await wrapper.find('[data-testid="debug-skip-step"]').trigger('click');
    await wrapper.find('[data-testid="debug-edit-step"]').trigger('click');
    expect(Object.keys(wrapper.emitted())).toEqual(expect.arrayContaining(['run', 'skip', 'edit']));
  });

  it('offers to run a failed step again, or skip it', async () => {
    const wrapper = mountWith({
      action: { identifier: 's', group: 'database', name: 'query', status: 'failed', waiting: true, error: 'boom', params: {} },
      ended: false,
      canOpenRun: true,
    });
    await wrapper.find('[data-testid="debug-retry-step"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
    expect(wrapper.find('[data-testid="debug-edit-step"]').exists()).toBe(false);
  });

  it('says a disabled step is skipped', () => {
    const wrapper = mountWith({
      action: { identifier: 's', group: 'file', name: 'write', status: 'skipped', params: {} },
      ended: true,
      canOpenRun: true,
    });
    expect(wrapper.find('[data-status="skipped"]').text()).toBe('Skipped');
    expect(wrapper.text()).toContain('Disabled: this step is skipped.');
  });

  it('says a pending step never ran once the run is over', () => {
    const wrapper = mountWith({
      action: { identifier: 's', group: 'email', name: 'send', status: 'pending', params: {} },
      ended: true,
      canOpenRun: true,
    });
    expect(wrapper.find('[data-status="notRun"]').exists()).toBe(true);
  });
});

describe('useDebugTimeline: sub-workflows in the step list', () => {
  // The workflow calls "enrich" at step 2; "enrich" has two steps.
  const caller = () => [
    { identifier: 'fetch', group: 'http', name: 'request', params: {} },
    { identifier: 'call', group: 'subtask', name: 'exec', params: { identifier: 'enrich' } },
    { identifier: 'save', group: 'database', name: 'query', params: {} },
  ];
  const enrich = () => [
    { identifier: 'lookup', group: 'database', name: 'query', params: {} },
    { identifier: 'post', group: 'http', name: 'request', params: {} },
  ];

  function setupSub() {
    const source = ref<any[]>(caller());
    const subtasks = ref<any[]>([]);
    const events = ref<StreamEvent[]>([]);
    const isPaused = ref(false);
    const isRunning = ref(true);
    const loads: string[] = [];
    const timeline = useDebugTimeline({
      taskId: 'task1',
      source,
      subtasks,
      events,
      isPaused,
      isRunning,
      loadWorkflow: async (id) => {
        loads.push(id);
        return id === 'enrich' ? { name: 'Enrich customer', actions: enrich() } : null;
      },
    });
    return { source, subtasks, events, isPaused, isRunning, loads, ...timeline };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve));

  /** The sub-workflow run starts from step "call": its start event, then its source. */
  async function startSubRun(ctx: ReturnType<typeof setupSub>) {
    ctx.events.value.push(event('start'));
    ctx.events.value.push(event('action', { identifier: 'fetch', result: 1 }));
    ctx.events.value.push(event('start', { parent: { pipelineIdentifier: PIPE, stepIdentifier: 'call' } }, 'sub-pipe'));
    ctx.subtasks.value.push({
      pipelineId: 'sub-pipe',
      taskId: 'enrich',
      name: 'Enrich customer',
      actions: enrich(),
      variables: [{ name: 'customerId', type: 'number', value: 0 }, { name: 'customer', type: 'object', value: null }],
      parent: { pipelineIdentifier: PIPE, stepIdentifier: 'call' },
      startValues: { customerId: 7 },
    });
    await nextTick();
  }

  it('lists a sub-workflow as saved under its step before it runs, numbered under it', async () => {
    const ctx = setupSub();
    await flush();
    await nextTick();
    expect(ctx.loads).toEqual(['enrich']);
    expect(ctx.rows.value.map((r) => `${r.label} ${r.key}`)).toEqual([
      '1 fetch',
      '2 call',
      '2.1 call>lookup',
      '2.2 call>post',
      '3 save',
    ]);
    const preview = ctx.rowByKey.value.get('call>post')!;
    expect(preview.track).toBeNull();
    // A breakpoint in it names its workflow; the workflow's own steps keep their identifier.
    expect(ctx.breakpointOf('call>post')).toBe('enrich:post');
    expect(ctx.breakpointOf('save')).toBe('save');
    ctx.selectKey('call>post');
    expect(ctx.selectedStep.value.identifier).toBe('post');
    expect(ctx.selectedKey.value).toBe('call>post');
  });

  it('lists the run a sub-workflow step started under it, and follows its steps', async () => {
    const ctx = setupSub();
    await startSubRun(ctx);
    ctx.events.value.push(event('action', { identifier: 'lookup', result: { id: 7 }, changedVariables: [{ name: 'customer', value: { id: 7 } }] }, 'sub-pipe'));
    await nextTick();

    const row = ctx.rowByKey.value.get('call>lookup')!;
    expect(row.track).toBe('sub-pipe');
    expect(row.action.result).toEqual({ id: 7 });
    // Followed into the sub-workflow; the picked row is its row in the one list.
    expect(ctx.selected.value).toEqual({ track: 'sub-pipe', identifier: 'lookup' });
    expect(ctx.selectedKey.value).toBe('call>lookup');
    // Its variables: as saved, the values it started with, then what changed.
    const vars = ctx.subVariables('sub-pipe')!;
    expect(vars.name).toBe('Enrich customer');
    expect(vars.initial.customerId).toBe(7);
    expect(vars.variables.map((v: any) => [v.name, v.value])).toEqual([
      ['customerId', 7],
      ['customer', { id: 7 }],
    ]);
    expect([...vars.lastChanged]).toEqual(['customer']);
  });

  it('says where a run paused inside a sub-workflow is', async () => {
    const ctx = setupSub();
    await startSubRun(ctx);
    ctx.events.value.push(event('action', { identifier: 'lookup', result: 1 }, 'sub-pipe'));
    ctx.events.value.push(event('paused', { identifier: 'post', params: {}, callDepth: 1 }, 'sub-pipe'));
    ctx.isPaused.value = true;
    await nextTick();

    expect(ctx.pausedTrack.value).toBe('sub-pipe');
    expect(ctx.progress.value.state).toBe('paused');
    expect(ctx.progress.value.step?.number).toBe('2.2');
    expect(ctx.progress.value.step?.action.identifier).toBe('post');
    // Only the workflow's own steps count toward "step n of m".
    expect(ctx.progress.value.total).toBe(3);
    expect(ctx.progress.value.calls.map((c) => [c.key, c.label, c.name])).toEqual([['call', '2', 'Enrich customer']]);
    // Not in a loop: the sub-workflow step around it isn't a pass.
    expect(ctx.progress.value.around).toBeNull();
  });

  it('shows a failed step inside a sub-workflow as where the run failed', async () => {
    const ctx = setupSub();
    await startSubRun(ctx);
    ctx.events.value.push(event('action_error', { identifier: 'post', error: '401' }, 'sub-pipe'));
    ctx.events.value.push(event('end', {}, 'sub-pipe'));
    ctx.events.value.push(event('action_error', { identifier: 'call', error: '401' }));
    ctx.events.value.push(event('error', {}, ''));
    await nextTick();

    expect(ctx.progress.value.state).toBe('failed');
    expect(ctx.progress.value.step?.number).toBe('2.2');
  });
});

describe('DebugStepList: sub-workflows', () => {
  const list = (preview: boolean) => [
    {
      identifier: 'call',
      group: 'subtask',
      name: 'exec',
      status: preview ? 'pending' : 'running',
      params: { identifier: 'enrich' },
      childName: 'Enrich customer',
      childPreview: preview || undefined,
      childSteps: [{ identifier: 'lookup', group: 'database', name: 'query', status: 'pending', params: {} }],
    },
  ];

  it('folds a sub-workflow that hasn’t run, and opens it on click', async () => {
    const wrapper = mount(DebugStepList, {
      props: { actions: list(true), ended: false, labels: { call: '1', 'call>lookup': '1.1' }, breakpoints: [] },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('[data-testid="debug-subworkflow"]').text()).toContain('Enrich customer');
    expect(wrapper.find('[data-step="call>lookup"]').exists()).toBe(false);

    await wrapper.find('[data-testid="debug-subworkflow"]').trigger('click');
    const row = wrapper.find('[data-step="call>lookup"]');
    expect(row.text()).toMatch(/^1\.1/);
    // Opening it doesn't pick the row; its steps take breakpoints like any other.
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(row.find('[data-testid="debug-breakpoint"]').exists()).toBe(true);
  });

  it('lists a running sub-workflow’s steps', () => {
    const wrapper = mount(DebugStepList, { props: { actions: list(false), ended: false }, global: { plugins: [i18n] } });
    expect(wrapper.find('[data-step="call>lookup"]').exists()).toBe(true);
  });
});

describe('TaskPipelineDebugControls', () => {
  it('offers Step over and Step out only where they apply', async () => {
    const mountControls = (props: Record<string, unknown>) =>
      mount(TaskPipelineDebugControls, { props: { isRunning: true, isPaused: true, ...props }, global: { plugins: [i18n] } });

    const plain = mountControls({});
    expect(plain.find('[data-testid="debug-step-over"]').exists()).toBe(false);
    expect(plain.find('[data-testid="debug-step-out"]').exists()).toBe(false);

    const inside = mountControls({ canStepOver: true, canStepOut: true });
    await inside.find('[data-testid="debug-step-over"]').trigger('click');
    await inside.find('[data-testid="debug-step-out"]').trigger('click');
    expect(inside.emitted('stepOver')).toHaveLength(1);
    expect(inside.emitted('stepOut')).toHaveLength(1);
    expect(inside.find('[data-testid="debug-step-over"]').text()).toContain('Step over');
  });
});
