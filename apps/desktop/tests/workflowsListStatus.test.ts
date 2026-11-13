// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { nextRunText, runStrip, type TaskItem } from '@/config/tables/TasksList';
import WorkflowStats from '@/components/task/WorkflowStats.vue';

const t = i18n.global.t as (key: string, named?: Record<string, unknown>) => string;

function renderStrip(row: Partial<TaskItem>) {
  return mount(defineComponent({ render: () => runStrip(row as TaskItem, t) }));
}

function makeRouter() {
  const stub = { template: '<div />' };
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: stub }] });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(invokeCore).mockReset();
  (window as any).ipcRenderer = { invoke: vi.fn(async () => []), on: vi.fn(), off: vi.fn() };
});

describe('runStrip', () => {
  it('draws ten slots, oldest on the left, with failed runs standing taller', () => {
    const strip = renderStrip({ recent_runs: ['failed', 'completed', 'failed'] });
    const bars = strip.findAll('span');
    expect(bars).toHaveLength(10);
    // Seven empty slots first, then the oldest run (failed), a success, and the newest (failed).
    expect(bars.slice(0, 7).every((b) => b.classes().includes('h-1'))).toBe(true);
    expect(bars[7].classes()).toEqual(expect.arrayContaining(['bg-red-500', 'h-5']));
    expect(bars[8].classes()).toEqual(expect.arrayContaining(['bg-emerald-500', 'h-3.5']));
    expect(bars[9].classes()).toContain('bg-red-500');
    expect(strip.attributes('aria-label')).toBe('Last 3 runs: 2 failed');
  });

  it('says so for a workflow that never ran, or a Core that sends no runs', () => {
    expect(renderStrip({}).attributes('aria-label')).toBe('No runs yet');
    expect(renderStrip({ recent_runs: [] }).findAll('span')).toHaveLength(10);
  });
});

describe('nextRunText', () => {
  it('says today or tomorrow with the time, and the date further out', () => {
    const today = new Date();
    today.setHours(23, 30, 0, 0);
    expect(nextRunText(today.toISOString(), t)).toBe('Today 23:30');
    const tomorrow = new Date(today.getTime() + 86_400_000);
    tomorrow.setHours(2, 0, 0, 0);
    expect(nextRunText(tomorrow.toISOString(), t)).toBe('Tomorrow 02:00');
    expect(nextRunText(new Date(2030, 0, 4, 9, 5).toISOString(), t)).toBe('Fri 4 Jan 09:05');
  });
});

describe('WorkflowStats', () => {
  it('asks for one seven-day period and shows runs, failures, failure rate and average time', async () => {
    vi.mocked(invokeCore).mockResolvedValue([{ total: 214, failed: 6, finished: 200, durationMs: 840_000 }]);
    const wrapper = mount(WorkflowStats, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();

    const call = vi.mocked(invokeCore).mock.calls.find(([channel]) => channel === SEND.PIPELINE_STATS)!;
    const [from, to] = (call[1] as any).boundaries as string[];
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeCloseTo(7, 0);
    const text = wrapper.text();
    expect(text).toContain('Runs · last 7 days214');
    expect(text).toContain('Failed · last 7 days6');
    expect(text).toContain('Failure rate2.8%');
    expect(text).toContain('Average run time4.2 s');
    wrapper.unmount();
  });

  it('shows dashes for a Core without stats, or without run times', async () => {
    vi.mocked(invokeCore).mockResolvedValue([{ total: 3, failed: 0 }]);
    const older = mount(WorkflowStats, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(older.text()).toContain('Failure rate0.0%');
    expect(older.text()).toContain('Average run time—');
    older.unmount();

    vi.mocked(invokeCore).mockRejectedValue(new Error('unknown command'));
    const oldest = mount(WorkflowStats, { global: { plugins: [i18n, makeRouter()] } });
    await flushPromises();
    expect(oldest.text()).toContain('Runs · last 7 days—');
    oldest.unmount();
  });
});
