// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import HubItemDrawer from '@/components/hub/HubItemDrawer.vue';

const workflowItem = {
  type: 'task' as const,
  identifier: 'summarize',
  name: 'Summarize',
  description: 'Summarizes **long** text.\n\nSecond paragraph.',
  author: 'Tipeline',
  version: '1.2.0',
};

const workflowDetail = {
  type: 'task',
  inputs: [{ name: 'text', label: 'Text', type: 'string', required: true, description: 'What to summarize' }],
  outputs: [{ name: 'summary', label: 'Summary', type: 'string' }],
  steps: 4,
  missingPlugins: [{ group: 'crm', state: 'notInstalled', hubPlugin: { name: 'CRM' } }],
  capabilities: { capabilities: [], unknownWorkflows: [] },
};

let wrapper: VueWrapper | null = null;
const body = () => document.body;
const drawer = () => body().querySelector('[data-testid="hub-item-drawer"]') as HTMLElement | null;

function mountDrawer(item: any, installed = false) {
  wrapper = mount(HubItemDrawer, {
    props: { item, hubId: 'h1', hubName: 'Team Hub', installed, busy: false },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
  return wrapper;
}

beforeEach(() => {
  vi.mocked(invokeCore).mockReset();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('HubItemDrawer', () => {
  it("shows the full description and what the workflow's file holds", async () => {
    vi.mocked(invokeCore).mockResolvedValue(workflowDetail);
    mountDrawer(workflowItem);
    await flushPromises();

    expect(invokeCore).toHaveBeenCalledWith(SEND.HUB_ITEM_DETAIL, {
      hubId: 'h1',
      type: 'task',
      itemIdentifier: 'summarize',
    });
    const text = drawer()!.textContent ?? '';
    expect(drawer()!.querySelector('.app-markdown strong')?.textContent).toBe('long');
    expect(text).toContain('Second paragraph.');
    expect(text).toContain('From Team Hub');
    expect(text).toContain('4 steps');
    expect(drawer()!.querySelector('[data-testid="hub-detail-inputs"]')?.textContent).toContain('What to summarize');
    expect(drawer()!.querySelector('[data-testid="hub-detail-outputs"]')?.textContent).toContain('Summary');
    expect(drawer()!.querySelector('[data-testid="hub-detail-plugins"]')).not.toBeNull();
    expect(drawer()!.querySelector('[data-testid="hub-detail-capabilities"]')?.textContent).toContain(
      'Only works with data'
    );
  });

  it('installs from the footer, and shows Installed once it is', async () => {
    vi.mocked(invokeCore).mockResolvedValue(workflowDetail);
    const w = mountDrawer(workflowItem);
    await flushPromises();

    (drawer()!.querySelector('[data-testid="hub-drawer-install"]') as HTMLButtonElement).click();
    expect(w.emitted('install')?.[0]).toEqual([workflowItem]);

    await w.setProps({ installed: true });
    expect(drawer()!.querySelector('[data-testid="hub-drawer-install"]')).toBeNull();
    expect(drawer()!.textContent).toContain('Installed');
  });

  it('keeps the description when the file cannot be read', async () => {
    vi.mocked(invokeCore).mockRejectedValue(new Error('offline'));
    mountDrawer(workflowItem);
    await flushPromises();

    expect(drawer()!.textContent).toContain('Second paragraph.');
    expect(drawer()!.textContent).toContain("Couldn't read this item's file: offline");
  });

  it("lists a plugin's npm packages and files", async () => {
    vi.mocked(invokeCore).mockResolvedValue({
      type: 'plugin',
      group: 'crm',
      license: 'MIT',
      dependencies: [{ name: 'axios', version: '^1.7.0' }],
      files: [{ path: 'index.mjs', size: 2048 }],
    });
    mountDrawer({ ...workflowItem, type: 'plugin', identifier: 'crm', name: 'CRM' });
    await flushPromises();

    expect(drawer()!.querySelector('[data-testid="hub-detail-dependencies"]')?.textContent).toContain('axios');
    expect(drawer()!.querySelector('[data-testid="hub-detail-files"]')?.textContent).toContain('2.0 KB');
    expect(drawer()!.textContent).toContain('runs on this computer');
  });
});
