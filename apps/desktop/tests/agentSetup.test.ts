// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { useAgentStore } from '@/store/agentStore';
import { useSettingsStore } from '@/store/settingsStore';
import AgentSetupCard from '@/components/agent/AgentSetupCard.vue';

let settings: Record<string, string>;
let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setActivePinia(createPinia());
  settings = {};
  vi.mocked(invokeCore).mockReset();
  vi.mocked(invokeCore).mockImplementation(async (channel: string, payload?: any) => {
    if (channel === SEND.SETTINGS_LIST) return { ...settings };
    if (channel === SEND.SETTINGS_SET) settings[payload.key] = payload.value;
    if (channel === SEND.SETTINGS_GET_API_TOKEN) return 'core-token';
    return undefined;
  });
  send = vi.fn();
  (window as any).ipcRenderer = { send, on: vi.fn(), off: vi.fn(), invoke: vi.fn() };
});

afterEach(() => {
  delete (window as any).ipcRenderer;
});

const prompts = () => send.mock.calls.filter(([channel]) => channel === SEND.AGENT_PROMPT).map(([, msg]) => msg.payload);

describe('a request before any provider is set up', () => {
  it('waits in the open sidebar instead of failing', async () => {
    const agent = useAgentStore();
    expect(await agent.ask('sort my downloads')).toBe(true);

    expect(agent.pendingPrompt).toBe('sort my downloads');
    expect(agent.sidebarOpen).toBe(true);
    expect(agent.turns).toEqual([]);
    expect(prompts()).toEqual([]);
  });

  it('goes out once a key is saved, with that provider', async () => {
    const agent = useAgentStore();
    await agent.submit('sort my downloads');
    await agent.connectProvider('anthropic', '  sk-test  ');

    expect(settings).toMatchObject({ agent_provider: 'anthropic', agent_anthropic_api_key: 'sk-test' });
    expect(prompts()).toEqual([expect.objectContaining({ prompt: 'sort my downloads', provider: 'anthropic', apiKey: 'sk-test' })]);
    expect(agent.pendingPrompt).toBe('');
    expect(agent.turns.map((t) => t.prompt)).toEqual(['sort my downloads']);
  });

  it('is sent straight away when a key is already set', async () => {
    settings = { agent_provider: 'deepseek', agent_deepseek_api_key: 'sk-ds' };
    const agent = useAgentStore();
    await agent.ask('sort my downloads');

    expect(agent.pendingPrompt).toBe('');
    expect(prompts()).toHaveLength(1);
  });

  it('the setup card shows the request and connects with the key typed', async () => {
    const agent = useAgentStore();
    await useSettingsStore().load();
    agent.pendingPrompt = 'email me the report';
    const connect = vi.spyOn(agent, 'connectProvider').mockResolvedValue();
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] });

    const card = mount(AgentSetupCard, { global: { plugins: [i18n, router] } });
    expect(card.text()).toContain('email me the report');
    expect(card.text()).toContain('DeepSeek API key');
    expect(card.find('button[type="submit"]').attributes('disabled')).toBeDefined();

    await card.find('input[type="password"]').setValue('sk-new');
    await card.find('form').trigger('submit');
    await flushPromises();
    expect(connect).toHaveBeenCalledWith('deepseek', 'sk-new');

    await card.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click');
    expect(agent.pendingPrompt).toBe('');
  });
});
