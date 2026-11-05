// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { useApprovalsStore } from '@/store/approvalsStore';
import HomeInbox from '@/components/home/HomeInbox.vue';
import Approvals from '@/pages/Approvals.vue';

const pending = (id: string, extra: Record<string, unknown> = {}) => ({
  pipelineIdentifier: id,
  taskIdentifier: 'wf',
  workflowName: 'Pay',
  title: `Pay ${id}?`,
  details: null,
  requestedAt: '',
  ...extra,
});

function makeRouter() {
  const stub = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/approvals', component: stub },
      { path: '/activity', component: stub },
      { path: '/tasks/:tid', component: stub },
      { path: '/tasks/:tid/pipelines/:pid', component: stub },
    ],
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(invokeCore).mockReset();
  try {
    localStorage.clear();
  } catch {
    // not needed when storage is unavailable
  }
});

describe('HomeInbox', () => {
  it('lists approvals the user can decide first, then failed workflows', async () => {
    vi.mocked(invokeCore).mockResolvedValue([
      pending('p-1'),
      pending('p-2', { canDecide: false }),
    ]);
    await useApprovalsStore().refresh();
    const router = makeRouter();

    const card = mount(HomeInbox, {
      props: {
        tasks: [
          {
            identifier: 'wf-x',
            name: 'Nightly sync',
            last_run_status: 'failed',
            last_run_at: new Date().toISOString(),
          } as any,
        ],
      },
      global: { plugins: [i18n, router] },
    });

    const text = card.text();
    expect(text).toContain('Waiting for your approval (1)');
    expect(text).toContain('Pay p-1?');
    expect(text).not.toContain('Pay p-2?'); // someone else's to decide
    expect(text).toContain('Last run failed (1)');
    expect(text.indexOf('Pay p-1?')).toBeLessThan(text.indexOf('Nightly sync'));

    await card
      .findAll('button')
      .find((b) => b.text() === 'Review')!
      .trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/approvals');
  });

  it('says nothing needs you when there is neither', () => {
    const card = mount(HomeInbox, {
      props: { tasks: [] },
      global: { plugins: [i18n, makeRouter()] },
    });
    expect(card.text()).toContain('Nothing needs you right now.');
  });
});

describe('Approvals page', () => {
  it('shows decided approvals on the Decided tab, opened from the URL', async () => {
    vi.mocked(invokeCore).mockImplementation(async (channel: string) =>
      channel === SEND.APPROVAL_HISTORY
        ? [
            {
              key: 'k',
              pipelineIdentifier: 'p-9',
              taskIdentifier: 'wf',
              workflowName: 'Pay',
              title: 'Pay INV-9?',
              requestedAt: null,
              approved: false,
              comment: 'too much',
              decidedBy: 'timeout',
              decidedAt: new Date().toISOString(),
            },
          ]
        : []
    );
    const router = makeRouter();
    router.addRoute({ path: '/approvals-page', component: Approvals });
    await router.push('/approvals-page?tab=decided');

    const page = mount(Approvals, { global: { plugins: [i18n, router] } });
    await flushPromises();

    expect(invokeCore).toHaveBeenCalledWith(SEND.APPROVAL_HISTORY, {});
    const text = page.text();
    expect(text).toContain('Pay INV-9?');
    expect(text).toContain('Rejected');
    expect(text).toContain('Automatic (timeout)');
    expect(text).toContain('No one (timed out)');
    expect(text).toContain('too much');
  });
});

describe('run history', () => {
  it('shows a run canceled by a rejected approval as Canceled, with who rejected it and why', async () => {
    const { createColumns } = await import('@/config/tables/TaskHistoryTab');
    const { ref } = await import('vue');
    const DataTable = (await import('@/components/DataTable.vue')).default;
    const t = (key: string) => i18n.global.t(key);
    const columns = createColumns(
      t as any,
      makeRouter(),
      'wf',
      () => {},
      ref(null),
      () => {},
      ref(null)
    );
    const table = mount(DataTable, {
      props: {
        columns,
        data: [
          {
            identifier: 'p-1',
            status: 'canceled',
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            metadata: {
              reason: 'approval_rejected',
              message: 'Rejected by ed@acme.com: too much',
            },
          },
        ],
        hiddenColumns: ['status'],
      },
      global: { plugins: [i18n, makeRouter()] },
    });
    expect(table.text()).toContain('Canceled');
    expect(table.text()).toContain('Rejected by ed@acme.com: too much');
    expect(table.text()).not.toContain('Resume');
  });
});
