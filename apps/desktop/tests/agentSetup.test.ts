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
import AgentSidebar from '@/components/agent/AgentSidebar.vue';

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

  it('is sent straight away when a key is already set', async () => {
    settings = { agent_provider: 'deepseek', agent_deepseek_api_key: 'sk-ds' };
    const agent = useAgentStore();
    await agent.ask('sort my downloads');

    expect(agent.pendingPrompt).toBe('');
    expect(prompts()).toHaveLength(1);
  });

});

const mountRouter = () =>
  createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] });

describe('no provider comes with Tipeline', () => {
  it('names no provider on a fresh install', async () => {
    const agent = useAgentStore();
    await useSettingsStore().load();

    expect(agent.chosenProvider()).toBeNull();
    expect(agent.configured).toBe(false);
    expect(agent.providerLabel).toBe('');
  });

  it('names a picked provider only once it has a key', async () => {
    settings = { agent_provider: 'anthropic' };
    const agent = useAgentStore();
    const store = useSettingsStore();
    await store.load();
    expect(agent.providerLabel).toBe('');

    await store.set('agent_anthropic_api_key', 'sk-test');
    expect(agent.configured).toBe(true);
    expect(agent.providerLabel).toBe('Anthropic');
  });

  it('uses the provider that has a key when none was picked', async () => {
    settings = { agent_gemini_api_key: 'g-key' };
    const agent = useAgentStore();
    await useSettingsStore().load();

    expect(agent.chosenProvider()).toBe('gemini');
    expect(agent.providerLabel).toBe('Gemini');
  });

  it('the setup card says no model is included and opens Settings', async () => {
    const router = mountRouter();
    const card = mount(AgentSetupCard, { global: { plugins: [i18n, router] } });
    expect(card.text()).toContain("Tipeline doesn't include an AI model");
    expect(card.find('input').exists()).toBe(false);

    await card.find('button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/settings/agent');
  });
});

describe('the sidebar before setup', () => {
  const mountSidebar = async () => {
    const sidebar = mount(AgentSidebar, { global: { plugins: [i18n, mountRouter()] } });
    await flushPromises();
    return sidebar;
  };

  it('says it is not set up and names no provider', async () => {
    const sidebar = await mountSidebar();
    expect(sidebar.text()).toContain('Not set up');
    expect(sidebar.text()).not.toContain('DeepSeek');
    expect(sidebar.text()).toContain("Tipeline doesn't include an AI model");
    expect(sidebar.text()).not.toContain('What do you need?');
  });

  it('turns Send off, and Enter does nothing', async () => {
    const sidebar = await mountSidebar();
    const box = sidebar.find('textarea');
    await box.setValue('sort my downloads');
    const sendButton = sidebar.findAll('button').find((b) => b.text().includes('Send'))!;
    expect(sendButton.attributes('disabled')).toBeDefined();

    await box.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(prompts()).toEqual([]);
    expect((box.element as HTMLTextAreaElement).value).toBe('sort my downloads');
  });

  it("puts the dashboard's request in the box", async () => {
    await useAgentStore().ask('email me the report');
    const sidebar = await mountSidebar();

    expect((sidebar.find('textarea').element as HTMLTextAreaElement).value).toBe('email me the report');
    expect(useAgentStore().pendingPrompt).toBe('');
    expect(sidebar.text()).toContain('Your request stays in the box below');
  });

  it('shows the provider once it has a key', async () => {
    settings = { agent_provider: 'openai', agent_openai_api_key: 'sk-o' };
    const sidebar = await mountSidebar();
    expect(sidebar.text()).toContain('OpenAI');
    expect(sidebar.text()).not.toContain('Not set up');
    expect(sidebar.text()).toContain('What do you need?');

    await sidebar.find('textarea').setValue('sort my downloads');
    expect(sidebar.findAll('button').find((b) => b.text().includes('Send'))!.attributes('disabled')).toBeUndefined();
  });
});
