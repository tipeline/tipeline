// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { i18n } from '@/i18n';
import { nextRunText, runStrip, type TaskItem } from '@/config/tables/TasksList';
import RecentItemsRow from '@/components/RecentItemsRow.vue';

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

describe('RecentItemsRow', () => {
  const items = [{ identifier: 'a', name: 'Alpha', openedAt: new Date().toISOString() }] as any[];
  const mountRow = (type: 'task' | 'app' = 'task') =>
    mount(RecentItemsRow, { props: { type, items }, global: { plugins: [i18n, makeRouter()] } });

  beforeEach(() => localStorage.clear());

  it('folds to its title line and remembers that per list', async () => {
    const row = mountRow();
    expect(row.text()).toContain('Alpha');
    await row.get('button[aria-expanded]').trigger('click');
    expect(row.text()).not.toContain('Alpha');
    expect(row.get('button[aria-expanded]').attributes('aria-expanded')).toBe('false');
    row.unmount();

    // Opening the list again keeps it folded; the Apps list has its own choice.
    expect(mountRow().text()).not.toContain('Alpha');
    expect(mountRow('app').text()).toContain('Alpha');
  });
});
