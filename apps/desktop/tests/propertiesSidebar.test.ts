// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn().mockResolvedValue([]) }));

import { i18n } from '@/i18n';
import { SidebarProvider } from '@/components/ui/sidebar';
import PropertiesSidebar from '@/pages/apps/builder/components/PropertiesSidebar.vue';
import { useBuilderStore } from '@/store/builderStore';

// The Properties panel picks an editor per field type: these check the panel itself,
// not just the editors (a type caught by the wrong branch once showed `data` as a
// one-line input).
describe('PropertiesSidebar: field editors', () => {
  async function panelFor(component: Record<string, unknown>) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useBuilderStore();
    store.source = {
      schemaVersion: 3,
      workflows: {},
      state: {},
      pages: [{ id: 'p', name: 'P', showInMenu: true, events: {}, runnables: {}, components: [component] }],
    } as any;
    store.selectedPageId = 'p';
    store.selectComponent(component.id as string);
    const Host = defineComponent({ render: () => h(SidebarProvider, null, () => h(PropertiesSidebar, { problems: [] })) });
    const wrapper = mount(Host, { global: { plugins: [pinia, i18n] }, attachTo: document.body });
    await nextTick();
    return wrapper;
  }

  /** The editor shown under a field's label. */
  const fieldBlock = (wrapper: ReturnType<typeof mount>, label: string) =>
    wrapper.findAll('label').find((l) => l.text().startsWith(label))!.element.parentElement!;

  it('a table’s Data and Columns are JSON editors with an expand button, not one-line inputs', async () => {
    const wrapper = await panelFor({
      id: 'records',
      type: 'table',
      name: 'Records',
      layout: { x: 0, y: 0, w: 12, h: 30 },
      props: { data: '{= runnables.list.outputs.rows =}', columns: [{ key: 'name' }] },
      events: {},
    });
    for (const label of ['Data', 'Columns']) {
      const block = fieldBlock(wrapper, label);
      expect(block.querySelector('.json-editor'), label).not.toBeNull();
      expect(block.querySelector('button[title^="Expand editor"]'), label).not.toBeNull();
      expect(block.querySelector('[role="textbox"][aria-multiline="false"]'), label).toBeNull();
    }
    wrapper.unmount();
  });

  it('a custom component: its code in a code editor (not a binding field), its events by name', async () => {
    const wrapper = await panelFor({
      id: 'picker',
      type: 'custom',
      name: 'Picker',
      layout: { x: 0, y: 0, w: 6, h: 30 },
      props: { code: '<p>{{ mine }}</p>', eventNames: ['pick', 'clear'] },
      events: {},
    });
    const block = fieldBlock(wrapper, 'Code');
    expect(block.querySelector('.cm-editor'), 'code editor').not.toBeNull();
    expect(block.querySelector('[role="textbox"][aria-multiline="false"]')).toBeNull();
    expect(block.textContent).toContain('{{ mine }}');
    expect(wrapper.text()).toContain('On “pick”');
    expect(wrapper.text()).toContain('On “clear”');
    wrapper.unmount();
  });

  it('a custom component’s full-screen code editor previews it running, with written-in Data', async () => {
    localStorage.setItem('tipeline.editorDialog.mode', 'split');
    const wrapper = await panelFor({
      id: 'picker',
      type: 'custom',
      name: 'Picker',
      layout: { x: 0, y: 0, w: 6, h: 30 },
      props: { code: '<p id="x">hi</p>', data: { seats: 3 }, eventNames: ['pick'] },
      events: {},
    });
    const block = fieldBlock(wrapper, 'Code');
    (block.querySelector('button[title="Edit full screen"]') as HTMLElement).click();
    await nextTick();
    await nextTick();
    const frame = document.querySelector('[role="dialog"] iframe[data-testid="custom-frame"]') as HTMLIFrameElement;
    expect(frame, 'preview frame').not.toBeNull();
    expect(frame.getAttribute('srcdoc')).toContain('<p id="x">hi</p>');
    expect(frame.getAttribute('srcdoc')).toContain('let data = {"seats":3};');
    expect(frame.classList.contains('pointer-events-none')).toBe(false); // clickable
    wrapper.unmount();
  });

  it('a text prop is still a one-line binding field', async () => {
    const wrapper = await panelFor({
      id: 'badge1',
      type: 'badge',
      name: 'Badge',
      layout: { x: 0, y: 0, w: 3, h: 7 },
      props: { value: 'active', label: 'Status' },
      events: {},
    });
    const block = fieldBlock(wrapper, 'Label');
    expect(block.querySelector('.json-editor')).toBeNull();
    expect(block.querySelector('[role="textbox"]')).not.toBeNull();
    wrapper.unmount();
  });
});
