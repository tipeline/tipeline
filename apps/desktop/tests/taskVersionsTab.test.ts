// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';

const invokeCore = vi.hoisted(() => vi.fn());
vi.mock('@/utils/invoke', () => ({ invokeCore }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import TaskVersionsTab from '@/components/task/TaskVersionsTab.vue';
import { SEND } from '@/ipc-channels';

const source = (message: string) =>
  JSON.stringify({ name: 'Flow', pipeline: { actions: [{ group: 'log', name: 'info', params: { message } }] } });

const SOURCES: Record<number, string> = { 3: source('third'), 2: source('second'), 1: source('first') };
const LIST = [
  { id: 3, origin: 'edit', summary: null, restoredFrom: null, createdAt: '2026-10-24T10:00:00Z', current: true },
  { id: 2, origin: 'edit', summary: null, restoredFrom: null, createdAt: '2026-10-23T10:00:00Z', current: false },
  { id: 1, origin: 'created', summary: null, restoredFrom: null, createdAt: '2026-10-22T10:00:00Z', current: false },
];

invokeCore.mockImplementation(async (channel: string, payload: any) => {
  if (channel === SEND.TASK_REVISION_LIST) return LIST;
  if (channel === SEND.TASK_REVISION_DETAIL) return { source: SOURCES[payload.revisionId] };
  return null;
});

async function mountTab() {
  const wrapper = mount(TaskVersionsTab, {
    props: { task: { identifier: 'wf-1' } },
    global: { plugins: [i18n, createPinia()], stubs: { codemirror: { template: '<pre class="yaml">{{ modelValue }}</pre>', props: ['modelValue'] } } },
  });
  await flushPromises();
  return wrapper;
}

const selectRow = async (wrapper: any, index: number) => {
  await wrapper.findAll('ul button')[index].trigger('click');
  await flushPromises();
};

const tabs = (wrapper: any) => wrapper.findAll('[role="tab"]').map((tab: any) => tab.text());

describe('TaskVersionsTab', () => {
  it('shows the newest version as changes from the one before it', async () => {
    const wrapper = await mountTab();
    expect(tabs(wrapper)).toEqual(['Changes', 'YAML']);
    const rows = wrapper.findAll('tbody tr');
    expect(rows.find((r) => r.text().includes('message: second'))!.text()).toContain('−');
    expect(rows.find((r) => r.text().includes('message: third'))!.text()).toContain('+');
  });

  it('compares an older version with now: + is what restoring brings back', async () => {
    const wrapper = await mountTab();
    await selectRow(wrapper, 1);
    expect(tabs(wrapper)).toEqual(['Changes', 'Compared to now', 'YAML']);
    await wrapper.findAll('[role="tab"]')[1].trigger('mousedown', { button: 0 });
    await flushPromises();
    const rows = wrapper.findAll('tbody tr');
    const removed = rows.find((r) => r.text().includes('message: third'))!;
    const added = rows.find((r) => r.text().includes('message: second'))!;
    expect(removed.text()).toContain('−');
    expect(added.text()).toContain('+');
  });

  it('has no Changes view for the first version', async () => {
    const wrapper = await mountTab();
    await selectRow(wrapper, 2);
    expect(tabs(wrapper)).toEqual(['Compared to now', 'YAML']);
  });
});
