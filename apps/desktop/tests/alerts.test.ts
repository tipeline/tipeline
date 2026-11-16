// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { format } from 'date-fns';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { useAlertsStore, type AlertItem } from '@/store/alertsStore';
import HomeNeedsYou from '@/components/home/HomeNeedsYou.vue';

const alert = (id: string, extra: Partial<AlertItem> = {}): AlertItem => ({
  id,
  taskIdentifier: 'traffic',
  workflowName: 'Traffic report',
  pipelineIdentifier: 'run-3',
  key: id,
  title: `Traffic spike: ${id}`,
  message: null,
  level: 'warning',
  status: 'open',
  count: 1,
  firstRaisedAt: new Date().toISOString(),
  lastRaisedAt: new Date().toISOString(),
  closedAt: null,
  closedBy: null,
  ...extra,
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await nextTick();
};

function makeRouter() {
  const stub = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      {
        path: '/tasks/:tid/pipelines/:pipelineId',
        name: 'PipelineDetail',
        component: stub,
      },
      { path: '/:rest(.*)*', component: stub },
    ],
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(invokeCore).mockReset();
});

describe('alertsStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useAlertsStore().stop();
    vi.useRealTimers();
  });

  it('announces loud alerts that appear after the first load, not repeats or info ones', async () => {
    vi.mocked(invokeCore)
      .mockResolvedValueOnce([alert('a')])
      .mockResolvedValueOnce([
        alert('a', { count: 2 }),
        alert('b'),
        alert('c', { level: 'info' }),
      ]);
    const announce = vi.fn();
    const store = useAlertsStore();

    store.start(announce);
    await flush();
    expect(announce).not.toHaveBeenCalled(); // already open when the app opened
    expect(invokeCore).toHaveBeenCalledWith(SEND.ALERT_LIST, {});

    vi.advanceTimersByTime(30_000);
    await flush();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0][0].map((a: AlertItem) => a.id)).toEqual([
      'b',
    ]);
    // Info alerts are listed but not counted.
    expect(store.items).toHaveLength(3);
    expect(store.count).toBe(2);
  });

  it('announces again when an alert gets louder', async () => {
    vi.mocked(invokeCore)
      .mockResolvedValueOnce([alert('a')])
      .mockResolvedValueOnce([alert('a', { level: 'critical', count: 2 })]);
    const announce = vi.fn();
    const store = useAlertsStore();
    store.start(announce);
    await flush();
    vi.advanceTimersByTime(30_000);
    await flush();
    expect(announce.mock.calls[0][0][0]).toMatchObject({
      id: 'a',
      level: 'critical',
    });
  });

  it('dismiss removes it at once and tells Core', async () => {
    const store = useAlertsStore();
    vi.mocked(invokeCore).mockResolvedValueOnce([alert('a'), alert('b')]);
    await store.refresh();
    vi.mocked(invokeCore).mockResolvedValue([alert('b')]);

    await store.dismiss({ id: 'a' });
    expect(invokeCore).toHaveBeenCalledWith(SEND.ALERT_DISMISS, {
      id: 'a',
      dismissedBy: 'desktop',
    });
    expect(store.items.map((a) => a.id)).toEqual(['b']);
  });
});

describe('HomeNeedsYou alert rows', () => {
  async function mountWith(alerts: AlertItem[]) {
    vi.mocked(invokeCore).mockImplementation(async (channel: string) =>
      channel === SEND.ALERT_LIST ? alerts : []
    );
    await useAlertsStore().refresh();
    const router = makeRouter();
    await router.push('/');
    const card = mount(HomeNeedsYou, {
      props: { tasks: [], schedules: [] },
      global: { plugins: [i18n, router] },
    });
    return { card, router };
  }

  it('shows the alert with its workflow, how often and since when', async () => {
    const since = new Date();
    since.setHours(9, 0, 0, 0);
    const { card } = await mountWith([
      alert('acme', {
        count: 3,
        firstRaisedAt: since.toISOString(),
        message: '1240 visits in the last hour',
      }),
    ]);
    const text = card.text();
    expect(text).toContain('Alert');
    expect(text).toContain('Traffic spike: acme');
    expect(text).toContain(
      `Traffic report · ×3 since ${format(since, 'HH:mm')} · 1240 visits in the last hour`
    );
    // Warning counts in the badge.
    expect(card.find('h2').text()).toContain('1');
  });

  it('See run opens the latest run that raised it', async () => {
    const { card, router } = await mountWith([alert('acme')]);
    await card
      .findAll('button')
      .find((b) => b.text() === 'See run')!
      .trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(
      '/tasks/traffic/pipelines/run-3'
    );
  });

  it('without a saved run it opens the workflow', async () => {
    const { card, router } = await mountWith([
      alert('acme', { pipelineIdentifier: null }),
    ]);
    await card
      .findAll('button')
      .find((b) => b.text() === 'Open workflow')!
      .trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/tasks/traffic');
  });

  it('Dismiss acknowledges it and the list is clear', async () => {
    const { card } = await mountWith([alert('acme')]);
    vi.mocked(invokeCore).mockImplementation(async () => []);
    await card
      .findAll('button')
      .find((b) => b.text() === 'Dismiss')!
      .trigger('click');
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledWith(SEND.ALERT_DISMISS, {
      id: 'acme',
      dismissedBy: 'desktop',
    });
    expect(card.text()).toContain('All clear: nothing needs you');
  });

  it('an info alert is listed but not counted', async () => {
    const { card } = await mountWith([alert('note', { level: 'info' })]);
    expect(card.text()).toContain('Traffic spike: note');
    expect(card.find('h2').text()).toBe('Needs you');
  });
});
