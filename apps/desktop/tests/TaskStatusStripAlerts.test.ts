// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';

const invokeCore = vi.hoisted(() => vi.fn());
vi.mock('@/utils/invoke', () => ({ invokeCore }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import TaskStatusStrip from '@/components/task/TaskStatusStrip.vue';
import { SEND } from '@/ipc-channels';

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const alert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  taskIdentifier: 'wf',
  workflowName: 'Health',
  pipelineIdentifier: null,
  key: 'k',
  title: 'ticoguide.com: 6 problems, critical',
  message: null,
  level: 'critical',
  status: 'open',
  count: 7,
  firstRaisedAt: minutesAgo(600),
  lastRaisedAt: minutesAgo(1),
  closedAt: null,
  closedBy: null,
  ...over,
});

async function tile(alerts: any[]) {
  invokeCore.mockImplementation(async (channel: string) =>
    channel === SEND.ALERT_LIST ? alerts : []
  );
  const wrapper = mount(TaskStatusStrip, {
    props: { taskIdentifier: 'wf', taskName: 'Health', draft: false },
    global: { plugins: [i18n], stubs: { Dialog: true } },
  });
  await flushPromises();
  return wrapper.get('[data-testid="strip-alerts"]').text();
}

describe('Overview alerts tile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('an open alert says it needs you, how many times it was raised and when', async () => {
    const text = await tile([alert()]);
    expect(text).toContain('1 needs you');
    expect(text).toContain('×7 · 1 minute ago · ticoguide.com: 6 problems, critical');
  });

  it('a dismissed alert raised since says it is still happening, not "None"', async () => {
    const text = await tile([
      alert({ status: 'dismissed', closedAt: minutesAgo(30), lastRaisedAt: minutesAgo(2) }),
    ]);
    expect(text).toContain('1 dismissed');
    expect(text).toContain('Still happening: raised again 2 minutes ago');
    expect(text).not.toContain('None');
  });

  it('a dismissed alert not raised since stays quiet', async () => {
    const text = await tile([
      alert({ status: 'dismissed', closedAt: minutesAgo(1), lastRaisedAt: minutesAgo(30) }),
    ]);
    expect(text).toContain("Quiet until it's raised at a higher level");
  });
});
