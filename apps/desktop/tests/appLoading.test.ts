// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import type { AppComponent } from '@tipeline/schemas';
import { i18n } from '@/i18n';
import AppWidget from '@/components/app/AppWidget.vue';
import TableWidget from '@/components/app/widgets/TableWidget.vue';
import ChartWidget from '@/components/app/widgets/ChartWidget.vue';
import KpiWidget from '@/components/app/widgets/KpiWidget.vue';
import KeyValueWidget from '@/components/app/widgets/KeyValueWidget.vue';
import ListViewWidget from '@/components/app/widgets/ListViewWidget.vue';
import TimelineWidget from '@/components/app/widgets/TimelineWidget.vue';
import KanbanWidget from '@/components/app/widgets/KanbanWidget.vue';
import GalleryWidget from '@/components/app/widgets/GalleryWidget.vue';
import BadgeWidget from '@/components/app/widgets/BadgeWidget.vue';

const global = { plugins: [i18n, createPinia()] };
const skeleton = (w: ReturnType<typeof mount>) => w.find('[data-testid="app-skeleton"]');

// The first load draws the component's shape instead of a bare "Loading..." line.
describe('first-load skeletons', () => {
  const cases: [string, any, Record<string, unknown>, string | null][] = [
    ['table', TableWidget, { data: [], columns: [{ key: 'name' }] }, 'table'],
    ['chart', ChartWidget, { data: [], labelKey: 'm', valueKey: 'v' }, 'chart'],
    ['kpi', KpiWidget, { label: 'Revenue', value: '' }, 'kpi'],
    ['details', KeyValueWidget, { data: null }, 'details'],
    ['list view', ListViewWidget, { data: [] }, 'list'],
    ['timeline', TimelineWidget, { data: [] }, 'list'],
    ['kanban', KanbanWidget, { data: [], groupKey: 'status' }, 'board'],
    ['gallery', GalleryWidget, { data: [] }, 'grid'],
    ['badge', BadgeWidget, { value: '' }, null],
  ];

  it.each(cases)('%s shows a skeleton while busy with no data, the empty text after', async (_, widget, props, variant) => {
    const wrapper = mount(widget, { props: { props, busy: true, componentId: 'c' }, global });
    expect(skeleton(wrapper).exists()).toBe(true);
    if (variant) expect(skeleton(wrapper).attributes('data-variant')).toBe(variant);
    expect(wrapper.text()).not.toContain('Loading...');

    await wrapper.setProps({ busy: false });
    expect(skeleton(wrapper).exists()).toBe(false);
  });

  it('shows the data, not a skeleton, when a reload starts with rows already there', () => {
    const wrapper = mount(TableWidget, {
      props: { props: { data: [{ name: 'Ada' }], columns: [{ key: 'name' }] }, busy: true, componentId: 't' },
      global,
    });
    expect(skeleton(wrapper).exists()).toBe(false);
    expect(wrapper.text()).toContain('Ada');
  });

  it('never shows one in the builder', () => {
    const wrapper = mount(KpiWidget, {
      props: { props: { label: 'Revenue', value: '' }, busy: true, editable: true },
      global,
    });
    expect(skeleton(wrapper).exists()).toBe(false);
  });
});

describe('reload bar', () => {
  const component = (type: string, props: Record<string, unknown> = {}) =>
    ({ id: 'c', type, props, layout: { x: 0, y: 0, w: 4, h: 4 } }) as unknown as AppComponent;
  const bar = (w: ReturnType<typeof mount>) => w.find('[data-testid="app-loading-bar"]');

  it('runs across the top of a busy component', async () => {
    const c = component('kpi', { label: 'Revenue', value: 10 });
    const wrapper = mount(AppWidget, { props: { component: c, props: c.props, busy: true }, global });
    expect(bar(wrapper).exists()).toBe(true);
    expect(wrapper.text()).toContain('10');

    await wrapper.setProps({ busy: false });
    expect(bar(wrapper).exists()).toBe(false);
  });

  it('is left out where the component has its own spinner, and in the builder', () => {
    const button = component('button', { label: 'Go' });
    expect(bar(mount(AppWidget, { props: { component: button, props: button.props, busy: true }, global })).exists()).toBe(false);

    const kpi = component('kpi', { value: 1 });
    expect(
      bar(mount(AppWidget, { props: { component: kpi, props: kpi.props, busy: true, editable: true }, global })).exists()
    ).toBe(false);
  });
});

describe('AppWidget: clickable KPI', () => {
  const kpi = (events?: Record<string, unknown[]>) =>
    ({ id: 'k', type: 'kpi', props: { label: 'Critical', value: 3 }, layout: { x: 0, y: 0, w: 3, h: 14 }, events }) as unknown as AppComponent;
  const link = (c: AppComponent) =>
    mount(AppWidget, { props: { component: c, props: c.props }, global }).find('[data-testid="kpi-link"]');

  it('is clickable only when its click has actions', () => {
    expect(link(kpi()).exists()).toBe(false);
    expect(link(kpi({ click: [] })).exists()).toBe(false);
    expect(link(kpi({ click: [{ type: 'navigate', page: 'tickets' }] })).exists()).toBe(true);
  });

  it('passes the click on', async () => {
    const c = kpi({ click: [{ type: 'navigate', page: 'tickets' }] });
    const wrapper = mount(AppWidget, { props: { component: c, props: c.props }, global });
    await wrapper.find('[data-testid="kpi"]').trigger('click');
    expect(wrapper.emitted('event')?.[0]?.[0]).toBe('click');
  });
});
