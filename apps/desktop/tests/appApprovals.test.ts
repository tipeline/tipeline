// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { createPinia } from 'pinia';

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));
vi.mock('@/components/ui/sonner', () => ({ toast }));
vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { i18n } from '@/i18n';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import ApprovalsWidget from '@/components/app/widgets/ApprovalsWidget.vue';
import { APP_RUNTIME } from '@/components/app/appRuntimeKey';

const pending = [
  {
    pipelineIdentifier: 'p-1',
    taskIdentifier: 'wf-pay',
    workflowName: 'Pay',
    title: 'Pay INV-1?',
    details: '$40',
    requestedAt: '',
  },
  {
    pipelineIdentifier: 'p-2',
    taskIdentifier: 'wf-pay',
    workflowName: 'Pay',
    title: 'Pay INV-2?',
    details: null,
    requestedAt: '',
  },
];

function mountLive(
  props: Record<string, unknown> = {},
  runnables = reactive<Record<string, any>>({})
) {
  return mount(ApprovalsWidget, {
    props: { props, componentId: 'inbox' },
    global: {
      plugins: [i18n, createPinia()],
      provide: {
        [APP_RUNTIME as symbol]: { appIdentifier: () => 'app-1', runnables },
      },
    },
  });
}

describe('ApprovalsWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(invokeCore).mockReset();
    toast.error.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('lists the pending approvals of the app (optionally only some workflows)', async () => {
    vi.mocked(invokeCore).mockResolvedValue(pending);
    const wrapper = mountLive({ workflows: ['pay'] });
    await flushPromises();

    expect(invokeCore).toHaveBeenCalledWith(SEND.APP_APPROVAL_LIST, {
      appIdentifier: 'app-1',
      workflows: ['pay'],
    });
    expect(wrapper.text()).toContain('Pay INV-1?');
    expect(wrapper.text()).toContain('$40');
    expect(wrapper.text()).toContain('Pay INV-2?');
  });

  it('decides with the comment, drops the item and fires `decided` with the decision', async () => {
    vi.mocked(invokeCore)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ pipelineIdentifier: 'p-1', approved: false });
    const wrapper = mountLive();
    await flushPromises();

    await wrapper.findAll('textarea')[0].setValue('  too much ');
    const reject = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Reject')!;
    await reject.trigger('click');
    await flushPromises();

    expect(invokeCore).toHaveBeenLastCalledWith(SEND.APP_APPROVAL_DECIDE, {
      appIdentifier: 'app-1',
      pipelineIdentifier: 'p-1',
      approved: false,
      comment: 'too much',
    });
    expect(wrapper.text()).not.toContain('Pay INV-1?');
    expect(wrapper.emitted('event')).toEqual([
      [
        'decided',
        {
          lastDecision: {
            pipelineIdentifier: 'p-1',
            workflow: 'Pay',
            title: 'Pay INV-1?',
            approved: false,
            comment: 'too much',
          },
        },
      ],
    ]);
  });

  it('a failed decision is reported and the list is reloaded', async () => {
    vi.mocked(invokeCore)
      .mockResolvedValueOnce(pending)
      .mockRejectedValueOnce(new Error('This approval was already decided'))
      .mockResolvedValueOnce([pending[1]]);
    const wrapper = mountLive();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Approve')!
      .trigger('click');
    await flushPromises();

    expect(toast.error).toHaveBeenCalledWith('Could not record the decision', {
      description: 'This approval was already decided',
    });
    expect(wrapper.text()).not.toContain('Pay INV-1?');
    expect(wrapper.emitted('event')).toBeUndefined();
  });

  it('refreshes on an interval and when a run on the page finishes', async () => {
    vi.mocked(invokeCore).mockResolvedValue([]);
    const runnables = reactive<Record<string, any>>({
      submit: { isRunning: true },
    });
    const wrapper = mountLive({}, runnables);
    await flushPromises();
    expect(wrapper.text()).toContain('Nothing is waiting for approval.');
    expect(invokeCore).toHaveBeenCalledTimes(1);

    runnables.submit.isRunning = false;
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(15000);
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('in the builder it shows a sample and never calls core', async () => {
    const wrapper = mount(ApprovalsWidget, {
      props: { props: {}, editable: true },
      global: { plugins: [i18n, createPinia()] },
    });
    await flushPromises();
    expect(invokeCore).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Pay invoice INV-1042');
    expect(
      wrapper
        .findAll('button')
        .every((b) => b.attributes('disabled') !== undefined)
    ).toBe(true);
  });
});
