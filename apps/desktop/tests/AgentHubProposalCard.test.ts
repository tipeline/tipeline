// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/store/agentStore', () => ({ useAgentStore: () => ({ adoptInstalled: vi.fn() }) }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import AgentHubProposalCard from '@/components/agent/AgentHubProposalCard.vue';
import type { AgentTurn } from '@/store/agentStore';

const NO_CAPABILITIES = { capabilities: [], unknownWorkflows: [] };
const preview = (missingPlugins: unknown[]) => ({
  name: 'Calendar events',
  version: '1.0.1',
  inputs: [],
  missingPlugins,
  capabilities: NO_CAPABILITIES,
});

/** Core answers by channel; `previews` are the HUB_PREVIEW_TASK answers in order. */
function core(previews: unknown[][]) {
  const queue = [...previews];
  vi.mocked(invokeCore).mockImplementation(async (channel: string) => {
    if (channel === SEND.HUB_PREVIEW_TASK) return preview(queue.shift() ?? []);
    if (channel === SEND.HUB_INSTALL_PLUGIN) return { identifier: 'google-calendar' };
    if (channel === SEND.PLUGIN_SET_ENABLED) return { identifier: 'google-calendar', enabled: true };
    return undefined;
  });
}

const calls = (channel: string) => vi.mocked(invokeCore).mock.calls.filter(([c]) => c === channel);

async function mountCard() {
  const turn = {
    id: 't1',
    prompt: 'what is on my calendar this week',
    phase: 'proposal',
    proposal: {
      identifier: 'calendar-events',
      name: 'Calendar events',
      variables: {},
      inputs: [],
      alternatives: [],
      hub: { id: 'h1', name: 'Local', itemIdentifier: 'calendar-events', version: '1.0.1' },
    },
  } as unknown as AgentTurn;
  const wrapper = mount(AgentHubProposalCard, { props: { turn }, global: { plugins: [i18n, createPinia()] } });
  await flushPromises();
  return wrapper;
}

const button = (wrapper: Awaited<ReturnType<typeof mountCard>>, text: string) =>
  wrapper.findAll('button').find((b) => b.text().includes(text))!;

describe('AgentHubProposalCard plugins', () => {
  beforeEach(() => vi.mocked(invokeCore).mockReset());

  it('install and turn on: installs the plugin from its hub, turns it on, checks again', async () => {
    const calendar = {
      group: 'googlecalendar',
      state: 'notInstalled',
      hubPlugin: { hubId: 'h1', hubName: 'Local', identifier: 'google-calendar', name: 'Google Calendar' },
    };
    core([[calendar], []]);
    const wrapper = await mountCard();
    expect(wrapper.text()).toContain('Turning a plugin on lets its code run on this computer.');

    await button(wrapper, 'Install and turn on Google Calendar from Local').trigger('click');
    await flushPromises();

    expect(calls(SEND.HUB_INSTALL_PLUGIN)[0][1]).toEqual({ hubId: 'h1', itemIdentifier: 'google-calendar' });
    expect(calls(SEND.PLUGIN_SET_ENABLED)[0][1]).toEqual({ identifier: 'google-calendar', enabled: true });
    expect(calls(SEND.HUB_PREVIEW_TASK)).toHaveLength(2);
    expect(wrapper.text()).not.toContain('Needs Google Calendar');
  });

  it('a plugin that is installed but off gets a Turn on button', async () => {
    const off = { group: 'googlecalendar', state: 'disabled', pluginName: 'Google Calendar', pluginIdentifier: 'google-calendar' };
    core([[off], []]);
    const wrapper = await mountCard();

    await button(wrapper, 'Turn on Google Calendar').trigger('click');
    await flushPromises();

    expect(calls(SEND.HUB_INSTALL_PLUGIN)).toHaveLength(0);
    expect(calls(SEND.PLUGIN_SET_ENABLED)[0][1]).toEqual({ identifier: 'google-calendar', enabled: true });
  });

  it('a plugin it cannot fix keeps the Open Plugins link and no consent note', async () => {
    core([[{ group: 'mystery', state: 'missing', pluginName: 'Mystery' }]]);
    const wrapper = await mountCard();

    expect(wrapper.text()).toContain('Open Plugins');
    expect(wrapper.text()).not.toContain('Turning a plugin on lets its code run');
  });
});
