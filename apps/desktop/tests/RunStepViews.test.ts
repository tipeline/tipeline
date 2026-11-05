// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/i18n';
import RunStepList from '@/components/run/RunStepList.vue';
import RunWaterfall from '@/components/run/RunWaterfall.vue';
import RunSummaryBar from '@/components/run/RunSummaryBar.vue';

const T0 = Date.UTC(2026, 9, 12, 9, 0, 0);
const at = (ms: number) => new Date(T0 + ms).toISOString();

const actions = () => [
  { identifier: 'fetch', group: 'api', name: 'request', status: 'completed', started_at: at(0), finished_at: at(1240), params: { method: 'GET', url: 'https://cms.test/node' }, result: { count: 3 } },
  { identifier: 'filter', group: 'array', name: 'filter', status: 'completed', cached: true, started_at: at(1240), finished_at: at(1242), params: {}, result: [] },
  { identifier: 'mail', group: 'email', name: 'send', status: 'failed', started_at: at(1250), finished_at: at(2600), params: { to: 'team@acme.test' }, error: 'Invalid login: 535' },
  { identifier: 'cleanup', group: 'file', name: 'delete', status: 'pending', params: { path: 'out' } },
];
const window = { start: T0, end: T0 + 2600 };

function mountWith(component: any, props: Record<string, unknown>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  return mount(component, { props, global: { plugins: [i18n, router] } });
}

describe('RunStepList', () => {
  it('lists every step and opens the failed one by itself', () => {
    const wrapper = mountWith(RunStepList, { actions: actions(), window, now: null, ended: true });
    const rows = wrapper.findAll('[data-testid="run-step-row"]');
    expect(rows).toHaveLength(4);

    const failed = wrapper.find('[data-step="mail"]');
    expect(failed.find('[data-testid="run-step-detail"]').exists()).toBe(true);
    expect(failed.text()).toContain('Invalid login: 535');
    expect(wrapper.find('[data-step="fetch"] [data-testid="run-step-detail"]').exists()).toBe(false);
    expect(wrapper.find('[data-step="fetch"]').text()).toContain('1.2s');
  });

  it('opens a step on click and says a pending step never ran', async () => {
    const wrapper = mountWith(RunStepList, { actions: actions(), window, now: null, ended: true });
    await wrapper.find('[data-step="cleanup"] button').trigger('click');
    expect(wrapper.find('[data-step="cleanup"]').text()).toContain('Not run: the run ended before this step.');
  });
});

describe('RunStepList — sub-workflows', () => {
  const withSubWorkflow = () => [
    { identifier: 'fetch', group: 'api', name: 'request', status: 'completed', params: {} },
    {
      identifier: 'call',
      group: 'subtask',
      name: 'exec',
      status: 'failed',
      params: { identifier: 'enrich' },
      error: 'Request failed: 401',
      childRuns: [{ identifier: 'child-1', status: 'failed', taskIdentifier: 'enrich', taskName: 'Enrich customer' }],
      childRun: { identifier: 'child-1', status: 'failed', taskIdentifier: 'enrich', taskName: 'Enrich customer' },
      childSteps: [
        { identifier: 'query', group: 'db', name: 'query', status: 'completed', params: {} },
        { identifier: 'post', group: 'api', name: 'request', status: 'failed', params: {}, error: '401 Unauthorized' },
      ],
    },
    { identifier: 'ok-call', group: 'subtask', name: 'exec', status: 'completed', params: { identifier: 'notify' }, result: { cachedFrom: 'src-run', taskIdentifier: 'notify', cached: true } },
  ];

  it('names the sub-workflow, links to its run and lists its steps when it failed', () => {
    const wrapper = mountWith(RunStepList, { actions: withSubWorkflow(), window, now: null, ended: true });
    const row = wrapper.find('[data-step="call"]');
    expect(row.find('[data-testid="run-step-subworkflow"]').text()).toContain('Enrich customer');
    expect(row.find('[data-testid="run-step-open-run"]').exists()).toBe(true);
    // Opened by itself (it failed), so its steps are listed, the failed one open too.
    expect(wrapper.find('[data-step="call>query"]').exists()).toBe(true);
    expect(wrapper.find('[data-step="call>post"] [data-testid="run-step-detail"]').text()).toContain('401 Unauthorized');
    expect(row.find('[data-testid="run-step-child-runs"]').exists()).toBe(true);
  });

  it('hides a sub-workflow\'s steps once its row is closed', async () => {
    const wrapper = mountWith(RunStepList, { actions: withSubWorkflow(), window, now: null, ended: true });
    await wrapper.find('[data-step="call"] button').trigger('click');
    expect(wrapper.find('[data-step="call>query"]').exists()).toBe(false);
  });

  it('links a cached sub-workflow step to the run its outputs came from', () => {
    const wrapper = mountWith(RunStepList, { actions: withSubWorkflow(), window, now: null, ended: true });
    const link = wrapper.find('[data-step="ok-call"] [data-testid="run-step-open-run"]');
    expect(link.attributes('title')).toBe('Open the run that produced them');
  });

  it('opens the step it was sent to', () => {
    const wrapper = mountWith(RunStepList, { actions: actions(), window, now: null, ended: true, focus: 'fetch' });
    expect(wrapper.find('[data-step="fetch"] [data-testid="run-step-detail"]').exists()).toBe(true);
  });
});

describe('RunWaterfall', () => {
  it('shows the failed step in the panel, and another step once picked', async () => {
    const wrapper = mountWith(RunWaterfall, { actions: actions(), window, now: null, ended: true });
    expect(wrapper.findAll('[data-testid="run-waterfall-row"]')).toHaveLength(4);
    expect(wrapper.find('[data-testid="run-step-detail"]').text()).toContain('Invalid login: 535');

    await wrapper.find('[data-testid="run-waterfall-row"][data-step="fetch"]').trigger('click');
    const detail = wrapper.find('[data-testid="run-step-detail"]').text();
    expect(detail).toContain('https://cms.test/node');
    expect(detail).not.toContain('Invalid login');
  });
});

describe('RunSummaryBar', () => {
  it('says where the run failed and how the steps ended', () => {
    const wrapper = mountWith(RunSummaryBar, {
      pipeline: { status: 'failed', started_at: at(0), finished_at: at(2600) },
      actions: actions(),
      window,
      now: null,
    });
    const text = wrapper.text();
    expect(text).toContain('Failed at email.send');
    expect(text).toContain('2.6s');
    expect(text).toContain('1 completed');
    expect(text).toContain('1 cached');
    expect(text).toContain('1 failed');
    expect(text).toContain('1 not run');
  });
});
