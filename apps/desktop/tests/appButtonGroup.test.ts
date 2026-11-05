// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import ButtonGroupWidget from '@/components/app/widgets/ButtonGroupWidget.vue';
import { useBuilderStore } from '@/store/builderStore';

const items = [
  { id: 'export', label: 'Export', icon: 'Download' },
  { id: 'archive', label: 'Archive', variant: 'outline' },
  { id: 'remove', label: 'Remove', variant: 'destructive', disabled: 'true' },
];
const mountGroup = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  mount(ButtonGroupWidget, { props: { props, componentId: 'g', ...extra } as any, attachTo: document.body, global: { plugins: [i18n] } });

describe('ButtonGroupWidget', () => {
  it("row: one button each; a click fires action:<id> with clicked; disabled ones don't", async () => {
    const w = mountGroup({ items });
    const buttons = w.findAll('button[data-item]');
    expect(buttons.map((b) => b.text())).toEqual(['Export', 'Archive', 'Remove']);
    await buttons[1].trigger('click');
    expect(w.emitted('event')).toEqual([['action:archive', { clicked: 'archive' }]]);
    expect(buttons[2].attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('while its run goes, the clicked one spins and the group waits', () => {
    const w = mountGroup({ items }, { busy: true, state: { clicked: 'export' } });
    const buttons = w.findAll('button[data-item]');
    expect(buttons[0].find('.animate-spin').exists()).toBe(true);
    expect(buttons[1].find('.animate-spin').exists()).toBe(false);
    expect(buttons.every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    w.unmount();
  });

  it('menu: one button opening the items', async () => {
    const w = mountGroup({ items, display: 'menu', label: 'More' });
    expect(w.find('[data-testid="group-menu"]').text()).toContain('More');
    expect(w.findAll('button[data-item]')).toHaveLength(0);
    w.unmount();
  });
});

describe('builder — removing a group button takes its handlers', () => {
  it('drops action:<id> events of buttons no longer there', () => {
    setActivePinia(createPinia());
    const store = useBuilderStore();
    store.source = {
      schemaVersion: 3,
      workflows: {},
      state: {},
      pages: [
        {
          id: 'p',
          name: 'P',
          showInMenu: true,
          runnables: {},
          events: {},
          components: [
            {
              id: 'g',
              type: 'buttonGroup',
              name: 'G',
              layout: { x: 0, y: 0, w: 6, h: 6 },
              props: { items },
              events: { 'action:export': [{ type: 'toast', message: 'a' }], 'action:archive': [{ type: 'toast', message: 'b' }] },
            },
          ],
        },
      ],
    } as any;
    store.selectedPageId = 'p';
    store.updateComponent('g', { props: { items: [items[0]] } } as any);
    expect(Object.keys((store.source as any).pages[0].components[0].events)).toEqual(['action:export']);
  });
});
