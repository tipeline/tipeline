// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { useApprovalsStore } from '@/store/approvalsStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useStreamStore } from '@/store/stream';
import ApprovalCard from '@/components/approvals/ApprovalCard.vue';

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  pipelineIdentifier: id,
  taskIdentifier: 'wf',
  workflowName: 'Pay',
  title: `Pay ${id}?`,
  details: null,
  requestedAt: '',
  ...extra,
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await nextTick();
};

describe('approvalsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.mocked(invokeCore).mockReset();
  });
  afterEach(() => {
    useApprovalsStore().stop();
    vi.useRealTimers();
  });

  it('announces only requests that appear after the first load', async () => {
    vi.mocked(invokeCore)
      .mockResolvedValueOnce([item('p-1')])
      .mockResolvedValueOnce([item('p-1'), item('p-2'), item('p-3')])
      .mockResolvedValueOnce([item('p-3')]);
    const announce = vi.fn();
    const store = useApprovalsStore();

    store.start(announce);
    await flush();
    expect(store.count).toBe(1);
    expect(announce).not.toHaveBeenCalled(); // already waiting when the app opened

    vi.advanceTimersByTime(30_000);
    await flush();
    expect(announce).toHaveBeenCalledWith([item('p-2'), item('p-3')]);
    expect(invokeCore).toHaveBeenCalledWith(SEND.APPROVAL_LIST, {});

    vi.advanceTimersByTime(30_000);
    await flush();
    expect(store.count).toBe(1);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('checks again as soon as a run ends — it may have just paused', async () => {
    vi.mocked(invokeCore).mockResolvedValue([]);
    const store = useApprovalsStore();
    store.start();
    await flush();
    expect(invokeCore).toHaveBeenCalledTimes(1);

    useStreamStore().addEvent({
      type: 'action',
      correlationId: 'c',
      taskIdentifier: '',
      pipelineIdentifier: 'p',
      timestamp: 1,
    });
    await flush();
    expect(invokeCore).toHaveBeenCalledTimes(1);

    useStreamStore().addEvent({
      type: 'end',
      correlationId: 'c',
      taskIdentifier: '',
      pipelineIdentifier: 'p',
      timestamp: 2,
    });
    await flush();
    expect(invokeCore).toHaveBeenCalledTimes(2);
  });

  it('on a server workspace, counts and announces only requests this user may decide', async () => {
    vi.mocked(invokeCore)
      .mockResolvedValueOnce([item('p-1', { canDecide: true })])
      .mockResolvedValueOnce([
        item('p-1', { canDecide: true }),
        item('p-2', { canDecide: false }),
        item('p-3', { canDecide: true }),
      ]);
    const announce = vi.fn();
    const store = useApprovalsStore();
    store.start(announce);
    await flush();

    vi.advanceTimersByTime(30_000);
    await flush();
    expect(store.items).toHaveLength(3);
    expect(store.count).toBe(2);
    expect(announce).toHaveBeenCalledWith([item('p-3', { canDecide: true })]);
  });

  it('switching workspace starts a new list without announcing what is already there', async () => {
    vi.mocked(invokeCore)
      .mockResolvedValueOnce([item('p-1')])
      .mockResolvedValueOnce([item('r-1'), item('r-2')]);
    const announce = vi.fn();
    const store = useApprovalsStore();
    store.start(announce);
    await flush();

    useConnectionStore().$patch({ activeId: 'remote-1' } as any);
    await flush();
    expect(store.items.map((i) => i.pipelineIdentifier)).toEqual([
      'r-1',
      'r-2',
    ]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('decides as "desktop" and drops the item', async () => {
    vi.mocked(invokeCore)
      .mockResolvedValueOnce([item('p-1'), item('p-2')])
      .mockResolvedValueOnce({})
      .mockResolvedValue([item('p-2')]);
    const store = useApprovalsStore();
    await store.refresh();

    await store.decide(store.items[0], false, 'too much');

    expect(invokeCore).toHaveBeenCalledWith(SEND.APPROVAL_DECIDE, {
      pipelineIdentifier: 'p-1',
      approved: false,
      comment: 'too much',
      decidedBy: 'desktop',
    });
    expect(store.items.map((i) => i.pipelineIdentifier)).toEqual(['p-2']);
    expect(store.deciding).toBeNull();
  });
});

describe('ApprovalCard', () => {
  it('says when a request with a timeout is decided automatically, and how', () => {
    const inTwoDays = new Date(
      Date.now() + 2 * 86_400_000 + 60_000
    ).toISOString();
    const reject = mount(ApprovalCard, {
      props: {
        item: item('p-1', { expiresAt: inTwoDays, onTimeout: 'reject' }),
      },
      global: { plugins: [i18n] },
    });
    expect(reject.text()).toContain('Rejected automatically in 2 days');

    const approve = mount(ApprovalCard, {
      props: {
        item: item('p-1', {
          expiresAt: inTwoDays,
          onTimeout: 'approve',
          trigger: { type: 'app', appName: 'Expenses' },
        }),
      },
      global: { plugins: [i18n] },
    });
    expect(approve.text()).toContain('Approved automatically in 2 days');
    expect(approve.text()).toContain('from Expenses');
  });

  it("says who may decide instead of offering buttons to someone who can't", () => {
    const card = mount(ApprovalCard, {
      props: {
        item: item('p-1', {
          canDecide: false,
          approvers: ['admin', 'finance@acme.com'],
        }),
      },
      global: { plugins: [i18n] },
    });
    expect(card.text()).toContain(
      'Only admin, finance@acme.com can decide this approval.'
    );
    expect(card.findAll('button')).toHaveLength(0);
    expect(card.find('textarea').exists()).toBe(false);

    const allowed = mount(ApprovalCard, {
      props: { item: item('p-1', { canDecide: true, approvers: ['admin'] }) },
      global: { plugins: [i18n] },
    });
    expect(allowed.text()).toContain('Approvers: admin');
    expect(allowed.findAll('button')).toHaveLength(2);
  });

  it('explains the four-eyes rule to the person who started the run', () => {
    const card = mount(ApprovalCard, {
      props: {
        item: item('p-1', {
          canDecide: false,
          blockedBy: 'requester',
          requestedBy: 'ed@acme.com',
        }),
      },
      global: { plugins: [i18n] },
    });
    expect(card.text()).toContain('started by ed@acme.com');
    expect(card.text()).toContain(
      'You started this run, so someone else has to decide it.'
    );
    expect(card.findAll('button')).toHaveLength(0);
  });

  it('emits the decision with the trimmed comment', async () => {
    const card = mount(ApprovalCard, {
      props: { item: item('p-1') },
      global: { plugins: [i18n] },
    });
    await card.find('textarea').setValue('  ok  ');
    await card
      .findAll('button')
      .find((b) => b.text() === 'Approve')!
      .trigger('click');
    expect(card.emitted('decide')).toEqual([[true, 'ok']]);
  });
});

describe('stream store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("forgets a deleted workflow's runs, including events that don't name the workflow", () => {
    const stream = useStreamStore();
    const ev = (type: any, pipelineIdentifier: string, taskIdentifier = '') =>
      stream.addEvent({
        type,
        correlationId: 'c',
        taskIdentifier,
        pipelineIdentifier,
        timestamp: 1,
      });
    ev('start', 'p-1', 'wf-deleted');
    ev('action', 'p-1');
    ev('end', 'p-1', 'wf-deleted');
    ev('start', 'p-2', 'wf-kept');
    ev('action', 'p-2');

    stream.removeEventsForTask('wf-deleted');

    expect(stream.events.map((e) => e.pipelineIdentifier)).toEqual([
      'p-2',
      'p-2',
    ]);
  });
});
