// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { reactive } from 'vue';
import { i18n } from '@/i18n';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/utils/detachedWindows', () => ({
  openInWindow: vi.fn(),
  windowPaths: { run: (t: string, p: string) => `/window/runs/${t}/${p}` },
}));

import RunsWidget from '@/components/app/widgets/RunsWidget.vue';
import { APP_RUNTIME } from '@/components/app/appRuntimeKey';
import { invokeCore } from '@/utils/invoke';
import { openInWindow } from '@/utils/detachedWindows';

const now = Date.now();
const iso = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
const RUNS = [
  { pipelineIdentifier: 'p-3', taskIdentifier: 'wf', workflow: 'sync', workflowName: 'Sync', status: 'running', startedAt: iso(30), finishedAt: null, trigger: { type: 'app', name: 'Billing' }, message: null },
  { pipelineIdentifier: 'p-2', taskIdentifier: 'wf', workflow: 'sync', workflowName: 'Sync', status: 'failed', startedAt: iso(7200), finishedAt: iso(7195), trigger: { type: null, name: null }, message: 'Disk full' },
];

function mountRuns(props: Record<string, unknown> = {}, editable = false) {
  const runnables = reactive<Record<string, any>>({});
  const w = mount(RunsWidget, {
    props: { props, componentId: 'history', editable },
    global: {
      plugins: [i18n, createPinia()],
      provide: { [APP_RUNTIME as symbol]: { appIdentifier: () => 'app-1', pageId: () => 'p', runnables } },
    },
  });
  return { w, runnables };
}

afterEach(() => vi.mocked(invokeCore).mockReset());

describe('RunsWidget', () => {
  it("asks core for the app's runs (only the filters set) and lists them", async () => {
    vi.mocked(invokeCore).mockResolvedValue(RUNS);
    const { w } = mountRuns({ workflows: ['sync'], statuses: [], limit: 5 });
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledWith('appRunsList', { appIdentifier: 'app-1', workflows: ['sync'], statuses: undefined, limit: 5 });
    const rows = w.findAll('li[data-status]');
    expect(rows.map((r) => r.attributes('data-status'))).toEqual(['running', 'failed']);
    expect(rows[0].text()).toContain('App · Billing');
    expect(rows[0].text()).toContain('just now');
    expect(rows[1].text()).toContain('Disk full');
    expect(rows[1].text()).toContain('2 hours ago');
    expect(rows[1].text()).toContain('5s');
    expect(w.text()).toContain('1 active');
    w.unmount();
  });

  it('a row click fires rowClick with the run; open opens it in its own window', async () => {
    vi.mocked(invokeCore).mockResolvedValue(RUNS);
    const { w } = mountRuns();
    await flushPromises();
    await w.findAll('li[data-status]')[1].trigger('click');
    expect(w.emitted('event')![0]).toEqual(['rowClick', { selectedRun: RUNS[1] }]);
    await w.findAll('button[aria-label="Open the run"]')[1].trigger('click');
    expect(openInWindow).toHaveBeenCalledWith('/window/runs/wf/p-2', 'Sync');
    // only the running run can be canceled
    expect(w.findAll('li[data-status]')[0].find('button[aria-label*="ancel"], [title*="ancel"]').exists()).toBe(true);
    w.unmount();
  });

  it('refreshes when a run started from the page begins or ends', async () => {
    vi.mocked(invokeCore).mockResolvedValue([]);
    const { w, runnables } = mountRuns();
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledTimes(1);
    expect(w.text()).toContain('No runs yet');
    runnables.save = { isRunning: true };
    await flushPromises();
    runnables.save = { isRunning: false };
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledTimes(3);
    w.unmount();
  });

  it('the builder shows sample runs without asking core', () => {
    const { w } = mountRuns({}, true);
    expect(invokeCore).not.toHaveBeenCalled();
    expect(w.findAll('li[data-status]').length).toBe(3);
    w.unmount();
  });
});
