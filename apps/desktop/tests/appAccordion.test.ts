// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import TabsWidget from '@/components/app/widgets/TabsWidget.vue';
import { APP_CANVAS } from '@/components/app/appCanvasKey';
import { PALETTE, PALETTE_BY_KEY, WIDGETS } from '@/components/app/widgets/registry';
import BuilderGrid from '@/pages/apps/builder/components/BuilderGrid.vue';
import { useBuilderStore } from '@/store/builderStore';

// A grid stand-in that shows which section is drawn.
const Grid = defineComponent({
  props: { parentId: String, tab: String },
  setup: (p) => () => h('div', { class: 'grid' }, p.tab),
});

const SECTIONS = {
  display: 'accordion',
  tabs: [
    { id: 'contact', label: 'Contact' },
    { id: 'billing', label: 'Billing' },
    { id: 'notes', label: 'Notes' },
  ],
};

function mountAccordion(state: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const editorTab = vi.fn(() => 'notes');
  const setEditorTab = vi.fn();
  const wrapper = mount(TabsWidget, {
    props: { props: SECTIONS, state, componentId: 'faq', ...extra },
    global: { plugins: [i18n], provide: { [APP_CANVAS as symbol]: { grid: Grid, editorTab, setEditorTab } } },
  });
  return { wrapper, setEditorTab };
}

const headers = (w: ReturnType<typeof mount>) => w.findAll('button[data-section]');

describe('TabsWidget as an accordion', () => {
  it('stacks a header per section and draws only the open one, under its header', () => {
    const { wrapper } = mountAccordion({ activeTab: 'billing' });
    expect(headers(wrapper).map((b) => b.text())).toEqual(['Contact', 'Billing', 'Notes']);
    expect(headers(wrapper).map((b) => b.attributes('aria-expanded'))).toEqual(['false', 'true', 'false']);
    const regions = wrapper.findAll('[role="region"]');
    expect(regions).toHaveLength(1);
    expect(regions[0].text()).toBe('billing');
    expect(regions[0].attributes('aria-labelledby')).toBe(headers(wrapper)[1].attributes('id'));
    // the section comes right after its own header
    expect(regions[0].element.previousElementSibling).toBe(headers(wrapper)[1].element);
  });

  it('opens the first section when none is set', () => {
    const { wrapper } = mountAccordion({});
    expect(wrapper.find('[role="region"]').text()).toBe('contact');
  });

  it('a closed header opens its section (the change event); the open one stays open', async () => {
    const { wrapper } = mountAccordion({ activeTab: 'contact' });
    await headers(wrapper)[2].trigger('click');
    expect(wrapper.emitted('event')).toEqual([['change', { activeTab: 'notes' }]]);
    await headers(wrapper)[0].trigger('click');
    expect(wrapper.emitted('event')).toHaveLength(1);
  });

  it('in the builder, a header only picks the section being edited', async () => {
    const { wrapper, setEditorTab } = mountAccordion({}, { editable: true });
    expect(wrapper.find('[role="region"]').text()).toBe('notes');
    await headers(wrapper)[0].trigger('click');
    expect(setEditorTab).toHaveBeenCalledWith('faq', 'contact');
    expect(wrapper.emitted('event')).toBeUndefined();
  });
});

describe('palette presets', () => {
  it('lists every type once, with Stepper and Accordion right after Tabs', () => {
    const keys = PALETTE.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PALETTE.filter((p) => p.key === p.type).map((p) => p.type)).toEqual(WIDGETS.map((w) => w.type));
    const at = keys.indexOf('tabs');
    expect(keys.slice(at, at + 3)).toEqual(['tabs', 'stepper', 'accordion']);
  });

  it('a preset is its type with other defaults', () => {
    expect(PALETTE_BY_KEY.accordion.type).toBe('tabs');
    expect(PALETTE_BY_KEY.accordion.defaultProps.display).toBe('accordion');
    expect(PALETTE_BY_KEY.stepper.defaultProps.display).toBe('steps');
  });
});

describe('dropping a preset in the builder', () => {
  // AppGrid stand-in: drops whatever palette key the test names.
  const AppGrid = defineComponent({ emits: ['drop'], setup: () => () => h('div') });

  it('adds its type with the preset defaults, named after the preset', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useBuilderStore();
    store.source = {
      schemaVersion: 3,
      workflows: {},
      state: {},
      pages: [{ id: 'p', name: 'P', showInMenu: true, runnables: {}, events: {}, components: [] }],
    } as any;
    store.selectedPageId = 'p';
    const wrapper = mount(BuilderGrid, { global: { plugins: [i18n, pinia], stubs: { AppGrid } } });
    wrapper.findComponent(AppGrid).vm.$emit('drop', 'accordion', { x: 0, y: 0, w: 6, h: 45 });
    wrapper.findComponent(AppGrid).vm.$emit('drop', 'tabs', { x: 6, y: 0, w: 6, h: 35 });
    const [accordion, tabs] = (store.source as any).pages[0].components;
    expect(accordion).toMatchObject({ type: 'tabs', name: 'Accordion', props: { display: 'accordion' } });
    expect(accordion.props.tabs.map((t: any) => t.id)).toEqual(['section1', 'section2', 'section3']);
    expect(tabs).toMatchObject({ type: 'tabs', name: 'Tabs' });
    expect(tabs.props.display).toBeUndefined();
    wrapper.unmount();
  });
});
