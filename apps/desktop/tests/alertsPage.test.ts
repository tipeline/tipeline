// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { h } from 'vue';

const invokeCore = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
);
vi.mock('@/utils/invoke', () => ({ invokeCore }));
vi.mock('@/components/ui/sonner', () => ({ toast }));

import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import Alerts from '@/pages/Alerts.vue';
import { workflowBadges, type TaskItem } from '@/config/tables/TasksList';
import { messagePreview } from '@/config/tables/AlertsList';
import type { AlertItem } from '@/store/alertsStore';

const minutesAgo = (n: number) =>
  new Date(Date.now() - n * 60_000).toISOString();
const alert = (id: string, over: Partial<AlertItem> = {}): AlertItem => ({
  id,
  taskIdentifier: 'health',
  workflowName: 'Drupal health',
  pipelineIdentifier: 'run-1',
  key: id,
  title: `Alert ${id}`,
  message: null,
  level: 'warning',
  status: 'open',
  count: 1,
  firstRaisedAt: minutesAgo(60),
  lastRaisedAt: minutesAgo(5),
  closedAt: null,
  closedBy: null,
  ...over,
});

let rows: AlertItem[] = [];

async function mountPage(path = '/alerts') {
  invokeCore.mockImplementation(async (channel: string, params: any) => {
    if (channel === SEND.ALERT_LIST) {
      return params?.includeClosed
        ? rows
        : rows.filter((a) => a.status === 'open');
    }
    if (channel === SEND.ALERT_DISMISS) {
      const ids = new Set(params.ids ?? [params.id]);
      rows = rows.map((a) =>
        ids.has(a.id)
          ? {
              ...a,
              status: 'dismissed',
              closedAt: new Date().toISOString(),
              closedBy: 'desktop',
            }
          : a
      );
      return { dismissed: ids.size };
    }
    if (channel === SEND.ALERT_REOPEN) {
      rows = rows.map((a) =>
        a.id === params.id
          ? { ...a, status: 'open', closedAt: null, closedBy: null }
          : a
      );
      return { reopened: true };
    }
    if (channel === SEND.ALERT_RESOLVE) {
      const ids = new Set(params.ids);
      rows = rows.map((a) =>
        ids.has(a.id)
          ? {
              ...a,
              status: 'resolved',
              closedAt: new Date().toISOString(),
              closedBy: params.resolvedBy,
            }
          : a
      );
      return { resolved: ids.size };
    }
    return [];
  });
  const stub = { render: () => h('div') };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/alerts', component: stub },
      { path: '/tasks/:tid', component: stub },
      {
        path: '/tasks/:tid/pipelines/:pipelineId',
        name: 'PipelineDetail',
        component: stub,
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(Alerts, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  });
  await flushPromises();
  return { wrapper, router };
}

const button = (wrapper: any, text: string) =>
  wrapper.findAll('button').find((b: any) => b.text().trim() === text);

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  try {
    localStorage.clear();
  } catch {
    // not needed when storage is unavailable
  }
  document.body.innerHTML = '';
});

describe('Alerts page', () => {
  it('opens on Open with counts per tab; resolved ones wait on their tab', async () => {
    rows = [
      alert('a', { count: 7, level: 'critical' }),
      alert('b', {
        status: 'dismissed',
        closedAt: minutesAgo(30),
        closedBy: 'desktop',
      }),
      alert('c', {
        status: 'resolved',
        closedAt: minutesAgo(10),
        closedBy: 'workflow',
      }),
    ];
    const { wrapper } = await mountPage();
    expect(wrapper.get('[data-testid="alerts-tab-open"]').text()).toContain(
      '1'
    );
    expect(
      wrapper.get('[data-testid="alerts-tab-dismissed"]').text()
    ).toContain('1');
    const text = wrapper.text();
    expect(text).toContain('Alert a');
    expect(text).toContain('×7');
    expect(text).not.toContain('Alert b');
    expect(text).not.toContain('Alert c');
  });

  it('the Dismissed tab says when one is still happening and who dismissed it', async () => {
    rows = [
      alert('b', {
        status: 'dismissed',
        closedAt: minutesAgo(30),
        closedBy: 'desktop',
      }),
    ];
    const { wrapper } = await mountPage('/alerts?tab=dismissed');
    const text = wrapper.text();
    expect(text).toContain('Alert b');
    expect(text).toContain('by you');
    expect(text).toContain('Still happening');
    expect(button(wrapper, 'Reopen')).toBeTruthy();
  });

  it('?workflow= shows only that workflow', async () => {
    rows = [
      alert('a'),
      alert('z', { taskIdentifier: 'other', workflowName: 'Other' }),
    ];
    const { wrapper } = await mountPage('/alerts?workflow=other');
    expect(wrapper.text()).toContain('Alert z');
    expect(wrapper.text()).not.toContain('Alert a');
  });

  it('bulk Dismiss sends the ticked ids in one call, with one toast and Undo', async () => {
    rows = [alert('a'), alert('b'), alert('c')];
    const { wrapper } = await mountPage();
    // The header box ticks every row the filters show.
    await wrapper
      .get('thead [role="checkbox"], thead button[role="checkbox"]')
      .trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="alerts-bulk-dismiss"]').trigger('click');
    await flushPromises();

    const call = invokeCore.mock.calls.find(
      ([channel]) => channel === SEND.ALERT_DISMISS
    );
    expect(call?.[1]).toMatchObject({ dismissedBy: 'desktop' });
    expect([...call![1].ids].sort()).toEqual(['a', 'b', 'c']);
    const [title, options] = toast.mock.calls[0];
    expect(title).toBe('3 alerts dismissed');
    expect(wrapper.find('[data-testid="alerts-empty"]').text()).toContain(
      'No open alerts'
    );

    await options.action.onClick();
    await flushPromises();
    expect(
      invokeCore.mock.calls.filter(([channel]) => channel === SEND.ALERT_REOPEN)
    ).toHaveLength(3);
  });

  it('Resolve on a row closes it as by you, and it moves to Resolved', async () => {
    rows = [alert('a'), alert('b')];
    const { wrapper } = await mountPage();
    await button(wrapper, 'Resolve').trigger('click');
    await flushPromises();
    const call = invokeCore.mock.calls.find(
      ([channel]) => channel === SEND.ALERT_RESOLVE
    );
    expect(call?.[1]).toEqual({
      ids: [expect.any(String)],
      resolvedBy: 'desktop',
    });
    expect(toast.success).toHaveBeenCalledWith('1 alert resolved', {
      description:
        "If the problem comes back, it's a new alert and you'll be notified.",
    });
    expect(wrapper.get('[data-testid="alerts-tab-open"]').text()).toContain(
      '1'
    );

    wrapper.unmount();
    const resolved = (await mountPage('/alerts?tab=resolved')).wrapper;
    expect(resolved.text()).toContain('by you');
    expect(button(resolved, 'Resolve')).toBeUndefined();
  });

  it('bulk Resolve works on the Dismissed tab too', async () => {
    rows = [
      alert('a', { status: 'dismissed', closedAt: minutesAgo(30) }),
      alert('b', { status: 'dismissed', closedAt: minutesAgo(30) }),
    ];
    const { wrapper } = await mountPage('/alerts?tab=dismissed');
    await wrapper
      .get('thead [role="checkbox"], thead button[role="checkbox"]')
      .trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="alerts-bulk-resolve"]').trigger('click');
    await flushPromises();
    const call = invokeCore.mock.calls.find(
      ([channel]) => channel === SEND.ALERT_RESOLVE
    );
    expect([...call![1].ids].sort()).toEqual(['a', 'b']);
    expect(wrapper.find('[data-testid="alerts-empty"]').text()).toContain(
      'No dismissed alerts'
    );
  });

  it('two workflows with the same name are told apart; Resolved shows its count', async () => {
    // What happened on 2026-11-24: one copy resolved by hand then raised again, the other resolved.
    rows = [
      alert('old', {
        taskIdentifier: 'dELs8EkbW3',
        workflowName: 'Drupal health',
        key: 'drupal-health-site',
        status: 'resolved',
        count: 8,
        closedAt: minutesAgo(20),
        closedBy: 'desktop',
      }),
      alert('new', {
        taskIdentifier: 'dELs8EkbW3',
        workflowName: 'Drupal health',
        key: 'drupal-health-site',
        firstRaisedAt: minutesAgo(19),
        lastRaisedAt: minutesAgo(19),
      }),
      alert('copy', {
        taskIdentifier: 'tD-voXZKSp',
        workflowName: 'Drupal health',
        key: 'drupal-health-site',
        status: 'resolved',
        closedAt: minutesAgo(5),
        closedBy: 'desktop',
      }),
    ];
    const { wrapper } = await mountPage('/alerts?tab=resolved');
    expect(wrapper.get('[data-testid="alerts-tab-resolved"]').text()).toContain(
      '2'
    );
    const text = wrapper.text();
    expect(text).toContain('Drupal health · dELs8');
    expect(text).toContain('Drupal health · tD-vo');

    // Only the resolved one whose problem came back links to the new alert.
    const links = wrapper.findAll('[data-testid="alert-came-back"]');
    expect(links).toHaveLength(1);
    expect(links[0].text()).toBe('Came back: new alert open');
    await links[0].trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Alert new');
    const marked = wrapper.findAll('tr[data-state="selected"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].text()).toContain('Alert new');
  });

  it('one workflow per name keeps the plain name', async () => {
    rows = [alert('a')];
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('Drupal health');
    expect(wrapper.text()).not.toContain('Drupal health ·');
  });

  it('Open run goes to the latest run that raised it', async () => {
    rows = [alert('a', { pipelineIdentifier: 'run-9' })];
    const { wrapper, router } = await mountPage();
    await button(wrapper, 'Open run').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(
      '/tasks/health/pipelines/run-9'
    );
  });
});

describe('alert bits', () => {
  it('a message preview is its first line without Markdown marks', () => {
    expect(messagePreview('**ticoguide.com: 6 problems**\n- 🔴 down')).toBe(
      'ticoguide.com: 6 problems'
    );
    expect(messagePreview('\n\n# Heading\n')).toBe('Heading');
    expect(messagePreview(null)).toBe('');
  });

  it('a workflow with open alerts gets a bell badge with the count', () => {
    const t = i18n.global.t as any;
    const one = workflowBadges(
      { open_alerts: { count: 1, level: 'critical' } } as TaskItem,
      t
    );
    expect(one).toHaveLength(1);
    expect((one[0] as any).props.title).toBe('1 open alert');
    const many = workflowBadges(
      { open_alerts: { count: 3, level: 'warning' } } as TaskItem,
      t
    );
    expect((many[0] as any).props.title).toBe('3 open alerts');
    expect(workflowBadges({ open_alerts: null } as TaskItem, t)).toHaveLength(
      0
    );
  });
});
