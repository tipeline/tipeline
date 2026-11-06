// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import HubCatalogBrowser from '@/components/hub/HubCatalogBrowser.vue';

const HUB = { id: 'h1', name: 'Local', enabled: true };
const WORKFLOW = { type: 'task', identifier: 'calendar-events', name: 'Calendar events', version: '1.0.1' };
const NO_CAPABILITIES = { capabilities: [], unknownWorkflows: [] };
const CALENDAR = {
  group: 'googlecalendar',
  state: 'notInstalled',
  hubPlugin: { hubId: 'h1', hubName: 'Local', identifier: 'google-calendar', name: 'Google Calendar' },
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await nextTick();
};

/** Core answers by channel; `previews` are the HUB_PREVIEW_TASK answers in order. */
function core(previews: Array<{ missingPlugins: unknown[] }>) {
  const queue = [...previews];
  vi.mocked(invokeCore).mockImplementation(async (channel: string) => {
    switch (channel) {
      case SEND.HUB_LIST:
        return [HUB];
      case SEND.HUB_CATALOG:
        return [WORKFLOW];
      case SEND.TASK_LIST:
        return [];
      case SEND.HUB_PREVIEW_TASK:
        return { capabilities: NO_CAPABILITIES, ...queue.shift() };
      case SEND.HUB_INSTALL_PLUGIN:
        return { identifier: 'google-calendar' };
      case SEND.PLUGIN_SET_ENABLED:
        return { identifier: 'google-calendar', enabled: true };
      case SEND.HUB_INSTALL_TASK:
        return { identifier: 'calendar-events' };
      default:
        return undefined;
    }
  });
}

const calls = (channel: string) => vi.mocked(invokeCore).mock.calls.filter(([c]) => c === channel);
const buttonWithText = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

let wrapper: VueWrapper | null = null;

async function openAndInstall() {
  wrapper = mount(HubCatalogBrowser, {
    props: {
      itemType: 'task',
      installChannel: SEND.HUB_INSTALL_TASK,
      localListChannel: SEND.TASK_LIST,
      hubIdentifierField: 'hub_task_identifier',
      emptyTextKey: 'hub.tasksEmpty',
    },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
  await flush();
  buttonWithText('Install').click();
  await flush();
}

describe('hub workflow that needs plugins', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invokeCore).mockReset();
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('names the missing plugin instead of trying the install', async () => {
    core([{ missingPlugins: [CALENDAR] }]);
    await openAndInstall();

    const rows = document.body.querySelectorAll('[data-testid="needed-plugin"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Needs Google Calendar, which isn't installed.");
    expect(document.body.textContent).toContain('Turning a plugin on lets its code run on this computer.');
    expect(calls(SEND.HUB_INSTALL_TASK)).toHaveLength(0);
  });

  it('install and turn on: installs the plugin, turns it on, then installs the workflow', async () => {
    core([{ missingPlugins: [CALENDAR] }, { missingPlugins: [] }, { missingPlugins: [] }]);
    await openAndInstall();

    buttonWithText('Install and turn on Google Calendar from Local').click();
    await flush();

    expect(calls(SEND.HUB_INSTALL_PLUGIN)[0][1]).toEqual({ hubId: 'h1', itemIdentifier: 'google-calendar' });
    expect(calls(SEND.PLUGIN_SET_ENABLED)[0][1]).toEqual({ identifier: 'google-calendar', enabled: true });
    expect(calls(SEND.HUB_INSTALL_TASK)[0][1]).toEqual({ hubId: 'h1', itemIdentifier: 'calendar-events' });
    expect(document.body.querySelectorAll('[data-testid="needed-plugin"]')).toHaveLength(0);
  });

  it('a plugin that is installed but off only needs turning on', async () => {
    const off = { group: 'googlecalendar', state: 'disabled', pluginName: 'Google Calendar', pluginIdentifier: 'google-calendar' };
    core([{ missingPlugins: [off] }, { missingPlugins: [] }, { missingPlugins: [] }]);
    await openAndInstall();

    expect(document.body.textContent).toContain('Needs Google Calendar, which is turned off.');
    buttonWithText('Turn on Google Calendar').click();
    await flush();

    expect(calls(SEND.HUB_INSTALL_PLUGIN)).toHaveLength(0);
    expect(calls(SEND.PLUGIN_SET_ENABLED)[0][1]).toEqual({ identifier: 'google-calendar', enabled: true });
    expect(calls(SEND.HUB_INSTALL_TASK)).toHaveLength(1);
  });

  it('a plugin no hub offers gets no button, and nothing is installed', async () => {
    core([{ missingPlugins: [{ group: 'mystery', state: 'notInstalled' }] }]);
    await openAndInstall();

    const row = document.body.querySelector('[data-testid="needed-plugin"]')!;
    expect(row.textContent).toContain("Needs mystery, which isn't installed.");
    expect(row.querySelector('button')).toBeNull();
    expect(calls(SEND.HUB_INSTALL_TASK)).toHaveLength(0);
  });
});
