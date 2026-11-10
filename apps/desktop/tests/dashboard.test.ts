// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
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
import HomeStarred from '@/components/home/HomeStarred.vue';
import HomeRecentItems from '@/components/home/HomeRecentItems.vue';
import HomeInbox from '@/components/home/HomeInbox.vue';
import HomeBrowse from '@/components/home/HomeBrowse.vue';
import HomeSimple from '@/components/home/HomeSimple.vue';
import HomeToday from '@/components/home/HomeToday.vue';
import Dashboard from '@/pages/Dashboard.vue';
import { useAgentStore } from '@/store/agentStore';
import { useConnectionStore } from '@/store/connectionStore';
import type { TaskItem } from '@/config/tables/TasksList';
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

describe('inbox', () => {
  it('counts approvals plus failures, and a dismissal only covers that one run', async () => {
    vi.mocked(invokeCore).mockResolvedValue([
      { pipelineIdentifier: 'p-1', taskIdentifier: 'wf', workflowName: 'Pay', title: 'Pay?', details: null, requestedAt: '' },
    ]);
    await useApprovalsStore().refresh();

    const tasks = ref<TaskItem[]>([
      failedTask('x', 'run-1'),
      failedTask('y', 'run-2'),
      { identifier: 'ok', name: 'Fine', last_run_status: 'completed' } as TaskItem,
    ]);
    const inbox = useInbox(tasks);
    expect(inbox.count.value).toBe(3);

    inbox.dismiss(tasks.value[0]);
    expect(inbox.failing.value.map((t) => t.identifier)).toEqual(['y']);
    expect(inbox.count.value).toBe(2);

    // The same workflow fails again: back in the inbox.
    tasks.value = [failedTask('x', 'run-3'), failedTask('y', 'run-2')];
    expect(inbox.failing.value.map((t) => t.identifier).sort()).toEqual(['x', 'y']);
  });

  it('the card dismisses a failure without opening the run', async () => {
    const router = makeRouter();
    await router.push('/');
    const card = mount(HomeInbox, {
      props: { tasks: [failedTask('x', 'run-1')] },
      global: { plugins: [i18n, router] },
    });
    expect(card.text()).toContain('Workflow x');

    await card.find('button[aria-label="Dismiss until it fails again"]').trigger('click');
    await flushPromises();

    expect(card.text()).toContain('Nothing needs you right now.');
    expect(router.currentRoute.value.path).toBe('/');
  });
});

describe('HomeStarred', () => {
  const tileNames = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('button p.font-medium').map((p) => p.text());

  it('explains how to star when nothing is starred', async () => {
    const wrapper = mount(HomeStarred, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Star workflows and apps with ☆ to keep them here.');
  });

  it('hides deleted items and filters by type once both kinds are starred', async () => {
    lists[SEND.TASK_LIST] = [{ identifier: 't1', name: 'Nightly sync' }];
    lists[SEND.APP_LIST] = [{ identifier: 'a1', name: 'Invoices' }];
    const store = useStarredItemsStore();
    store.star('task', 't1', 'Old name');
    store.star('app', 'a1', 'Invoices');
    store.star('app', 'gone', 'Deleted app');

    const wrapper = mount(HomeStarred, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(tileNames(wrapper)).toEqual(['Nightly sync', 'Invoices']);

    await wrapper.findAll('[role="radio"]').find((b) => b.text() === 'Apps')!.trigger('click');
    expect(tileNames(wrapper)).toEqual(['Invoices']);
    // Remembered for next time.
    expect(localStorage.getItem('tipeline:dashboard:starredFilter')).toBe('app');
  });

  it('shows one row until asked for all', async () => {
    lists[SEND.TASK_LIST] = Array.from({ length: 8 }, (_, i) => ({ identifier: `t${i}`, name: `W${i}` }));
    const store = useStarredItemsStore();
    for (let i = 0; i < 8; i++) store.star('task', `t${i}`, `W${i}`);

    const wrapper = mount(HomeStarred, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    // No layout in happy-dom, so the row counts as 6 tiles wide.
    expect(tileNames(wrapper)).toHaveLength(6);

    await wrapper.findAll('button').find((b) => b.text() === 'Show all (8)')!.trigger('click');
    expect(tileNames(wrapper)).toHaveLength(8);
    await wrapper.findAll('button').find((b) => b.text() === 'Show less')!.trigger('click');
    expect(tileNames(wrapper)).toHaveLength(6);
  });

  it('reorders by drag and drop', async () => {
    lists[SEND.TASK_LIST] = ['a', 'b', 'c'].map((id) => ({ identifier: id, name: id.toUpperCase() }));
    const store = useStarredItemsStore();
    for (const id of ['a', 'b', 'c']) store.star('task', id, id);

    const wrapper = mount(HomeStarred, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    const tiles = wrapper.findAll('[draggable="true"]');
    await tiles[0].trigger('dragstart');
    await tiles[2].trigger('dragover');
    await tiles[2].trigger('drop');

    expect(tileNames(wrapper)).toEqual(['B', 'C', 'A']);
  });
});

describe('HomeRecentItems', () => {
  it('lists up to 20 items and lets workflows be starred from a row', async () => {
    lists[SEND.TASK_LIST] = Array.from({ length: 25 }, (_, i) => ({ identifier: `t${i}`, name: `W${i}` }));
    const recent = useRecentItemsStore();
    for (let i = 0; i < 25; i++) recent.markOpened('task', `t${i}`, `W${i}`);

    const wrapper = mount(HomeRecentItems, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(wrapper.findAll('button p.font-medium')).toHaveLength(20);

    await wrapper.find('button[aria-label="Star to show it on Home"]').trigger('click');
    expect(keys(useStarredItemsStore().items)).toEqual(['task:t24']);
  });
});

describe('HomeBrowse', () => {
  it('switches between tags and projects, and remembers the tab', async () => {
    lists[SEND.PROJECT_LIST] = [{ identifier: 'p1', name: 'Billing', task_count: 1, app_count: 2 }];
    const tasks = [{ identifier: 't', name: 'T', tags: ['finance'] }] as unknown as TaskItem[];

    const wrapper = mount(HomeBrowse, { props: { tasks }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(wrapper.text()).toContain('finance');
    expect(wrapper.text()).not.toContain('Billing');

    await wrapper.findAll('[role="radio"]').find((b) => b.text() === 'Projects')!.trigger('click');
    expect(wrapper.text()).toContain('Billing');
    expect(wrapper.text()).toContain('1 workflow · 2 apps');

    const again = mount(HomeBrowse, { props: { tasks }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(again.text()).toContain('Billing');
  });
});

describe('HomeSimple', () => {
  const mountSimple = () => mount(HomeSimple, { global: { plugins: [i18n, makeRouter()] } });

  it('fills the box from an idea and hands it to the Assistant on Enter', async () => {
    const agent = useAgentStore();
    const ask = vi.spyOn(agent, 'ask').mockResolvedValue(true);
    const wrapper = mountSimple();
    await flushPromises();

    await wrapper.findAll('button').find((b) => b.text() === 'Save email attachments to a folder')!.trigger('click');
    const box = wrapper.find('textarea');
    expect((box.element as HTMLTextAreaElement).value).toBe('Save email attachments to a folder');
    expect(ask).not.toHaveBeenCalled(); // an idea only fills the box

    await box.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(ask).toHaveBeenCalledWith('Save email attachments to a folder');
    expect((box.element as HTMLTextAreaElement).value).toBe('');
  });

  it('has no box on a remote workspace, where there is no Assistant sidebar', async () => {
    useConnectionStore().activeId = 'server-1';
    const wrapper = mountSimple();
    await flushPromises();
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.text()).toContain('Copy from the Hub');
  });

  it('shows the last few opened items, or says where they will show up', async () => {
    const empty = mountSimple();
    await flushPromises();
    expect(empty.text()).toContain('Workflows, apps and projects you open show up here.');

    lists[SEND.TASK_LIST] = Array.from({ length: 6 }, (_, i) => ({ identifier: `t${i}`, name: `W${i}` }));
    for (let i = 0; i < 6; i++) useRecentItemsStore().markOpened('task', `t${i}`, `W${i}`);
    const wrapper = mountSimple();
    await flushPromises();
    expect(wrapper.findAll('button p.font-medium').map((p) => p.text())).toEqual(['W5', 'W4', 'W3', 'W2']);
  });
});

describe('HomeToday', () => {
  const day = (total: number, failed = 0) => ({ from: '', to: '', total, failed });

  function mockCore(stats: unknown, approvals: unknown[] = []) {
    vi.mocked(invokeCore).mockImplementation(async (channel: string) => {
      if (channel === SEND.PIPELINE_STATS) {
        if (stats instanceof Error) throw stats;
        return stats;
      }
      if (channel === SEND.APPROVAL_LIST) return approvals;
      return [];
    });
  }

  it('asks for seven local days and shows today, its failures and a bar per day', async () => {
    mockCore([day(18), day(22), day(15), day(20), day(26, 1), day(19), day(24, 2)]);
    const tasks = [failedTask('x', 'run-1'), failedTask('y', 'run-2'), failedTask('old', 'run-0', { last_run_at: '2020-01-01T00:00:00Z' })];
    const wrapper = mount(HomeToday, { props: { tasks }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();

    const call = vi.mocked(invokeCore).mock.calls.find(([channel]) => channel === SEND.PIPELINE_STATS)!;
    const boundaries: string[] = (call[1] as any).boundaries;
    expect(boundaries).toHaveLength(8);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(new Date(boundaries[6]).getTime()).toBe(midnight.getTime()); // today starts at local midnight

    const text = wrapper.text();
    expect(text).toContain('Runs today');
    expect(text).toContain('24');
    expect(wrapper.findAll('[role="img"] > span')).toHaveLength(7);
    expect(wrapper.find('[title="Today: 24 runs"]').exists()).toBe(true);
    // Failed today: the count from Core, the names of today's failed workflows only.
    expect(text).toContain('Workflow x and 1 more');
    expect(text).not.toContain('Workflow old');
  });

  it('shows dashes when Core has no stats command yet, and says when nothing failed', async () => {
    mockCore(new Error('unknown command'));
    const older = mount(HomeToday, { props: { tasks: [] }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(older.text()).toContain('—');
    expect(older.find('[role="img"]').exists()).toBe(false);

    mockCore([day(1), day(1), day(1), day(1), day(1), day(1), day(3)]);
    const quiet = mount(HomeToday, { props: { tasks: [] }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(quiet.text()).toContain('Nothing failed');
  });

  it('shows approvals waiting and the next scheduled run', async () => {
    mockCore([day(0), day(0), day(0), day(0), day(0), day(0), day(0)], [
      { pipelineIdentifier: 'p-1', taskIdentifier: 'wf', workflowName: 'Pay', title: 'Pay?', details: null, requestedAt: '' },
    ]);
    await useApprovalsStore().refresh();
    const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    lists[SEND.SCHEDULE_LIST] = [
      { scheduleIdentifier: 's1', taskIdentifier: 't1', taskName: 'Later', enabled: true, nextRunAt: inHours(20) },
      { scheduleIdentifier: 's2', taskIdentifier: 't2', taskName: 'Paused', enabled: false, nextRunAt: inHours(1) },
      { scheduleIdentifier: 's3', taskIdentifier: 't3', taskName: 'Soon', enabled: true, nextRunAt: inHours(2) },
    ];
    const wrapper = mount(HomeToday, { props: { tasks: [] }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();

    expect(wrapper.text()).toContain('1approval to review');
    expect(wrapper.text()).toContain('in about 2 hours');
    expect(wrapper.text()).toContain('Soon');
    wrapper.unmount();
  });
});

describe('Dashboard', () => {
  const stubs = { HomeToday: true, HomeStarred: true, HomeRecentItems: true, HomeRecentActivity: true, HomeBrowse: true };

  it('starts simple, and remembers a switch to the full dashboard and back', async () => {
    const wrapper = mount(Dashboard, { global: { plugins: [i18n, makeRouter()], stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('What do you want to automate?');

    await wrapper.findAll('button').find((b) => b.text() === 'Show the full dashboard')!.trigger('click');
    expect(wrapper.findComponent({ name: 'HomeStarred' }).exists()).toBe(true);
    expect(localStorage.getItem('tipeline:dashboard:mode')).toBe('full');

    const again = mount(Dashboard, { global: { plugins: [i18n, makeRouter()], stubs } });
    await flushPromises();
    expect(again.text()).not.toContain('What do you want to automate?');

    await again.findAll('button').find((b) => b.text() === 'Simple view')!.trigger('click');
    expect(again.text()).toContain('What do you want to automate?');
    expect(localStorage.getItem('tipeline:dashboard:mode')).toBe('simple');
  });

  it('opens the inbox from the badge next to the title', async () => {
    localStorage.setItem('tipeline:dashboard:mode', 'full');
    lists[SEND.TASK_LIST] = [failedTask('x', 'run-1')];
    const wrapper = mount(Dashboard, { global: { plugins: [i18n, makeRouter()], stubs }, attachTo: document.body });
    await flushPromises();

    const badge = wrapper.findAll('button').find((b) => b.text() === '1 in your inbox')!;
    await badge.trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Workflow x');
    wrapper.unmount();
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
