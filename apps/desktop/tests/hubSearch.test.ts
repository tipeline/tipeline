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
const CATALOG = [
  { type: 'task', identifier: 'calendar-events', name: 'Calendar events', version: '1.0.0', author: 'Ana' },
  {
    type: 'task',
    identifier: 'photo-sorter',
    name: 'Ordenar fotos',
    description: 'Sorts **camera** pictures by date',
    version: '1.0.0',
    author: 'Bob',
  },
  { type: 'task', identifier: 'camara-backup', name: 'Copia de la cámara', version: '1.0.0' },
  { type: 'app', identifier: 'calendar-app', name: 'Calendar app', version: '1.0.0' },
];

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await nextTick();
};

let wrapper: VueWrapper;

async function mountBrowser() {
  vi.mocked(invokeCore).mockImplementation(async (channel: string) => {
    if (channel === SEND.HUB_LIST) return [HUB];
    if (channel === SEND.HUB_CATALOG) return CATALOG;
    if (channel === SEND.TASK_LIST) return [];
    return undefined;
  });
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
}

const titles = () => wrapper.findAll('[data-testid="hub-card-open"] [data-slot="card-title"]').map((n) => n.text());
async function type(text: string) {
  await wrapper.find('[data-testid="hub-search"]').setValue(text);
  await flush();
}

describe('hub search', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invokeCore).mockReset();
  });
  afterEach(() => {
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('lists every item of the tab when the box is empty', async () => {
    await mountBrowser();
    expect(titles()).toEqual(['Calendar events', 'Ordenar fotos', 'Copia de la cámara']);
  });

  it('matches the name, description, author and identifier, every word', async () => {
    await mountBrowser();
    await type('calendar');
    expect(titles()).toEqual(['Calendar events']);
    await type('camera');
    expect(titles()).toEqual(['Ordenar fotos']);
    await type('bob');
    expect(titles()).toEqual(['Ordenar fotos']);
    await type('photo-sorter');
    expect(titles()).toEqual(['Ordenar fotos']);
    await type('calendar bob');
    expect(titles()).toEqual([]);
  });

  it('ignores case and accents', async () => {
    await mountBrowser();
    await type('CAMARA');
    expect(titles()).toEqual(['Copia de la cámara']);
  });

  it('says nothing matches and clears from there', async () => {
    await mountBrowser();
    await type('zzz');
    const empty = wrapper.find('[data-testid="hub-search-empty"]');
    expect(empty.text()).toContain('zzz');
    await empty.find('button').trigger('click');
    await flush();
    expect(titles()).toHaveLength(3);
  });
});
