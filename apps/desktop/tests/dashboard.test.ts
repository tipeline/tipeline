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
import HomeRecentActivity from '@/components/home/HomeRecentActivity.vue';
import HomeAsk from '@/components/home/HomeAsk.vue';
import HomeInbox from '@/components/home/HomeInbox.vue';
import HomeProjects from '@/components/home/HomeProjects.vue';
import HomeToday from '@/components/home/HomeToday.vue';
import Dashboard from '@/pages/Dashboard.vue';
import { useAgentStore } from '@/store/agentStore';
import type { TaskItem } from '@/config/tables/TasksList';
import { readableInk } from '@/utils/readableColor';
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

  it('lists every star, not just one row', async () => {
    lists[SEND.TASK_LIST] = Array.from({ length: 10 }, (_, i) => ({ identifier: `t${i}`, name: `W${i}` }));
    const store = useStarredItemsStore();
    for (let i = 0; i < 10; i++) store.star('task', `t${i}`, `W${i}`);

    const wrapper = mount(HomeStarred, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    // The ten stars, then the Add to Starred tile.
    expect(tileNames(wrapper)).toHaveLength(10);
    expect(wrapper.text()).toContain('Add to Starred');
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

describe('HomeRecentActivity', () => {
  it('shows runs in the same day-grouped table as Recently opened', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    lists[SEND.PIPELINE_LIST] = [
      { identifier: 'r1', status: 'running', started_at: now.toISOString(), finished_at: null, task_name: 'Sync', task_identifier: 's' },
      { identifier: 'r2', status: 'failed', started_at: yesterday, finished_at: yesterday, task_name: 'Billing', task_identifier: 'b' },
    ];
    const router = makeRouter();
    const wrapper = mount(HomeRecentActivity, { global: { plugins: [i18n, router] } });
    await flushPromises();

    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['Workflow', 'Ran']);
    const groups = wrapper.findAll('tbody th').map((th) => th.text());
    expect(groups[0]).toBe('Today');
    expect(wrapper.text()).toContain('Running now');
    expect(wrapper.text()).toContain('Failed');

    await wrapper.findAll('tbody tr').find((tr) => tr.text().includes('Billing'))!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/tasks/b/pipelines/r2');
    wrapper.unmount();
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

  it('groups by the day they were opened, shows the project and last run, and filters by kind', async () => {
    const billing = { identifier: 'p1', name: 'Billing', color: '#0f766e' };
    lists[SEND.TASK_LIST] = [{ identifier: 't1', name: 'Send invoices', projects: [billing], last_run_status: 'failed' }];
    lists[SEND.APP_LIST] = [{ identifier: 'a1', name: 'Invoice desk', projects: [] }];
    const recent = useRecentItemsStore();
    recent.markOpened('app', 'a1', 'Invoice desk');
    recent.markOpened('task', 't1', 'Send invoices');
    // Opened two days ago: moved back in time by hand.
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    recent.items[1].openedAt = twoDaysAgo.toISOString();

    const wrapper = mount(HomeRecentItems, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Today');
    expect(text).toMatch(/Yesterday|Earlier this week/);
    expect(text).toContain('Billing');
    expect(wrapper.find('[title="Last run: Failed"]').exists()).toBe(true);

    await wrapper.findAll('[role="radio"]').find((b) => b.text() === 'Apps')!.trigger('click');
    expect(wrapper.findAll('button p.font-medium').map((p) => p.text())).toEqual(['Invoice desk']);
    expect(localStorage.getItem('tipeline:dashboard:recentFilter')).toBe('app');
  });
});

describe('HomeProjects', () => {
  const inProject = (id: string, status: TaskItem['last_run_status']) =>
    ({ identifier: `${id}-wf`, name: id, last_run_status: status, projects: [{ identifier: id, name: id, color: null }] }) as unknown as TaskItem;

  it('shows one tile per project, worst news first, recently opened projects first', async () => {
    lists[SEND.PROJECT_LIST] = [
      { identifier: 'big', name: 'Big project', color: '#1d4ed8', task_count: 9, app_count: 2 },
      { identifier: 'quiet', name: 'Quiet one', color: '#fde68a', task_count: 1, app_count: 0 },
      { identifier: 'fresh', name: 'Fresh', color: null, task_count: 0, app_count: 0 },
    ];
    useRecentItemsStore().markOpened('project', 'quiet', 'Quiet one');
    const tasks = [inProject('big', 'failed'), inProject('big', 'running'), inProject('quiet', 'completed')];

    const wrapper = mount(HomeProjects, { props: { tasks }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();

    const tiles = wrapper.findAll('button[data-project]');
    expect(tiles.map((b) => b.find('.font-medium.truncate').text())).toEqual(['Quiet one', 'Big project', 'Fresh']);
    expect(tiles[0].text()).toContain('All good');
    expect(tiles[1].text()).toContain('1 failed'); // the failure wins over the running run
    expect(tiles[1].text()).toContain('9 workflows · 2 apps');
    expect(tiles[2].text()).not.toMatch(/All good|failed|running|waiting/); // nothing has run: no news
    // The initials sit on the project's own color: dark ink on a light one, white on a dark one.
    const badge = (i: number) => tiles[i].find('span').attributes('style');
    expect(badge(0)).toContain('color: #0f172a');
    expect(badge(1)).toContain('color: #ffffff');
  });

  it('counts approvals waiting in a project', async () => {
    vi.mocked(invokeCore).mockResolvedValue([
      { pipelineIdentifier: 'p-1', taskIdentifier: 'hr-wf', workflowName: 'Onboard', title: 'Laptop?', details: null, requestedAt: '' },
    ]);
    await useApprovalsStore().refresh();
    lists[SEND.PROJECT_LIST] = [{ identifier: 'hr', name: 'HR', color: '#be185d', task_count: 1, app_count: 0 }];

    const wrapper = mount(HomeProjects, {
      props: { tasks: [inProject('hr', 'paused')] },
      global: { plugins: [i18n, makeRouter()] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('1 waiting');
  });

  it('says so when there are no projects', async () => {
    const wrapper = mount(HomeProjects, { props: { tasks: [] }, global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(wrapper.text()).toContain('No projects yet.');
  });
});

describe('readableInk', () => {
  it('picks white or dark text for a project color', () => {
    expect(readableInk('#1d4ed8')).toBe('#ffffff');
    expect(readableInk('#fde68a')).toBe('#0f172a');
    expect(readableInk('#fff')).toBe('#0f172a');
    expect(readableInk('tomato')).toBe('#ffffff'); // unknown formats keep white
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

    expect(wrapper.text()).toContain('Waiting for you1approval to review');
    expect(wrapper.text()).toContain('Next run2hSoon');
    expect(wrapper.find('[title="in about 2 hours"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Soon');
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
  const stubs = { HomeToday: true, HomeStarred: true, HomeRecentItems: true, HomeRecentActivity: true, HomeProjects: true };

  it('shows Home even on a new install with nothing in it yet', async () => {
    const home = mount(Dashboard, { global: { plugins: [i18n, makeRouter()], stubs } });
    await flushPromises();
    expect(home.text()).toMatch(/Good (morning|afternoon|evening)/);
    for (const name of ['HomeStarred', 'HomeRecentItems', 'HomeToday', 'HomeProjects', 'HomeRecentActivity']) {
      expect(home.findComponent({ name }).exists()).toBe(true);
    }
  });

  it('opens the inbox from the badge next to the greeting', async () => {
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
