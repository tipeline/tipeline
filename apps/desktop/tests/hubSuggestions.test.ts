// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('vue-sonner', () => ({ toast: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { toast } from 'vue-sonner';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';
import HomeHubSuggestions from '@/components/home/HomeHubSuggestions.vue';
import HubCatalogBrowser from '@/components/hub/HubCatalogBrowser.vue';
import {
  HOME_HUB_SUGGESTIONS_KEY,
  hubItemKey,
  pickHubSuggestions,
  pluginGroupKey,
  type HubSuggestionItem,
} from '@/utils/hubSuggestions';

const item = (
  type: HubSuggestionItem['type'],
  identifier: string,
  extra: Partial<HubSuggestionItem> = {}
) =>
  ({
    type,
    identifier,
    name: `Item ${identifier}`,
    ...extra,
  }) as HubSuggestionItem;

const ids = (list: { identifier: string }[]) => list.map((i) => i.identifier);

describe('pickHubSuggestions', () => {
  it('puts featured items first, then mixes workflows, plugins and apps', () => {
    const items = [
      item('plugin', 'p1'),
      item('plugin', 'p2'),
      item('task', 't1'),
      item('task', 't2', { featured: true }),
      item('app', 'a1'),
    ];
    const picked = pickHubSuggestions(
      [{ hubId: 'h', hubName: 'Hub', items }],
      new Set()
    );
    expect(ids(picked)).toEqual(['t2', 't1', 'p1', 'a1']);
    expect(picked[0]).toMatchObject({
      hubId: 'h',
      hubName: 'Hub',
      featured: true,
    });
  });

  it('orders featured items by their number, then the ones that are just true', () => {
    const items = [
      item('plugin', 'drupal', { featured: 4 }),
      item('plugin', 'any', { featured: true }),
      item('plugin', 'docs', { featured: 3 }),
      item('plugin', 'gmail', { featured: 1 }),
      item('plugin', 'drive', { featured: 2 }),
    ];
    const picked = pickHubSuggestions(
      [{ hubId: 'h', hubName: 'Hub', items }],
      new Set()
    );
    expect(ids(picked)).toEqual(['gmail', 'drive', 'docs', 'drupal']);
    expect(
      pickHubSuggestions(
        [{ hubId: 'h', hubName: 'Hub', items }],
        new Set(),
        5
      ).at(-1)?.identifier
    ).toBe('any');
  });

  it('leaves out what is already installed from that hub, and repeats across hubs', () => {
    const picked = pickHubSuggestions(
      [
        {
          hubId: 'h1',
          hubName: 'One',
          items: [item('task', 'a'), item('task', 'b')],
        },
        {
          hubId: 'h2',
          hubName: 'Two',
          items: [item('task', 'b'), item('task', 'c'), item('task', 'a')],
        },
      ],
      new Set([hubItemKey('task', 'h1', 'a')])
    );
    // a is installed from h1 but still on h2; b is on both and comes from h1.
    expect(picked.map((p) => `${p.hubId}:${p.identifier}`)).toEqual([
      'h1:b',
      'h2:c',
      'h2:a',
    ]);
  });

  it('keeps featured items even when installed, but fills only with what is not installed', () => {
    const items = [
      item('plugin', 'gmail', { featured: 1, group: 'gmail' }),
      item('plugin', 'drive', { featured: 2, group: 'googledrive' }),
      item('plugin', 'slack', { group: 'slack' }),
      item('plugin', 'airtable', { group: 'airtable' }),
    ];
    const picked = pickHubSuggestions(
      [{ hubId: 'h', hubName: 'Hub', items }],
      // gmail installed by hand, drive from the hub, slack by hand.
      new Set([
        pluginGroupKey('gmail'),
        hubItemKey('plugin', 'h', 'drive'),
        pluginGroupKey('slack'),
      ])
    );
    expect(picked.map((p) => [p.identifier, p.installed])).toEqual([
      ['gmail', true],
      ['drive', true],
      ['airtable', false],
    ]);
  });

  it('shows at most four, and nothing when the hubs are empty', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      item('plugin', `p${i}`, { featured: true })
    );
    expect(
      pickHubSuggestions(
        [{ hubId: 'h', hubName: 'Hub', items: many }],
        new Set()
      )
    ).toHaveLength(4);
    expect(pickHubSuggestions([], new Set())).toEqual([]);
  });

  it('skips item types it does not know', () => {
    const items = [
      item('task', 't'),
      { ...item('task', 'x'), type: 'theme' as any },
    ];
    expect(
      ids(
        pickHubSuggestions([{ hubId: 'h', hubName: 'Hub', items }], new Set())
      )
    ).toEqual(['t']);
  });
});

function makeRouter() {
  const stub = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      {
        path: '/hub',
        component: stub,
        children: [
          { path: '', name: 'HubTasks', component: stub },
          { path: 'apps', name: 'HubApps', component: stub },
          { path: 'plugins', name: 'HubPlugins', component: stub },
        ],
      },
    ],
  });
}

const HUB = {
  id: 'hub-1',
  name: 'Tipeline Hub',
  type: 'remote',
  target: 'x',
  enabled: true,
};
let replies: Record<string, unknown>;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(toast).mockReset();
  replies = {
    [SEND.HUB_LIST]: [HUB, { ...HUB, id: 'off', enabled: false }],
    [SEND.HUB_CATALOG]: [
      item('plugin', 'slack', {
        name: 'Slack',
        featured: true,
        group: 'slack',
        description: 'Posts **messages**.',
      }),
      item('task', 'gmail-unread', { name: 'Gmail: Unread emails' }),
      item('task', 'installed-one'),
    ],
    [SEND.TASK_LIST]: [
      {
        source_type: 'hub',
        hub_id: 'hub-1',
        hub_task_identifier: 'installed-one',
      },
    ],
    [SEND.APP_LIST]: [],
    [SEND.PLUGIN_LIST]: [{ group: 'slack' }],
  };
  vi.mocked(invokeCore).mockReset();
  vi.mocked(invokeCore).mockImplementation(
    async (channel: string, payload?: any) => {
      if (channel === SEND.SETTINGS_SET) return undefined;
      if (channel === SEND.HUB_CATALOG && payload?.hubId !== 'hub-1')
        throw new Error('only hub-1 is on');
      return replies[channel] as any;
    }
  );
});

async function mountCard() {
  const router = makeRouter();
  await router.push('/');
  const wrapper = mount(HomeHubSuggestions, {
    global: { plugins: [i18n, router] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('HomeHubSuggestions', () => {
  it('lists featured items (installed or not), then what is not installed yet', async () => {
    const { wrapper } = await mountCard();
    const cards = wrapper.findAll('[data-testid="home-hub-item"]');
    expect(cards.map((c) => c.text())).toEqual([
      expect.stringContaining('Slack'),
      expect.stringContaining('Gmail: Unread emails'),
    ]);
    // One line of the description, the full one on hover; an installed one says so.
    expect(cards[0].find('[data-testid="home-hub-description"]').text()).toBe(
      'Posts messages.'
    );
    expect(cards[0].attributes('title')).toBe('Posts messages.');
    expect(cards[0].text()).toContain('Plugin · Installed');
    expect(cards[1].find('[data-testid="home-hub-description"]').exists()).toBe(
      false
    );
    expect(cards[1].text()).not.toContain('Installed');
    // Only the turned-on hub is asked for its catalog.
    const asked = vi
      .mocked(invokeCore)
      .mock.calls.filter(([c]) => c === SEND.HUB_CATALOG);
    expect(asked).toEqual([[SEND.HUB_CATALOG, { hubId: 'hub-1' }]]);
  });

  it('opens the item on the Hub page tab for its kind', async () => {
    const { wrapper, router } = await mountCard();
    await wrapper.findAll('[data-testid="home-hub-item"]')[0].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('HubPlugins');
    expect(router.currentRoute.value.query).toEqual({
      hub: 'hub-1',
      item: 'slack',
    });
  });

  it('hides for good with the ×, with an undo', async () => {
    const { wrapper } = await mountCard();
    await wrapper.get('[data-testid="home-hub-hide"]').trigger('click');
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledWith(SEND.SETTINGS_SET, {
      key: HOME_HUB_SUGGESTIONS_KEY,
      value: 'false',
    });
    expect(wrapper.find('[data-testid="home-hub-suggestions"]').exists()).toBe(
      false
    );

    const [, options] = vi.mocked(toast).mock.calls[0] as [string, any];
    options.action.onClick();
    await flushPromises();
    expect(invokeCore).toHaveBeenCalledWith(SEND.SETTINGS_SET, {
      key: HOME_HUB_SUGGESTIONS_KEY,
      value: 'true',
    });
    expect(wrapper.find('[data-testid="home-hub-suggestions"]').exists()).toBe(
      true
    );
  });

  it('stays hidden, without asking any hub, once turned off', async () => {
    useSettingsStore().settings[HOME_HUB_SUGGESTIONS_KEY] = 'false';
    const { wrapper } = await mountCard();
    expect(wrapper.find('[data-testid="home-hub-suggestions"]').exists()).toBe(
      false
    );
    expect(invokeCore).not.toHaveBeenCalledWith(SEND.HUB_LIST);
  });

  it('shows nothing when there are no hubs or the hub list fails', async () => {
    replies[SEND.HUB_LIST] = undefined;
    let { wrapper } = await mountCard();
    expect(wrapper.find('[data-testid="home-hub-suggestions"]').exists()).toBe(
      false
    );

    vi.mocked(invokeCore).mockRejectedValue(
      new Error('not allowed on this server')
    );
    ({ wrapper } = await mountCard());
    expect(wrapper.find('[data-testid="home-hub-suggestions"]').exists()).toBe(
      false
    );
  });

  it('has no untranslated keys', async () => {
    const { wrapper } = await mountCard();
    expect(wrapper.text()).not.toMatch(/dashboard\.hub\./);
  });
});

describe('HubCatalogBrowser opened from a suggestion', () => {
  it("picks the linked hub and opens that item's details", async () => {
    replies[SEND.HUB_LIST] = [{ ...HUB, id: 'other', name: 'Other' }, HUB];
    const router = makeRouter();
    await router.push({
      name: 'HubPlugins',
      query: { hub: 'hub-1', item: 'slack' },
    });
    const wrapper = mount(HubCatalogBrowser, {
      props: {
        itemType: 'plugin',
        installChannel: SEND.HUB_INSTALL_PLUGIN,
        localListChannel: SEND.PLUGIN_LIST,
        hubIdentifierField: 'hub_plugin_identifier',
        emptyTextKey: 'hub.pluginsEmpty',
      },
      global: {
        plugins: [i18n, router],
        stubs: {
          HubItemDrawer: {
            props: ['item', 'hubId'],
            template:
              '<div data-testid="drawer">{{ item?.identifier }}|{{ hubId }}</div>',
          },
        },
      },
    });
    await flushPromises();
    expect(wrapper.get('[data-testid="drawer"]').text()).toBe('slack|hub-1');
    // The card shows the hub's Featured label too.
    expect(wrapper.text()).toContain('Featured');
  });
});
