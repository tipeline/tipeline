// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';

const invokeCore = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
vi.mock('@/utils/invoke', () => ({ invokeCore }));
vi.mock('@/components/ui/sonner', () => ({ toast }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import TaskAlertsCard from '@/components/task/TaskAlertsCard.vue';
import { SEND } from '@/ipc-channels';

const alert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  taskIdentifier: 'wf',
  workflowName: 'Health',
  pipelineIdentifier: null,
  key: 'k',
  title: 'ticoguide.com: 6 problems',
  message: null,
  level: 'critical',
  status: 'dismissed',
  count: 3,
  firstRaisedAt: '2026-11-23T07:11:03.000Z',
  lastRaisedAt: '2026-11-24T03:56:35.000Z',
  closedAt: '2026-11-23T08:00:00.000Z',
  closedBy: 'desktop',
  ...over,
});

let rows: any[] = [];

async function mountCard() {
  invokeCore.mockImplementation(async (channel: string) => {
    if (channel === SEND.ALERT_LIST) return rows;
    if (channel === SEND.ALERT_REOPEN) {
      rows = rows.map((r) => ({ ...r, status: 'open', closedAt: null, closedBy: null }));
      return { reopened: true };
    }
    return {};
  });
  const wrapper = mount(TaskAlertsCard, {
    props: { taskIdentifier: 'wf', bare: true },
    global: { plugins: [i18n] },
  });
  await flushPromises();
  return wrapper;
}

describe('TaskAlertsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('says a dismissed alert was raised again since, quietly', async () => {
    rows = [alert()];
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain('Dismissed, raised again since: kept quiet');
  });

  it('a dismissed alert not raised since keeps the plain acknowledged line', async () => {
    rows = [alert({ lastRaisedAt: '2026-11-23T07:11:03.000Z' })];
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain('Dismissed: stays quiet until');
    expect(wrapper.text()).not.toContain('raised again since');
  });

  it('Dismiss says what it means in a toast, and Undo puts it back', async () => {
    rows = [alert({ status: 'open', closedAt: null, closedBy: null })];
    const toastFn = vi.mocked(toast as any);
    const wrapper = await mountCard();
    rows = [alert()];
    await wrapper.findAll('button').find((b) => b.text() === 'Dismiss')!.trigger('click');
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledWith(SEND.ALERT_DISMISS, { id: 'a1', dismissedBy: 'desktop' });
    const [title, options] = toastFn.mock.calls[0];
    expect(title).toBe('Alert dismissed');
    expect(options.description).toBe('It stays quiet unless it gets worse or the workflow resolves it.');

    await options.action.onClick();
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledWith(SEND.ALERT_REOPEN, { id: 'a1' });
    expect(wrapper.findAll('button').some((b) => b.text() === 'Dismiss')).toBe(true);
  });

  it('Reopen confirms with a toast and the row turns into Dismiss', async () => {
    rows = [alert()];
    const wrapper = await mountCard();
    const reopen = wrapper.findAll('button').find((b) => b.text() === 'Reopen')!;
    await reopen.trigger('click');
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledWith(SEND.ALERT_REOPEN, { id: 'a1' });
    expect(toast.success).toHaveBeenCalledWith('Alert reopened', {
      description: "It's back on the dashboard, under Needs you.",
    });
    expect(wrapper.findAll('button').some((b) => b.text() === 'Dismiss')).toBe(true);
  });
});
