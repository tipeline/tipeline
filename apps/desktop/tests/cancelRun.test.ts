// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/components/ui/sonner', () => ({ toast }));
vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { i18n } from '@/i18n';
import { invokeCore } from '@/utils/invoke';
import { useCancelStore } from '@/store/cancelStore';
import { useStreamStore } from '@/store/stream';
import { useConnectionStore } from '@/store/connectionStore';
import CancelRunButton from '@/components/CancelRunButton.vue';

const end = (e: Partial<{ type: string; pipelineIdentifier: string; correlationId: string }>) =>
  useStreamStore().addEvent({
    type: 'end',
    correlationId: '',
    taskIdentifier: '',
    pipelineIdentifier: '',
    timestamp: Date.now(),
    ...e,
  } as any);

describe('cancel store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invokeCore).mockReset();
  });

  it('keeps a running run "canceling" until its end arrives', async () => {
    vi.mocked(invokeCore).mockResolvedValue({ status: 'canceling' });
    const store = useCancelStore();
    const target = { pipelineIdentifier: 'p-1' };

    expect(await store.cancel(target)).toBe('canceling');
    expect(invokeCore).toHaveBeenCalledWith('pipelineCancel', { ...target, canceledBy: 'desktop' });
    expect(store.isCanceling(target)).toBe(true);

    end({ pipelineIdentifier: 'p-other' });
    await nextTick();
    expect(store.isCanceling(target)).toBe(true);
    end({ pipelineIdentifier: 'p-1' });
    await nextTick();
    expect(store.isCanceling(target)).toBe(false);
  });

  it('a run named by its request ends with that request', async () => {
    vi.mocked(invokeCore).mockResolvedValue({ status: 'canceling' });
    const store = useCancelStore();
    await store.cancel({ correlationId: 'c-1' });

    end({ type: 'end_all', correlationId: 'c-1' });
    await nextTick();
    expect(store.isCanceling({ correlationId: 'c-1' })).toBe(false);
  });

  it('is done right away when canceled or already over, and forgets a failed request', async () => {
    const store = useCancelStore();
    vi.mocked(invokeCore).mockResolvedValueOnce({ status: 'canceled' });
    expect(await store.cancel({ pipelineIdentifier: 'p-1' })).toBe('canceled');
    vi.mocked(invokeCore).mockResolvedValueOnce({ status: 'not_running' });
    expect(await store.cancel({ pipelineIdentifier: 'p-2' })).toBe('not_running');
    vi.mocked(invokeCore).mockRejectedValueOnce(new Error('Run not found'));
    await expect(store.cancel({ pipelineIdentifier: 'p-3' })).rejects.toThrow('Run not found');

    expect(store.pending.size).toBe(0);
  });
});

describe('CancelRunButton', () => {
  let pinia: ReturnType<typeof createPinia>;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.mocked(invokeCore).mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    document.body.innerHTML = '';
  });

  const mountButton = (props: Record<string, unknown> = {}) =>
    mount(CancelRunButton, {
      props: { target: { pipelineIdentifier: 'p-1' }, ...props },
      global: { plugins: [i18n, pinia] },
      attachTo: document.body,
    });

  it('asks first, then cancels and reports how it went', async () => {
    vi.mocked(invokeCore).mockResolvedValue({ status: 'canceled' });
    const wrapper = mountButton({ waiting: true });

    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Cancel this run?');
    expect(document.body.textContent).toContain('waiting for an approval');
    expect(invokeCore).not.toHaveBeenCalled();

    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancel run' && b !== wrapper.find('button').element
    )!;
    confirm.click();
    await flushPromises();

    expect(invokeCore).toHaveBeenCalledWith('pipelineCancel', {
      pipelineIdentifier: 'p-1',
      canceledBy: 'desktop',
    });
    expect(toast.success).toHaveBeenCalledWith('Run canceled');
    expect(wrapper.emitted('done')).toEqual([['canceled']]);
    wrapper.unmount();
  });

  it('shows "Canceling…" while the run is stopping, in every view of it', async () => {
    useCancelStore().pending.add('p:p-1');
    const wrapper = mountButton({ variant: 'link' });
    expect(wrapper.text()).toContain('Canceling…');
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });

  it('is hidden from viewers of a server workspace', async () => {
    const connection = useConnectionStore();
    connection.activeId = 'ws-1';
    connection.serverMe = { id: 'u', email: 'v@acme.com', role: 'viewer' } as any;
    const wrapper = mountButton();
    expect(wrapper.find('button').exists()).toBe(false);

    connection.serverMe = { id: 'u', email: 'e@acme.com', role: 'editor' } as any;
    await nextTick();
    expect(wrapper.find('button').exists()).toBe(true);
    wrapper.unmount();
  });
});
