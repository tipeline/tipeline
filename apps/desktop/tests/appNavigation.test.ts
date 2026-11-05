// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { coreValidations } from '@tipeline/schemas';
import { i18n } from '@/i18n';
import PaginationWidget from '@/components/app/widgets/PaginationWidget.vue';
import BreadcrumbsWidget from '@/components/app/widgets/BreadcrumbsWidget.vue';
import { APP_PAGE_GRID } from '@/components/app/appCanvasKey';
import { pageInfo, pageWindow } from '@/utils/appPagination';

describe('pages', () => {
  it('rows of a page; page kept inside 1..pages', () => {
    expect(pageInfo(2, 10, 57)).toEqual({ page: 2, pageSize: 10, pages: 6, total: 57, offset: 10, from: 11, to: 20 });
    expect(pageInfo(9, 10, 57)).toMatchObject({ page: 6, from: 51, to: 57 });
    expect(pageInfo(1, 10, 0)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0 });
    expect(pageInfo('x', 0, -3)).toMatchObject({ page: 1, pageSize: 10, total: 0 });
  });

  it('numbers: the same number of slots, every page when they fit, "…" only for real gaps', () => {
    expect(pageWindow(6, 20)).toEqual([1, '…', 5, 6, 7, '…', 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, '…', 20]);
    expect(pageWindow(20, 20)).toEqual([1, '…', 16, 17, 18, 19, 20]);
    expect(pageWindow(1, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageWindow(10, 20, 0)).toEqual([1, '…', 10, '…', 20]);
    expect([pageWindow(1, 1), pageWindow(2, 2)]).toEqual([[1], [1, 2]]);
    for (let page = 1; page <= 30; page++) expect(pageWindow(page, 30)).toHaveLength(7);
  });
});

describe('PaginationWidget', () => {
  const mountPager = (props: Record<string, unknown>, state: Record<string, unknown> = {}) =>
    mount(PaginationWidget, { props: { props, state, componentId: 'pager' }, global: { plugins: [i18n] } });

  it('says which rows, and moves with the numbers and arrows', async () => {
    const w = mountPager({ total: 57, pageSize: 10 }, { page: 1, pageSize: 10 });
    expect(w.get('[data-testid="pagination-summary"]').text()).toBe('1–10 of 57');
    expect(w.get('[data-testid="page-prev"]').attributes('disabled')).toBeDefined();
    await w.findAll('button[data-page]').find((b) => b.text() === '2')!.trigger('click');
    expect(w.emitted('event')?.at(-1)).toEqual(['change', { page: 2, pageSize: 10, offset: 10, from: 11, to: 20 }]);
    await w.setProps({ state: { page: 6, pageSize: 10 } });
    expect(w.get('[aria-current="page"]').text()).toBe('6');
    expect(w.get('[data-testid="page-next"]').attributes('disabled')).toBeDefined();
  });

  it('a total that shrank sends it back to the last page there is', async () => {
    const w = mountPager({ total: 57, pageSize: 10 }, { page: 6, pageSize: 10 });
    await w.setProps({ props: { total: 12, pageSize: 10 } });
    expect(w.emitted('state')?.at(-1)).toEqual([{ page: 2, pageSize: 10, offset: 10, from: 11, to: 12 }]);
  });

  it('nothing moves in the builder; a bound total shows sample pages', () => {
    const w = mount(PaginationWidget, { props: { props: { total: '{= runnables.r.outputs.count =}' }, componentId: 'p', editable: true }, global: { plugins: [i18n] } });
    expect(w.get('[data-testid="pagination-summary"]').text()).toBe('1–10 of 57');
    expect(w.findAll('button[data-page]').every((b) => b.attributes('disabled') !== undefined)).toBe(true);
  });
});

describe('BreadcrumbsWidget', () => {
  const ITEMS = [{ label: 'Orders', page: 'orders' }, { label: 'Acme', page: 'customer', params: { id: 7 } }, { label: 'Help' }, { label: '#A-1042' }];
  const mountCrumbs = (runActions = vi.fn(), extra: Record<string, unknown> = {}) =>
    mount(BreadcrumbsWidget, {
      props: { props: { items: ITEMS, homeIcon: true }, componentId: 'trail', ...extra },
      global: { plugins: [i18n], provide: { [APP_PAGE_GRID as symbol]: { runtime: { runActions } } } },
    });

  it('the trail: steps with a page are links, others plain text, the last is where you are', () => {
    const w = mountCrumbs();
    expect(w.findAll('button[data-crumb]').map((b) => b.text())).toEqual(['Orders', 'Acme']);
    expect(w.findAll('[data-crumb-text]').map((s) => s.text())).toEqual(['Help']);
    expect(w.get('[aria-current="page"]').text()).toBe('#A-1042');
  });

  it('a link goes to its page (with its params), like a Navigate action', async () => {
    const runActions = vi.fn();
    const w = mountCrumbs(runActions);
    await w.findAll('button[data-crumb]')[1].trigger('click');
    expect(runActions).toHaveBeenCalledWith([{ type: 'navigate', page: 'customer', params: { id: 7 } }]);
  });

  it('nothing happens in the builder', async () => {
    const runActions = vi.fn();
    const b = mountCrumbs(runActions, { editable: true });
    await b.findAll('button[data-crumb]')[0].trigger('click');
    expect(runActions).not.toHaveBeenCalled();
  });
});

describe('schema', () => {
  it('a breadcrumb step must name a page of the app', () => {
    const app = (page: string) => ({
      schemaVersion: 4,
      workflows: {},
      state: {},
      pages: [
        {
          id: 'orders',
          name: 'Orders',
          components: [{ id: 'trail', type: 'breadcrumbs', name: 'T', layout: { x: 0, y: 0, w: 6, h: 5 }, props: { items: [{ label: 'Back', page }, { label: 'Here' }] } }],
        },
      ],
    });
    expect(coreValidations.appObject.appSourceSchema.safeParse(app('orders')).success).toBe(true);
    const bad = coreValidations.appObject.appSourceSchema.safeParse(app('nowhere'));
    expect(JSON.stringify(bad.error?.issues)).toContain('unknown page \\"nowhere\\"');
  });
});
