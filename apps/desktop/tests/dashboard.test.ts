// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { useStarredItemsStore } from '@/store/starredItems';
import { useRecentItemsStore } from '@/store/recentItems';
import { useApprovalsStore } from '@/store/approvalsStore';
import { useInbox } from '@/composables/useInbox';
import { mergeRunEvents } from '@/utils/mergeRunEvents';
import { searchAll } from '@/utils/searchIndex';
import HomeAsk from '@/components/home/HomeAsk.vue';
import HomeNeedsYou from '@/components/home/HomeNeedsYou.vue';
import HomeContinue from '@/components/home/HomeContinue.vue';
import HomeDayLine from '@/components/home/HomeDayLine.vue';
import Dashboard from '@/pages/Dashboard.vue';
import { useAgentStore } from '@/store/agentStore';
import type { TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import type { StreamEvent } from '@/store/stream';

const keys = (items: { type: string; identifier: string }[]) => items.map((i) => `${i.type}:${i.identifier}`);

function makeRouter() {
  const stub = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/:rest(.*)*', component: stub },
      { path: '/tasks/:tid/pipelines/:pipelineId', name: 'PipelineDetail', component: stub },
    ],
  });
}

let lists: Record<string, unknown>;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.mocked(invokeCore).mockReset();
  lists = {
    [SEND.TASK_LIST]: [],
    [SEND.APP_LIST]: [],
    [SEND.PROJECT_LIST]: [],
    [SEND.SCHEDULE_LIST]: [],
  };
  (window as any).ipcRenderer = {
    invoke: vi.fn(async (channel: string) => lists[channel] ?? []),
    on: vi.fn(),
    off: vi.fn(),
  };
});

afterEach(() => {
  delete (window as any).ipcRenderer;
});

const failedTask = (identifier: string, run: string, extra: Partial<TaskItem> = {}) =>
  ({
    identifier,
    name: `Workflow ${identifier}`,
    last_run_status: 'failed',
    last_run_identifier: run,
    last_run_at: new Date().toISOString(),
    ...extra,
  }) as TaskItem;

describe('starred items store', () => {
  it('adds new stars at the end and toggles them off', () => {
    const store = useStarredItemsStore();
    store.star('task', 'a', 'A');
    store.star('app', 'b', 'B');
    store.star('task', 'a', 'A again'); // already starred: no duplicate
    expect(keys(store.items)).toEqual(['task:a', 'app:b']);

    store.toggle('task', 'a', 'A');
    expect(store.isStarred('task', 'a')).toBe(false);
    expect(keys(store.items)).toEqual(['app:b']);
  });

  it('moves an item to where it was dropped', () => {
    const store = useStarredItemsStore();
    for (const id of ['a', 'b', 'c', 'd']) store.star('task', id, id);
    const at = (id: string) => ({ type: 'task' as const, identifier: id });

    store.move(at('a'), at('c')); // dropped on an item further down: lands after it
    expect(store.items.map((i) => i.identifier)).toEqual(['b', 'c', 'a', 'd']);

    store.move(at('d'), at('b')); // further up: lands before it
    expect(store.items.map((i) => i.identifier)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('keeps a separate list per workspace', () => {
    const store = useStarredItemsStore();
    store.star('task', 'local-one', 'Local');
    store.switchConnection('server-1');
    expect(store.items).toEqual([]);
    store.star('app', 'remote-one', 'Remote');

    store.switchConnection(null);
    expect(keys(store.items)).toEqual(['task:local-one']);
    store.switchConnection('server-1');
    expect(keys(store.items)).toEqual(['app:remote-one']);
  });
});

const schedule = (id: string, extra: Partial<ScheduleItem> = {}) =>
  ({
    scheduleIdentifier: id,
    taskIdentifier: `wf-${id}`,
    taskName: `Scheduled ${id}`,
    cron: '0 2 * * *',
    variables: { who: 'me' },
    enabled: true,
    nextRunAt: null,
    ...extra,
  }) as ScheduleItem;

describe('inbox', () => {
  it('counts approvals, failures and missed runs, and a dismissal only covers that one', async () => {
    vi.mocked(invokeCore).mockResolvedValue([
      { pipelineIdentifier: 'p-1', taskIdentifier: 'wf', workflowName: 'Pay', title: 'Pay?', details: null, requestedAt: '' },
    ]);
    await useApprovalsStore().refresh();

    const tasks = ref<TaskItem[]>([
      failedTask('x', 'run-1'),
      failedTask('y', 'run-2'),
      { identifier: 'ok', name: 'Fine', last_run_status: 'completed' } as TaskItem,
    ]);
    const schedules = ref<ScheduleItem[]>([
      schedule('s1', { missedAt: '2026-11-12T02:00:00.000Z' }),
      schedule('s2', { missedAt: '2026-11-12T03:00:00.000Z', enabled: false }), // paused: not counted
      schedule('s3'),
    ]);
    const inbox = useInbox(tasks, schedules);
    expect(inbox.count.value).toBe(4);

    inbox.dismiss(tasks.value[0]);
    expect(inbox.failing.value.map((t) => t.identifier)).toEqual(['y']);
    inbox.dismissMissed(schedules.value[0]);
    expect(inbox.missed.value).toEqual([]);
    // A missed run's dismissal doesn't bring back the same workflow's dismissed failure, or the reverse.
    expect(inbox.count.value).toBe(2);

    // The same workflow fails again, the schedule misses another night: both are back.
    tasks.value = [failedTask('x', 'run-3'), failedTask('y', 'run-2')];
    schedules.value = [schedule('s1', { missedAt: '2026-11-13T02:00:00.000Z' })];
    expect(inbox.failing.value.map((t) => t.identifier).sort()).toEqual(['x', 'y']);
    expect(inbox.missed.value.map((s) => s.scheduleIdentifier)).toEqual(['s1']);
  });
});

describe('HomeNeedsYou', () => {
  it('dismisses a failure without opening the run, then says all clear', async () => {
    const router = makeRouter();
    await router.push('/');
    const card = mount(HomeNeedsYou, {
      props: { tasks: [failedTask('x', 'run-1')], schedules: [] },
      global: { plugins: [i18n, router] },
    });
    expect(card.text()).toContain('Workflow x');

    await card.findAll('button').find((b) => b.text() === 'Dismiss')!.trigger('click');
    await flushPromises();

    expect(card.text()).toContain('All clear: nothing needs you');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('says how many times in a row a workflow failed, and opens that run', async () => {
    const router = makeRouter();
    const card = mount(HomeNeedsYou, {
      props: {
        tasks: [failedTask('x', 'run-9', { recent_runs: ['failed', 'failed', 'failed', 'completed', 'failed'] })],
        schedules: [],
      },
      global: { plugins: [i18n, router] },
    });
    expect(card.text()).toContain('Failed 3 times in a row');

    await card.findAll('button').find((b) => b.text() === 'Open run')!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/tasks/x/pipelines/run-9');
  });

  it('runs a missed schedule now with its variables, and drops it from the list', async () => {
    const card = mount(HomeNeedsYou, {
      props: { tasks: [], schedules: [schedule('s1', { missedAt: new Date().toISOString() })] },
      global: { plugins: [i18n, makeRouter()] },
    });
    expect(card.text()).toContain('Missed');
    expect(card.text()).toContain('Scheduled s1');

    const send = vi.fn();
    (window as any).ipcRenderer.send = send;
    await card.findAll('button').find((b) => b.text() === 'Run now')!.trigger('click');
    await flushPromises();

    const exec = send.mock.calls.find(([channel]) => channel === SEND.TASK_EXEC);
    expect(exec?.[1]).toMatchObject({ payload: { identifier: 'wf-s1', variables: { who: 'me' } } });
    expect(card.text()).toContain('All clear: nothing needs you');
  });

  it('shows what runs next when all is clear', () => {
    const soon = new Date();
    soon.setHours(23, 30, 0, 0);
    const card = mount(HomeNeedsYou, {
      props: {
        tasks: [],
        schedules: [
          schedule('later', { nextRunAt: new Date(soon.getTime() + 86_400_000 * 3).toISOString() }),
          schedule('soon', { nextRunAt: soon.toISOString() }),
          schedule('off', { nextRunAt: soon.toISOString(), enabled: false }),
        ],
      },
      global: { plugins: [i18n, makeRouter()] },
    });
    const text = card.text();
    expect(text).toContain('Coming up');
    expect(text).toContain('23:30Scheduled soon');
    expect(text).not.toContain('Scheduled off');
    expect(text.indexOf('Scheduled soon')).toBeLessThan(text.indexOf('Scheduled later'));
  });
});

describe('HomeContinue', () => {
  const tileNames = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('button p.font-medium').map((p) => p.text());

  it('says what shows up here when nothing is starred or opened', async () => {
    const wrapper = mount(HomeContinue, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Workflows and apps you star or open show up here.');
  });

  it('puts every star first, then recently opened ones without repeats, hiding deleted items', async () => {
    lists[SEND.TASK_LIST] = [
      { identifier: 't1', name: 'Nightly sync', last_run_status: 'failed', last_run_at: new Date().toISOString() },
      { identifier: 't2', name: 'Report' },
    ];
    lists[SEND.APP_LIST] = [{ identifier: 'a1', name: 'Invoices' }];
    const stars = useStarredItemsStore();
    stars.star('app', 'a1', 'Invoices');
    stars.star('task', 't1', 'Old name');
    stars.star('app', 'gone', 'Deleted app');
    const recent = useRecentItemsStore();
    recent.markOpened('task', 't1', 'Nightly sync');
    recent.markOpened('task', 't2', 'Report');

    const wrapper = mount(HomeContinue, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(tileNames(wrapper)).toEqual(['Invoices', 'Nightly sync', 'Report']);
    expect(wrapper.text()).toMatch(/Ran less than a minute ago/);
    expect(wrapper.find('.bg-destructive').exists()).toBe(true); // the failed last run
    expect(wrapper.text()).toContain('Opened less than a minute ago'); // never ran, but opened
  });
});

describe('HomeContinue rows', () => {
  it('shows two rows of tiles until Show all, then all of them', async () => {
    lists[SEND.TASK_LIST] = Array.from({ length: 18 }, (_, i) => ({ identifier: `t${i}`, name: `W${i}` }));
    const stars = useStarredItemsStore();
    for (let i = 0; i < 18; i++) stars.star('task', `t${i}`, `W${i}`);

    const wrapper = mount(HomeContinue, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    const names = () => wrapper.findAll('button p.font-medium').map((p) => p.text());
    // Before the grid is measured it assumes six to a row: two rows are twelve.
    expect(names()).toHaveLength(12);

    const toggle = wrapper.findAll('button').find((b) => b.text() === 'Show all (18)')!;
    await toggle.trigger('click');
    expect(names()).toHaveLength(18);
    expect(names().at(-1)).toBe('W17');

    await wrapper.findAll('button').find((b) => b.text() === 'Show less')!.trigger('click');
    await flushPromises();
    expect(names()).toHaveLength(12);
  });

  it('Show less scrolls the page back to where it was before Show all', async () => {
    lists[SEND.TASK_LIST] = Array.from({ length: 18 }, (_, i) => ({ identifier: `t${i}`, name: `W${i}` }));
    const stars = useStarredItemsStore();
    for (let i = 0; i < 18; i++) stars.star('task', `t${i}`, `W${i}`);
    const Host = defineComponent({ render: () => h('div', { class: 'overflow-y-auto' }, [h(HomeContinue)]) });
    const wrapper = mount(Host, { global: { plugins: [i18n, makeRouter()] }, attachTo: document.body });
    await flushPromises();
    const page = wrapper.element as HTMLElement;
    const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!;

    page.scrollTop = 0;
    await button('Show all (18)').trigger('click');
    page.scrollTop = 400; // scrolled down to see the rest
    await button('Show less').trigger('click');
    await flushPromises();
    expect(page.scrollTop).toBe(0);
    wrapper.unmount();
  });

  it('shows the hint next to the heading', async () => {
    const wrapper = mount(HomeContinue, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Starred first, then recently opened');
    expect(wrapper.text()).not.toContain('dashboard.');
  });

  it('has no toggle when everything fits', async () => {
    lists[SEND.TASK_LIST] = [{ identifier: 't1', name: 'Only one' }];
    useStarredItemsStore().star('task', 't1', 'Only one');
    const wrapper = mount(HomeContinue, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Show all');
  });
});

describe('HomeDayLine', () => {
  it('shows today\'s runs and failures and the next scheduled run', async () => {
    vi.mocked(invokeCore).mockImplementation(async (channel: string) =>
      channel === SEND.PIPELINE_STATS ? [{ from: '', to: '', total: 12, failed: 2 }] : []
    );
    const next = new Date();
    next.setHours(23, 45, 0, 0);
    const wrapper = mount(HomeDayLine, {
      props: { schedules: [schedule('r', { taskName: 'Weekly report', nextRunAt: next.toISOString() })] },
      global: { plugins: [i18n, makeRouter()] },
    });
    await flushPromises();

    const call = vi.mocked(invokeCore).mock.calls.find(([channel]) => channel === SEND.PIPELINE_STATS)!;
    expect((call[1] as any).boundaries).toHaveLength(2);
    const text = wrapper.text().replace(/\s+/g, ' ');
    expect(text).toContain('12 runs today');
    expect(text).toContain('2 failed');
    expect(text).toContain('Next: Weekly report at 23:45');
    expect(text).toContain('All runs');
    // The link is the run, not the "Next:" label.
    const link = wrapper.findAll('button').find((b) => b.text().includes('Weekly report'))!;
    expect(link.text().replace(/\s+/g, ' ')).toBe('Weekly report at 23:45');
    wrapper.unmount();
  });

  it('shows dashes when Core has no stats command yet', async () => {
    vi.mocked(invokeCore).mockRejectedValue(new Error('unknown command'));
    const wrapper = mount(HomeDayLine, { props: { schedules: [] }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(wrapper.text()).toContain('—');
    expect(wrapper.text()).toContain('Nothing scheduled');
    // No failure count to show, so no empty "· ·" between the parts.
    expect(wrapper.text().replace(/\s+/g, ' ')).not.toMatch(/· ·/);
    wrapper.unmount();
  });
});

describe('HomeAsk', () => {
  it('hands the request to the Assistant and clears the box', async () => {
    const agent = useAgentStore();
    const ask = vi.spyOn(agent, 'ask').mockResolvedValue(true as never);
    const wrapper = mount(HomeAsk, { global: { plugins: [i18n] } });
    const submit = wrapper.find('button[type="submit"]');
    expect(submit.attributes('disabled')).toBeDefined();

    await wrapper.find('input').setValue('  Rename my photos  ');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(ask).toHaveBeenCalledWith('Rename my photos');
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('');
  });
});

describe('Dashboard', () => {
  const stubs = { HomeContinue: true, HomeDayLine: true };

  it('shows Home even on a new install with nothing in it yet', async () => {
    const home = mount(Dashboard, { global: { plugins: [i18n, makeRouter()], stubs } });
    await flushPromises();
    expect(home.text()).toMatch(/Good (morning|afternoon|evening)/);
    expect(home.text()).toContain('All clear: nothing needs you');
    for (const name of ['HomeContinue', 'HomeDayLine']) {
      expect(home.findComponent({ name }).exists()).toBe(true);
    }
  });

  it('scrolls as a whole page, so a long Continue row or Needs you list is never cut off', async () => {
    const home = mount(Dashboard, { global: { plugins: [i18n, makeRouter()], stubs } });
    await flushPromises();
    expect(home.findComponent({ name: 'Page' }).props('scrollable')).toBe(true);
  });

  it('lists a failed workflow under Needs you', async () => {
    lists[SEND.TASK_LIST] = [failedTask('x', 'run-1')];
    const wrapper = mount(Dashboard, { global: { plugins: [i18n, makeRouter()], stubs } });
    await flushPromises();
    expect(wrapper.text()).toMatch(/Needs you\s*1/);
    expect(wrapper.text()).toContain('Workflow x');
  });
});

describe('mergeRunEvents', () => {
  const event = (type: string, extra: Partial<StreamEvent> = {}): StreamEvent => ({
    type: type as StreamEvent['type'],
    correlationId: 'c1',
    taskIdentifier: 't',
    pipelineIdentifier: 'p1',
    timestamp: 1000,
    ...extra,
  });

  it('marks a live run that ended with an error as failed', () => {
    const runs = mergeRunEvents([], [
      event('start', { timestamp: 1 }),
      // The error event carries no pipeline identifier; only its correlationId ties it to the run.
      event('error', { timestamp: 2, pipelineIdentifier: '' }),
      event('end', { timestamp: 3 }),
    ]);
    expect(runs.map((r) => r.status)).toEqual(['failed']);
  });

  it('keeps successful and paused runs apart', () => {
    const runs = mergeRunEvents([], [
      event('start', { timestamp: 1 }),
      event('end', { timestamp: 2, data: { status: 'paused' } }),
      event('start', { timestamp: 3, correlationId: 'c2', pipelineIdentifier: 'p2' }),
      event('end', { timestamp: 4, correlationId: 'c2', pipelineIdentifier: 'p2' }),
    ]);
    expect(runs.map((r) => `${r.identifier}:${r.status}`)).toEqual(['p2:completed', 'p1:paused']);
  });
});

describe('searchAll', () => {
  const sources = {
    tasks: [
      { identifier: 'inv', name: 'Send invoices', description: 'Monthly', tags: ['finance'], projects: [{ name: 'Billing' }] },
      { identifier: 'sync', name: 'Invoice sync', tags: '["finance","erp"]', projects: [] },
      { identifier: 'hr', name: 'Onboard employee', tags: [], projects: [{ name: 'People' }, { name: 'Billing' }] },
    ],
    apps: [{ identifier: 'dash', name: 'Invoice dashboard', projects: [{ name: 'Billing' }] }],
    projects: [
      { identifier: 'bill', name: 'Billing' },
      { identifier: 'people', name: 'People' },
    ],
  };

  it('finds workflows by the project they are in, word by word', () => {
    const results = searchAll('billing send', sources);
    expect(results.map((r) => r.key)).toEqual(['task:inv']);
    expect(results[0].subtitle).toBe('Billing · Monthly');
  });

  it('finds a workflow by any of its projects, and lists them all', () => {
    const results = searchAll('billing onboard', sources);
    expect(results.map((r) => r.key)).toEqual(['task:hr']);
    expect(results[0].subtitle).toBe('People, Billing');
  });

  it('groups by kind and ranks name matches first', () => {
    const results = searchAll('invoice', sources);
    expect(results.map((r) => r.key)).toEqual(['task:sync', 'task:inv', 'app:dash']);
  });

  it('finds tags, with how many workflows use them', () => {
    const tag = searchAll('fin', sources).find((r) => r.kind === 'tag');
    expect(tag).toMatchObject({ title: 'finance', subtitle: '2', path: '/tasks?tags=finance' });
  });

  it('returns nothing for an empty query', () => {
    expect(searchAll('   ', sources)).toEqual([]);
  });
});
