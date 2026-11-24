// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';

const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import TaskStatusStrip from '@/components/task/TaskStatusStrip.vue';

const global = { plugins: [i18n], stubs: { teleport: true } };

const runs = [
  { identifier: 'r3', status: 'completed', started_at: '2026-11-18T09:00:00.000Z', finished_at: '2026-11-18T09:00:02.400Z' },
  { identifier: 'r2', status: 'failed', started_at: '2026-11-17T09:00:00.000Z', finished_at: '2026-11-17T09:00:01.000Z' },
  { identifier: 'r1', status: 'completed', started_at: '2026-11-16T09:00:00.000Z', finished_at: '2026-11-16T09:00:02.000Z' },
];
const schedules = [
  { scheduleIdentifier: 's1', taskIdentifier: 'wf', taskName: 'WF', cron: '0 9 * * 1-5', enabled: true, nextRunAt: '2030-01-03T09:00:00.000Z' },
  { scheduleIdentifier: 's2', taskIdentifier: 'wf', taskName: 'WF', cron: '0 7 1 * *', enabled: false, nextRunAt: null },
  { scheduleIdentifier: 's3', taskIdentifier: 'other', taskName: 'Other', cron: '0 0 * * *', enabled: true, nextRunAt: '2029-01-01T00:00:00.000Z' },
];

function mountStrip(data: { runs?: any[]; schedules?: any[]; alerts?: any[] } = {}, draft = false) {
  vi.mocked(invokeCore).mockImplementation(async (channel: string) => {
    if (channel === SEND.PIPELINE_LIST) return data.runs ?? [];
    if (channel === SEND.SCHEDULE_LIST) return data.schedules ?? [];
    if (channel === SEND.ALERT_LIST) return data.alerts ?? [];
    return undefined;
  });
  return mount(TaskStatusStrip, { props: { taskIdentifier: 'wf', taskName: 'WF', draft }, global });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(invokeCore).mockReset();
  push.mockReset();
  (window as any).ipcRenderer = { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() };
});

describe('TaskStatusStrip', () => {
  it('shows the last run, opens it, and draws the last runs oldest first', async () => {
    const wrapper = mountStrip({ runs });
    await flushPromises();

    expect(invokeCore).toHaveBeenCalledWith(SEND.PIPELINE_LIST, { taskIdentifier: 'wf', limit: 10, offset: 0 });
    const last = wrapper.get('[data-testid="strip-last-run"]');
    expect(last.text()).toContain('Completed');
    expect(last.text()).toContain('2.4');
    await last.trigger('click');
    expect(push).toHaveBeenCalledWith('/tasks/wf/pipelines/r3');

    const recent = wrapper.get('[data-testid="strip-recent-runs"]');
    // The workflows list's run strip: oldest left, failed taller, empty slots padded.
    const bars = recent.get('[role="img"]').findAll('span');
    expect(bars).toHaveLength(10);
    expect(bars.slice(0, 7).every((b) => b.classes().includes('h-1'))).toBe(true);
    expect(bars[7].classes()).toContain('bg-emerald-500');
    expect(bars[8].classes()).toEqual(expect.arrayContaining(['bg-red-500', 'h-5']));
    expect(bars[9].classes()).toContain('bg-emerald-500');
    await recent.trigger('click');
    expect(push).toHaveBeenCalledWith('/tasks/wf/pipelines');
    expect(recent.text()).toContain('2 completed · 1 failed');
  });

  it('says not run yet when the workflow has no runs', async () => {
    const wrapper = mountStrip();
    await flushPromises();
    expect(wrapper.get('[data-testid="strip-last-run"]').text()).toContain('Not run yet');
    expect(wrapper.get('[data-testid="strip-recent-runs"]').text()).toContain('No runs yet');
  });

  it("shows this workflow's next run and how many schedules are on", async () => {
    const wrapper = mountStrip({ schedules });
    await flushPromises();
    const tile = wrapper.get('[data-testid="strip-next-run"]');
    expect(tile.text()).toContain('2 schedules · 1 on');
    expect(tile.text()).not.toContain('Not scheduled');
  });

  it('marks a draft as not schedulable', async () => {
    const wrapper = mountStrip({}, true);
    await flushPromises();
    const tile = wrapper.get('[data-testid="strip-next-run"]');
    expect(tile.text()).toContain('Not scheduled');
    expect(tile.text()).toContain("Drafts can't be scheduled");
  });

  it('counts open alerts and names the newest; resolved ones are left out', async () => {
    const wrapper = mountStrip({
      alerts: [
        { id: 1, title: 'Older', status: 'open', level: 'warning', count: 1, lastRaisedAt: '2026-11-10T00:00:00Z' },
        { id: 2, title: 'Slow run', status: 'open', level: 'warning', count: 2, lastRaisedAt: '2026-11-18T00:00:00Z' },
        { id: 3, title: 'Gone', status: 'resolved', level: 'info', count: 1, lastRaisedAt: '2026-11-19T00:00:00Z' },
      ],
    });
    await flushPromises();
    const tile = wrapper.get('[data-testid="strip-alerts"]');
    expect(tile.element.tagName).toBe('BUTTON');
    expect(tile.text()).toContain('2 need you');
    expect(tile.text()).toContain('×2');
    expect(tile.text()).toContain('Slow run');
  });

  it('shows no alerts as a plain tile', async () => {
    const wrapper = mountStrip();
    await flushPromises();
    const tile = wrapper.get('[data-testid="strip-alerts"]');
    expect(tile.element.tagName).toBe('DIV');
    expect(tile.text()).toContain('Nothing needs attention');
  });
});
