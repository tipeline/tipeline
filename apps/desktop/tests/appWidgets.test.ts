// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';
import FormWidget from '@/components/app/widgets/FormWidget.vue';
import TableWidget from '@/components/app/widgets/TableWidget.vue';
import KeyValueWidget from '@/components/app/widgets/KeyValueWidget.vue';
import DateRangeWidget from '@/components/app/widgets/DateRangeWidget.vue';
import ChartWidget from '@/components/app/widgets/ChartWidget.vue';
import KpiWidget from '@/components/app/widgets/KpiWidget.vue';
import { presetRange } from '@/utils/appDates';
import { nextTick } from 'vue';

const global = { plugins: [i18n, createPinia()] };

describe('FormWidget', () => {
  const props = {
    props: {
      fields: [{ name: 'email', type: 'text', label: 'Email', required: true }],
      submitLabel: 'Send',
    },
    componentId: 'f',
  };

  it('blocks submit and shows an error when a required field is empty', async () => {
    const wrapper = mount(FormWidget, {
      props: { ...props, state: { values: { email: '' }, errors: {} } },
      global,
    });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('event')).toBeUndefined();
    expect(wrapper.emitted('state')?.at(-1)).toEqual([
      { errors: { email: 'required' } },
    ]);
    await wrapper.setProps({
      state: { values: { email: '' }, errors: { email: 'required' } },
    });
    expect(wrapper.text()).toContain('This field is required');
  });

  it('fires submit with the values when valid, and publishes edits as state', async () => {
    const wrapper = mount(FormWidget, {
      props: { ...props, state: { values: { email: 'a@b.c' }, errors: {} } },
      global,
    });

    await wrapper.find('input').setValue('x@y.z');
    expect(wrapper.emitted('state')?.[0]).toEqual([
      { values: { email: 'x@y.z' }, errors: {} },
    ]);

    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('event')).toEqual([
      ['submit', { values: { email: 'a@b.c' } }],
    ]);
  });

  it('does not submit while busy', async () => {
    const wrapper = mount(FormWidget, {
      props: {
        ...props,
        busy: true,
        state: { values: { email: 'a@b.c' }, errors: {} },
      },
      global,
    });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('event')).toBeUndefined();
  });
});

describe('TableWidget', () => {
  const rows = [
    { id: 1, name: 'Acme' },
    { id: 2, name: 'Globex' },
  ];

  it('row action buttons fire their own event with the row, without a rowClick', async () => {
    const wrapper = mount(TableWidget, {
      props: {
        props: { data: rows, rowActions: [{ id: 'edit', label: 'Edit' }] },
        state: {},
      },
      global,
    });
    const button = wrapper
      .findAll('tbody tr')[1]
      .findAll('button')
      .find((b) => b.text() === 'Edit')!;

    await button.trigger('click');

    expect(wrapper.emitted('event')).toEqual([
      ['action:edit', { selectedRow: rows[1] }],
    ]);
  });

  it('highlights the selected row', () => {
    const wrapper = mount(TableWidget, {
      props: { props: { data: rows }, state: { selectedRow: rows[0] } },
      global,
    });
    const states = wrapper
      .findAll('tbody tr')
      .map((tr) => tr.attributes('data-state'));
    expect(states).toEqual(['selected', undefined]);
  });

  it('server pagination: the pager asks for the next page and stops at the last one', async () => {
    const props = { data: rows, pageSize: 2, pagination: 'server', total: 5 };
    const wrapper = mount(TableWidget, {
      props: { props, state: { page: 1, pageSize: 2 } },
      global,
    });

    expect(wrapper.text()).toContain('1–2 of 5');
    expect(
      wrapper.find('button[title="Previous page"]').attributes('disabled')
    ).toBeDefined();
    await wrapper.find('button[title="Next page"]').trigger('click');
    expect(wrapper.emitted('event')).toEqual([
      ['pageChange', { page: 2, pageSize: 2 }],
    ]);

    await wrapper.setProps({
      state: { page: 3, pageSize: 2 },
      props: { ...props, data: [rows[0]] },
    });
    expect(wrapper.text()).toContain('5–5 of 5');
    expect(
      wrapper.find('button[title="Next page"]').attributes('disabled')
    ).toBeDefined();
  });
});

describe('TableWidget: editing', () => {
  const rows = [
    { id: 1, name: 'Acme', amount: 100 },
    { id: 2, name: 'Globex', amount: 200 },
  ];
  const tableProps = {
    data: rows,
    rowKey: 'id',
    allowAdd: true,
    allowDelete: true,
    columns: [
      { key: 'id' },
      { key: 'name', editable: true, required: true },
      { key: 'amount', format: 'number', editable: true, default: 0 },
    ],
  };

  /** Mounts the table with its state kept the way the runtime keeps it. */
  function mountEditable(props: Record<string, unknown> = tableProps) {
    let state: Record<string, unknown> = {};
    const wrapper = mount(TableWidget, {
      props: {
        props,
        state,
        componentId: 't',
        onState: async (patch: Record<string, unknown>) => {
          state = { ...state, ...patch };
          await wrapper.setProps({ state });
        },
      },
      global,
    });
    return { wrapper, state: () => state };
  }

  const button = (wrapper: ReturnType<typeof mount>, text: string) =>
    wrapper.findAll('button').find((b) => b.text() === text);

  it('edits a cell in place, then saves the changes', async () => {
    const { wrapper, state } = mountEditable();
    expect(button(wrapper, 'Save')).toBeUndefined(); // nothing to save yet

    const amount = wrapper.findAll('tbody tr')[1].findAll('input')[1];
    await amount.setValue('250');
    await amount.trigger('change');

    expect(state().changes).toEqual({ added: [], updated: [{ id: 2, name: 'Globex', amount: 250 }], deleted: [] });
    expect(state().hasChanges).toBe(true);
    expect(wrapper.text()).toContain('1 unsaved change');

    await button(wrapper, 'Save')!.trigger('click');
    expect(wrapper.emitted('event')?.at(-1)).toEqual(['save', { changes: state().changes }]);
  });

  it('adds a row with defaults; Save waits until its required cells are filled', async () => {
    const { wrapper, state } = mountEditable();
    await button(wrapper, 'Add row')!.trigger('click');

    expect(wrapper.findAll('tbody tr')).toHaveLength(3);
    expect(state().changes).toMatchObject({ added: [{ id: null, name: null, amount: 0 }] });
    expect(button(wrapper, 'Save')!.attributes('disabled')).toBeDefined();

    const name = wrapper.findAll('tbody tr')[2].findAll('input')[0];
    await name.setValue('Hooli');
    await name.trigger('change');
    expect(button(wrapper, 'Save')!.attributes('disabled')).toBeUndefined();
  });

  it('deletes and restores rows, and Discard drops everything', async () => {
    const { wrapper, state } = mountEditable();
    await wrapper.findAll('tbody tr')[0].find('button[title="Delete row"]').trigger('click');
    expect(state().changes).toMatchObject({ deleted: [rows[0]] });
    expect(wrapper.findAll('tbody tr')[0].classes()).toContain('line-through');

    await wrapper.findAll('tbody tr')[0].find('button[title="Restore row"]').trigger('click');
    expect(state().hasChanges).toBe(false);

    await button(wrapper, 'Add row')!.trigger('click');
    await button(wrapper, 'Discard')!.trigger('click');
    expect(state()).toMatchObject({ added: [], hasChanges: false });
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
  });

  it('new data (a refresh after saving) drops the edits', async () => {
    const { wrapper, state } = mountEditable();
    await button(wrapper, 'Add row')!.trigger('click');
    expect(state().hasChanges).toBe(true);

    await wrapper.setProps({ props: { ...tableProps, data: [...rows, { id: 3, name: 'Hooli', amount: 0 }] } });
    expect(state().hasChanges).toBe(false);
  });

  it('a read-only table renders no editors', () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows }, state: {} }, global });
    expect(wrapper.findAll('input')).toHaveLength(0);
    expect(button(wrapper, 'Add row')).toBeUndefined();
  });
});

describe('TableWidget: multi-select and bulk actions', () => {
  const rows = [
    { id: 1, name: 'Acme', status: 'open' },
    { id: 2, name: 'Globex', status: 'open' },
    { id: 3, name: 'Initech', status: 'closed' },
  ];
  const tableProps = {
    data: rows,
    rowKey: 'id',
    searchable: true,
    bulkActions: [
      { id: 'close', label: 'Close' },
      { id: 'remove', label: 'Delete', variant: 'destructive' },
    ],
  };

  function mountSelectable(props: Record<string, unknown> = tableProps) {
    let state: Record<string, unknown> = {};
    const wrapper = mount(TableWidget, {
      props: {
        props,
        state,
        componentId: 't',
        onState: async (patch: Record<string, unknown>) => {
          state = { ...state, ...patch };
          await wrapper.setProps({ state });
        },
      },
      global,
      attachTo: document.body,
    });
    return { wrapper, state: () => state };
  }

  const button = (wrapper: ReturnType<typeof mount>, text: string) =>
    wrapper.findAll('button').find((b) => b.text() === text);
  const rowBox = (wrapper: ReturnType<typeof mount>, i: number) =>
    wrapper.findAll('tbody tr')[i].find('button[role="checkbox"]');
  const headerBox = (wrapper: ReturnType<typeof mount>) => wrapper.find('thead button[role="checkbox"]');

  it('checks rows, and a bulk action fires with the checked rows', async () => {
    const { wrapper, state } = mountSelectable();
    expect(button(wrapper, 'Close')!.attributes('disabled')).toBeDefined();

    await rowBox(wrapper, 0).trigger('click');
    await rowBox(wrapper, 2).trigger('click');
    expect(state().selectedRows).toEqual([rows[0], rows[2]]);
    expect(wrapper.text()).toContain('2 selected');
    expect(wrapper.emitted('event')?.map(([name]) => name)).toEqual(['selectionChange', 'selectionChange']);

    await button(wrapper, 'Close')!.trigger('click');
    expect(wrapper.emitted('event')?.at(-1)).toEqual(['bulk:close', { selectedRows: [rows[0], rows[2]] }]);
    wrapper.unmount();
  });

  it('checking a row does not click it', async () => {
    const { wrapper } = mountSelectable();
    await rowBox(wrapper, 1).trigger('click');
    expect(wrapper.emitted('event')?.some(([name]) => name === 'rowClick')).toBe(false);
    wrapper.unmount();
  });

  it('the header box checks only the rows the search shows, then unchecks them', async () => {
    const { wrapper, state } = mountSelectable();
    await wrapper.find('input').setValue('Glob');
    await headerBox(wrapper).trigger('click');
    expect(state().selectedRows).toEqual([rows[1]]);

    await wrapper.find('input').setValue('');
    expect(headerBox(wrapper).attributes('data-state')).toBe('indeterminate');
    await headerBox(wrapper).trigger('click'); // some checked → check the rest
    expect(state().selectedRows).toEqual(rows);
    await headerBox(wrapper).trigger('click');
    expect(state().selectedRows).toEqual([]);
    wrapper.unmount();
  });

  it('Clear unchecks everything', async () => {
    const { wrapper, state } = mountSelectable();
    await rowBox(wrapper, 0).trigger('click');
    await button(wrapper, 'Clear')!.trigger('click');
    expect(state()).toMatchObject({ selectedKeys: [], selectedRows: [] });
    wrapper.unmount();
  });

  it('refreshed data keeps rows checked by rowKey, with their new values, and drops rows that are gone', async () => {
    const { wrapper, state } = mountSelectable();
    await rowBox(wrapper, 0).trigger('click');
    await rowBox(wrapper, 1).trigger('click');

    const refreshed = [{ id: 2, name: 'Globex', status: 'closed' }, rows[2]];
    await wrapper.setProps({ props: { ...tableProps, data: refreshed } });
    expect(state()).toMatchObject({ selectedKeys: ['=2'], selectedRows: [refreshed[0]] });
    wrapper.unmount();
  });

  it('without a rowKey, new data unchecks everything', async () => {
    const props = { ...tableProps, rowKey: undefined };
    const { wrapper, state } = mountSelectable(props);
    await rowBox(wrapper, 0).trigger('click');
    await wrapper.setProps({ props: { ...props, data: [rows[1], rows[0]] } });
    expect(state().selectedRows).toEqual([]);
    wrapper.unmount();
  });

  it('in an editable table, checked rows carry their unsaved edits', async () => {
    const { wrapper, state } = mountSelectable({
      ...tableProps,
      columns: [{ key: 'id' }, { key: 'name', editable: true }],
    });
    await rowBox(wrapper, 0).trigger('click');
    const name = wrapper.findAll('tbody tr')[0].find('input');
    await name.setValue('Acme Corp');
    await name.trigger('change');
    expect(state().selectedRows).toEqual([{ ...rows[0], name: 'Acme Corp' }]);
    // bulk actions wait until the edits are saved or discarded
    expect(button(wrapper, 'Close')!.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('multiSelect alone shows checkboxes without bulk buttons', async () => {
    const { wrapper } = mountSelectable({ data: rows, rowKey: 'id', multiSelect: true });
    expect(wrapper.findAll('tbody button[role="checkbox"]')).toHaveLength(3);
    expect(button(wrapper, 'Close')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('KeyValueWidget', () => {
  const record = {
    id: 7,
    name: 'Acme',
    amount: 1200,
    note: '',
    customer: { name: 'Wile E.', city: 'Desert' },
  };
  const pairs = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('dt').map((dt) => [dt.text(), (dt.element.nextElementSibling as HTMLElement).textContent!.trim()]);

  it('shows every key of the object when no fields are set, objects as JSON', () => {
    const wrapper = mount(KeyValueWidget, { props: { props: { data: record } }, global });
    expect(pairs(wrapper).map(([label]) => label)).toEqual(['id', 'name', 'amount', 'note', 'customer']);
    expect(wrapper.find('pre').text()).toContain('"city": "Desert"');
    expect(pairs(wrapper)[3][1]).toBe('—'); // empty value
  });

  it('fields set the order, labels and formats, and reach into nested objects', () => {
    const wrapper = mount(KeyValueWidget, {
      props: {
        props: {
          data: record,
          fields: [
            { key: 'customer.name', label: 'Customer' },
            { key: 'amount', label: 'Amount', format: 'currency', currency: 'USD' },
            { key: 'missing', label: 'Missing' },
          ],
        },
      },
      global,
    });
    expect(pairs(wrapper)).toEqual([
      ['Customer', 'Wile E.'],
      ['Amount', '$1,200.00'],
      ['Missing', '—'],
    ]);
  });

  it('hideEmpty leaves out fields without a value', () => {
    const wrapper = mount(KeyValueWidget, { props: { props: { data: record, hideEmpty: true } }, global });
    expect(pairs(wrapper).map(([label]) => label)).not.toContain('note');
  });

  it('shows emptyText while there is no object (e.g. no row selected)', () => {
    const wrapper = mount(KeyValueWidget, {
      props: { props: { data: null, emptyText: 'Select a record' } },
      global,
    });
    expect(wrapper.text()).toContain('Select a record');
    expect(wrapper.findAll('dt')).toHaveLength(0);
  });

  it('copy buttons copy the raw value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const wrapper = mount(KeyValueWidget, {
      props: { props: { data: record, fields: [{ key: 'amount', format: 'currency' }], copyable: true } },
      global,
    });
    await wrapper.find('button[title="Copy value"]').trigger('click');
    expect(writeText).toHaveBeenCalledWith('1200');
  });

  it('in the builder, lists the configured labels without values', () => {
    const wrapper = mount(KeyValueWidget, {
      props: {
        props: { data: '{= recordsTable.selectedRow =}', fields: [{ key: 'name', label: 'Name' }] },
        editable: true,
      },
      global,
    });
    expect(pairs(wrapper)).toEqual([['Name', '—']]);
  });
});

describe('DateRangeWidget', () => {
  const range = { from: '2026-10-01', to: '2026-10-05' };

  function mountRange(props: Record<string, unknown> = {}, value: unknown = null) {
    return mount(DateRangeWidget, {
      props: { props: { label: 'Period', ...props }, state: { value }, componentId: 'period' },
      global,
      attachTo: document.body,
    });
  }
  const inBody = (text: string) =>
    [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

  it('shows the picked range, or the placeholder', () => {
    const picked = mountRange({}, range);
    // Intl puts thin spaces around the dash
    expect(picked.text().replace(/\s/g, ' ')).toContain('Oct 1 – 5, 2026');
    picked.unmount();
    const empty = mountRange({ placeholder: 'Any time' });
    expect(empty.text()).toContain('Any time');
    empty.unmount();
  });

  it('a preset sets from / to and fires change', async () => {
    const wrapper = mountRange();
    await wrapper.find('button#app-period').trigger('click');
    await nextTick();
    inBody('Last 7 days')!.click();
    await nextTick();
    const expected = presetRange('last7Days');
    const patch = { value: expected, from: expected.from, to: expected.to };
    // the state also clears a stepper's "required" error
    expect(wrapper.emitted('state')?.at(-1)).toEqual([{ ...patch, error: null }]);
    expect(wrapper.emitted('event')?.at(-1)).toEqual(['change', patch]);
    wrapper.unmount();
  });

  it('clear empties it — unless required', async () => {
    const wrapper = mountRange({}, range);
    await wrapper.find('button[title="Clear"]').trigger('click');
    expect(wrapper.emitted('event')?.at(-1)).toEqual(['change', { value: null, from: null, to: null }]);
    wrapper.unmount();
    const required = mountRange({ required: true }, range);
    expect(required.find('button[title="Clear"]').exists()).toBe(false);
    required.unmount();
  });

  it('hidePresets leaves only the calendar', async () => {
    const wrapper = mountRange({ hidePresets: true });
    await wrapper.find('button#app-period').trigger('click');
    await nextTick();
    expect(inBody('Last 7 days')).toBeUndefined();
    wrapper.unmount();
  });

  it('is not clickable in the builder', () => {
    const wrapper = mount(DateRangeWidget, {
      props: { props: { label: 'Period' }, componentId: 'period', editable: true },
      global,
    });
    expect(wrapper.find('button#app-period').attributes('disabled')).toBeDefined();
  });
});

describe('ListViewWidget: telling the builder what items look like', () => {
  it('reports its items in Preview (a running page), not on the design canvas', async () => {
    const { default: ListViewWidget } = await import('@/components/app/widgets/ListViewWidget.vue');
    const { APP_LIST_SAMPLES, APP_RUNTIME } = await import('@/components/app/appRuntimeKey');
    const report = vi.fn();
    const provide = {
      [APP_LIST_SAMPLES as symbol]: report,
      [APP_RUNTIME as symbol]: { appIdentifier: () => 'a', pageId: () => 'cards', runnables: {} },
    };
    const items = [{ id: 1, name: 'Acme' }];
    mount(ListViewWidget, { props: { props: { data: items }, componentId: 'recordCards' }, global: { ...global, provide } });
    expect(report).toHaveBeenCalledWith('cards', 'recordCards', items);

    report.mockClear();
    mount(ListViewWidget, { props: { props: { data: items }, componentId: 'recordCards', editable: true }, global: { ...global, provide } });
    expect(report).not.toHaveBeenCalled();
  });

  it('names item and index in the builder template header', async () => {
    const { default: ListViewWidget } = await import('@/components/app/widgets/ListViewWidget.vue');
    const wrapper = mount(ListViewWidget, { props: { props: {}, componentId: 'recordCards', editable: true }, global });
    expect(wrapper.findAll('code').map((c) => c.text())).toEqual(['item', 'index']);
  });
});

describe('ListViewWidget: the selected item stays current when the data reloads', () => {
  const records = [
    { id: 1, name: 'Acme', status: 'pending' },
    { id: 2, name: 'Globex', status: 'pending' },
  ];

  async function mountList(props: Record<string, unknown>) {
    const { default: ListViewWidget } = await import('@/components/app/widgets/ListViewWidget.vue');
    let state: Record<string, unknown> = { selectedItem: null, selectedIndex: null };
    const wrapper = mount(ListViewWidget, {
      props: {
        props,
        state,
        componentId: 'cards',
        onState: async (patch: Record<string, unknown>) => {
          state = { ...state, ...patch };
          await wrapper.setProps({ state });
        },
        onEvent: async (_name: string, payload: Record<string, unknown>) => {
          state = { ...state, ...payload };
          await wrapper.setProps({ state });
        },
      },
      global,
    });
    return { wrapper, state: () => state };
  }

  it('picks up the clicked record’s new values after a reload (the Activate case)', async () => {
    const { wrapper, state } = await mountList({ data: records, itemKey: 'id' });
    await wrapper.findAll('[data-list-item]')[1].trigger('click');
    expect(state().selectedItem).toEqual(records[1]);

    const reloaded = [records[0], { ...records[1], status: 'active' }];
    await wrapper.setProps({ props: { data: reloaded, itemKey: 'id' } });
    expect(state()).toMatchObject({ selectedItem: { id: 2, status: 'active' }, selectedIndex: 1 });
  });

  it('with itemKey it follows the record when the order changes, and drops it when it is gone', async () => {
    const { wrapper, state } = await mountList({ data: records, itemKey: 'id' });
    await wrapper.findAll('[data-list-item]')[1].trigger('click');

    await wrapper.setProps({ props: { data: [records[1], records[0]], itemKey: 'id' } });
    expect(state()).toMatchObject({ selectedItem: { id: 2 }, selectedIndex: 0 });

    await wrapper.setProps({ props: { data: [records[0]], itemKey: 'id' } });
    expect(state()).toMatchObject({ selectedItem: null, selectedIndex: null });
  });

  it('without itemKey it stays on the same position', async () => {
    const { wrapper, state } = await mountList({ data: records });
    await wrapper.findAll('[data-list-item]')[0].trigger('click');
    await wrapper.setProps({ props: { data: [{ id: 9, name: 'New' }, records[1]] } });
    expect(state()).toMatchObject({ selectedItem: { id: 9 }, selectedIndex: 0 });
  });
});

describe('TextWidget: markdown', () => {
  it('renders Markdown when asked, with links opening outside the app', async () => {
    const { default: TextWidget } = await import('@/components/app/widgets/TextWidget.vue');
    const wrapper = mount(TextWidget, {
      props: { props: { markdown: true, content: 'Hello **Acme** — see [docs](https://example.com)\n\n- one\n- two' } },
      global,
    });
    expect(wrapper.find('strong').text()).toBe('Acme');
    expect(wrapper.find('a').attributes()).toMatchObject({ href: 'https://example.com', target: '_blank' });
    expect(wrapper.findAll('li')).toHaveLength(2);
  });

  it('a bound value with HTML stays text', async () => {
    const { default: TextWidget } = await import('@/components/app/widgets/TextWidget.vue');
    const wrapper = mount(TextWidget, {
      props: { props: { markdown: true, content: 'Name: <img src=x onerror="alert(1)">' } },
      global,
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('<img src=x');
  });

  it('without markdown, shows the text exactly as written (unchanged)', async () => {
    const { default: TextWidget } = await import('@/components/app/widgets/TextWidget.vue');
    const wrapper = mount(TextWidget, { props: { props: { content: 'Hello **Acme**' } }, global });
    expect(wrapper.text()).toBe('Hello **Acme**');
    expect(wrapper.find('strong').exists()).toBe(false);
  });
});

describe('ImageWidget', () => {
  const file = '/Users/ana/Tipeline/output/qr.png';

  it('shows a file a workflow saved, and reloads it when a run it depends on ends', async () => {
    const { default: ImageWidget } = await import('@/components/app/widgets/ImageWidget.vue');
    const wrapper = mount(ImageWidget, { props: { props: { src: file, alt: 'QR' }, busy: false }, global });
    expect(wrapper.find('img').attributes('src')).toBe('tipeline-asset:///Users/ana/Tipeline/output/qr.png');
    await wrapper.setProps({ busy: true });
    await wrapper.setProps({ busy: false });
    expect(wrapper.find('img').attributes('src')).toBe('tipeline-asset:///Users/ana/Tipeline/output/qr.png?v=1');
  });

  it('says so when the file can’t be loaded, and when the value isn’t an image', async () => {
    const { default: ImageWidget } = await import('@/components/app/widgets/ImageWidget.vue');
    const missing = mount(ImageWidget, { props: { props: { src: file } }, global });
    await missing.find('img').trigger('error');
    expect(missing.text()).toContain('Image not found');
    expect(missing.text()).toContain('~/Tipeline');
    const invalid = mount(ImageWidget, { props: { props: { src: 'ftp://nope' } }, global });
    expect(invalid.text()).toContain('isn’t an image');
    const empty = mount(ImageWidget, { props: { props: {} }, global });
    expect(empty.text()).toContain('No image');
  });

  it('fires click, and zooms when zoomable', async () => {
    const { default: ImageWidget } = await import('@/components/app/widgets/ImageWidget.vue');
    const wrapper = mount(ImageWidget, {
      props: { props: { src: 'https://example.com/a.png', zoomable: true, caption: 'Today' } },
      global,
      attachTo: document.body,
    });
    expect(wrapper.text()).toContain('Today');
    await wrapper.find('img').trigger('click');
    expect(wrapper.emitted('event')).toEqual([['click']]);
    await new Promise((r) => setTimeout(r));
    expect(document.body.querySelectorAll('[role="dialog"] img')).toHaveLength(1);
    wrapper.unmount();
  });

  it('in the builder, shows what a bound source is bound to', async () => {
    const { default: ImageWidget } = await import('@/components/app/widgets/ImageWidget.vue');
    const wrapper = mount(ImageWidget, {
      props: { props: { src: '{{ runnables.qr.outputs.path }}' }, editable: true },
      global,
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('{{ runnables.qr.outputs.path }}');
  });
});

describe('Checkbox: switch or tick box', () => {
  it('is a switch by default, a tick box with display: checkbox — same true/false value', async () => {
    const { default: CheckboxWidget } = await import('@/components/app/widgets/CheckboxWidget.vue');
    const asSwitch = mount(CheckboxWidget, { props: { props: { label: 'Notify' }, state: { value: false }, componentId: 'c' }, global });
    expect(asSwitch.find('[role="switch"]').exists()).toBe(true);
    expect(asSwitch.find('[role="checkbox"]').exists()).toBe(false);

    const asBox = mount(CheckboxWidget, {
      props: { props: { label: 'I agree', display: 'checkbox' }, state: { value: false }, componentId: 'c' },
      global,
    });
    expect(asBox.find('[role="switch"]').exists()).toBe(false);
    await asBox.find('[role="checkbox"]').trigger('click');
    expect(asBox.emitted('state')?.at(-1)).toEqual([{ value: true }]);
    expect(asBox.emitted('event')?.at(-1)).toEqual(['change', { value: true }]);
  });

  it('a form’s checkbox field can be a tick box too', () => {
    const wrapper = mount(FormWidget, {
      props: {
        props: {
          fields: [
            { name: 'terms', type: 'checkbox', label: 'I accept', display: 'checkbox' },
            { name: 'news', type: 'checkbox', label: 'Newsletter' },
          ],
        },
        state: { values: { terms: false, news: false }, errors: {} },
        componentId: 'f',
      },
      global,
    });
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(1);
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(1);
  });
});

describe('Select: dropdown, list or buttons', () => {
  const options = [{ label: 'Low', value: 1 }, { label: 'Medium', value: 2 }, { label: 'High', value: 3 }];

  async function mountSelect(props: Record<string, unknown>, value: unknown = null) {
    const { default: SelectWidget } = await import('@/components/app/widgets/SelectWidget.vue');
    return mount(SelectWidget, { props: { props: { options, ...props }, state: { value }, componentId: 's' }, global, attachTo: document.body });
  }

  it('list: radio buttons — picking one sets the value', async () => {
    const wrapper = await mountSelect({ display: 'list' }, 1);
    const radios = wrapper.findAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[0].attributes('aria-checked')).toBe('true');
    await radios[2].trigger('click');
    expect(wrapper.emitted('event')?.at(-1)).toEqual(['change', { value: 3 }]);
    wrapper.unmount();
  });

  it('buttons: a segmented row, the chosen one pressed', async () => {
    const wrapper = await mountSelect({ display: 'buttons' }, 2);
    const buttons = wrapper.findAll('button[role="radio"]');
    expect(buttons.map((b) => b.text())).toEqual(['Low', 'Medium', 'High']);
    expect(buttons[1].attributes('aria-checked')).toBe('true');
    await buttons[0].trigger('click');
    expect(wrapper.emitted('event')?.at(-1)).toEqual(['change', { value: 1 }]);
    wrapper.unmount();
  });

  it('buttons with multiple: toggle buttons, several on', async () => {
    const wrapper = await mountSelect({ display: 'buttons', multiple: true }, [1]);
    const buttons = wrapper.findAll('button[aria-pressed]');
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['true', 'false', 'false']);
    await buttons[2].trigger('click');
    expect(wrapper.emitted('event')?.at(-1)).toEqual(['change', { value: [1, 3] }]);
    wrapper.unmount();
  });

  it('dropdown stays the default', async () => {
    const wrapper = await mountSelect({});
    expect(wrapper.find('[role="combobox"]').exists()).toBe(true);
    expect(wrapper.find('[role="radio"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Badges', () => {
  it('the Badge component shows a status, or tags, with a caption', async () => {
    const { default: BadgeWidget } = await import('@/components/app/widgets/BadgeWidget.vue');
    const one = mount(BadgeWidget, { props: { props: { label: 'Status', value: 'pending' } }, global });
    expect(one.text()).toContain('Status');
    expect(one.find('[data-color]').attributes('data-color')).toBe('amber');
    const tags = mount(BadgeWidget, { props: { props: { value: ['urgent', 'billing'], colors: { urgent: 'red' } } }, global });
    expect(tags.findAll('[data-color]').map((b) => [b.text(), b.attributes('data-color')])[0]).toEqual(['urgent', 'red']);
    expect(tags.findAll('[data-color]')).toHaveLength(2);
    const empty = mount(BadgeWidget, { props: { props: { value: '' } }, global });
    expect(empty.text()).toBe('—');
  });

  it('a table column with format: badge shows pills', () => {
    const wrapper = mount(TableWidget, {
      props: {
        props: {
          data: [{ name: 'Acme', status: 'active' }, { name: 'Initech', status: 'closed' }],
          columns: [{ key: 'name' }, { key: 'status', format: 'badge', colors: { closed: 'purple' } }],
        },
        state: {},
      },
      global,
    });
    expect(wrapper.findAll('tbody [data-color]').map((b) => `${b.text()}:${b.attributes('data-color')}`)).toEqual([
      'active:green',
      'closed:purple',
    ]);
  });

  it('a Details field with format: badge too', () => {
    const wrapper = mount(KeyValueWidget, {
      props: { props: { data: { status: 'failed', tags: ['a', 'b'] }, fields: [{ key: 'status', format: 'badge' }, { key: 'tags', format: 'badge' }] } },
      global,
    });
    expect(wrapper.findAll('[data-color]').map((b) => b.text())).toEqual(['failed', 'a', 'b']);
  });
});

describe('TableWidget: links, images, highlights, filters, expandable rows', () => {
  const rows = [
    { id: 1, name: 'Acme', site: 'https://acme.example', logo: 'https://acme.example/logo.png', amount: -50, status: 'active', notes: 'Call back' },
    { id: 2, name: 'Globex', site: 'javascript:alert(1)', logo: '', amount: 2500, status: 'closed', notes: '' },
  ];
  const columns = [
    { key: 'name', filter: 'text' },
    { key: 'site', format: 'link', linkText: 'Open' },
    { key: 'logo', format: 'image' },
    { key: 'amount', highlight: [{ compareAs: 'number', operator: 'lt', value: 0, color: 'red' }, { compareAs: 'number', operator: 'gte', value: 1000, color: 'green' }] },
    { key: 'status', filter: 'select' },
  ];

  it('link columns open safe URLs outside the app; others stay text', () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows, columns }, state: {} }, global });
    const links = wrapper.findAll('tbody a');
    expect(links).toHaveLength(1);
    expect(links[0].attributes()).toMatchObject({ href: 'https://acme.example', target: '_blank' });
    expect(links[0].text()).toBe('Open');
    expect(wrapper.findAll('tbody tr')[1].text()).toContain('javascript:alert(1)');
  });

  it('image columns show a thumbnail', () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows, columns }, state: {} }, global });
    expect(wrapper.findAll('tbody img').map((i) => i.attributes('src'))).toEqual(['https://acme.example/logo.png']);
  });

  it('copy columns copy the raw value without clicking the row', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const data = [
      { name: 'Acme', amount: 1234.5, tags: ['a'] },
      { name: '', amount: 10, tags: null },
    ];
    const wrapper = mount(TableWidget, {
      props: {
        props: { data, columns: [{ key: 'name', copy: true }, { key: 'amount', format: 'currency', currency: 'USD', copy: true }, { key: 'tags', copy: true }] },
        state: {},
      },
      global,
    });
    // Empty cells have nothing to copy.
    expect(wrapper.findAll('[data-copy-cell]')).toHaveLength(4);
    const buttons = wrapper.findAll('tbody tr')[0].findAll('[data-copy-cell]');
    await buttons[1].trigger('click');
    expect(writeText).toHaveBeenLastCalledWith('1234.5');
    await buttons[2].trigger('click');
    expect(writeText).toHaveBeenLastCalledWith('[\n  "a"\n]');
    expect(wrapper.emitted('event')?.some(([name]) => name === 'rowClick')).toBeFalsy();
  });

  it('copy buttons are not shown in the builder', () => {
    const wrapper = mount(TableWidget, {
      props: { props: { data: rows, columns: [{ key: 'name', copy: true }] }, state: {}, editable: true },
      global,
    });
    expect(wrapper.find('[data-copy-cell]').exists()).toBe(false);
  });

  it('highlight rules color cells', () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows, columns }, state: {} }, global });
    expect(wrapper.findAll('[data-highlight]').map((c) => `${c.text()}:${c.attributes('data-highlight')}`)).toEqual([
      '-50:red',
      '2500:green',
    ]);
  });

  it('column filters: a text box and a select of the column’s own values', async () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows, columns }, state: {} }, global, attachTo: document.body });
    const nameFilter = wrapper.find('input[placeholder="Filter name…"]');
    expect(nameFilter.exists()).toBe(true);
    await nameFilter.setValue('glob');
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.find('tbody').text()).toContain('Globex');
    expect(wrapper.find('[role="combobox"]').exists()).toBe(true); // the status select
    wrapper.unmount();
  });

  it('expandable rows show the row’s fields underneath', async () => {
    const wrapper = mount(TableWidget, {
      props: { props: { data: rows, columns: [{ key: 'name' }], expandable: true, detailFields: [{ key: 'notes', label: 'Notes' }, { key: 'status', format: 'badge' }] }, state: {} },
      global,
    });
    expect(wrapper.findAll('dt')).toHaveLength(0);
    await wrapper.find('button[aria-expanded="false"]').trigger('click');
    expect(wrapper.findAll('dt').map((d) => d.text())).toEqual(['Notes', 'status']);
    expect(wrapper.find('[data-color]').text()).toBe('active');
    expect(wrapper.emitted('event')).toBeUndefined(); // expanding doesn't click the row
  });
});

describe('TableWidget: fitting the width', () => {
  const rows = [
    { id: 1, name: 'Acme Corporation', notes: 'A long note about this account and what comes next' },
    { id: 2, name: 'Globex', notes: 'Short' },
  ];
  const wrapperClass = (wrapper: ReturnType<typeof mount>) => wrapper.find('.table-wrapper').classes();

  it('without fit it scrolls sideways, as before (no colgroup, no widths)', () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows }, state: {} }, global });
    expect(wrapperClass(wrapper)).toContain('table-fit-scroll');
    expect(wrapperClass(wrapper)).toContain('table-wrapper-dense');
    expect(wrapper.find('colgroup').exists()).toBe(false);
  });

  it('truncate: one <col> per column, shared by content; buttons and checkboxes keep their width', () => {
    const wrapper = mount(TableWidget, {
      props: {
        props: {
          data: rows,
          fit: 'truncate',
          multiSelect: true,
          columns: [{ key: 'id', width: 60 }, { key: 'name' }, { key: 'notes', minWidth: 200 }],
          rowActions: [{ id: 'open', label: 'Open' }],
        },
        state: {},
      },
      global,
    });
    expect(wrapperClass(wrapper)).toContain('table-fit-truncate');
    const widths = wrapper.findAll('col').map((c) => (c.element as HTMLElement).style.width);
    expect(widths[0]).toBe('40px'); // checkbox
    expect(widths[1]).toBe('60px'); // id: width 60
    expect(parseFloat(widths[3])).toBeGreaterThan(parseFloat(widths[2])); // notes holds more than name
    expect(widths[4]).toBe(`${24 + 4 * 7 + 18}px`); // one "Open" button
    // past its minimums (name 56px, notes 200px) the table scrolls instead
    const minWidth = (wrapper.find('.table-wrapper').element as HTMLElement).style.getPropertyValue('--table-min-width');
    expect(minWidth).toBe(`${40 + 60 + 56 + 200 + (24 + 4 * 7 + 18)}px`);
  });

  it('wrap: the same column widths as truncate', () => {
    const wrapper = mount(TableWidget, {
      props: { props: { data: rows, fit: 'wrap', columns: [{ key: 'id', width: 60 }, { key: 'notes' }] }, state: {} },
      global,
    });
    expect(wrapperClass(wrapper)).toContain('table-fit-wrap');
    expect(wrapper.findAll('col').map((c) => (c.element as HTMLElement).style.width)).toEqual(['60px', '100%']);
  });

  it('scroll: column width / minWidth go on the cells', () => {
    const wrapper = mount(TableWidget, {
      props: { props: { data: rows, fit: 'scroll', columns: [{ key: 'id', width: 60 }, { key: 'notes', minWidth: 200 }] }, state: {} },
      global,
    });
    expect(wrapper.find('colgroup').exists()).toBe(false);
    const [id, notes] = wrapper.findAll('tbody tr')[0].findAll('td').map((td) => (td.element as HTMLElement).style);
    expect([id.width, id.maxWidth]).toEqual(['60px', '60px']);
    expect(notes.minWidth).toBe('200px');
  });

  it('an unknown fit is treated as scroll', () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows, fit: 'squeeze' }, state: {} }, global });
    expect(wrapperClass(wrapper)).toContain('table-fit-scroll');
  });
});

describe('TableWidget: sorting', () => {
  const rows = [
    { id: 1, name: 'globex', amount: '100', due: '2024-03-01' },
    { id: 2, name: 'Acme', amount: '9', due: null },
    { id: 3, name: 'initech', amount: '20', due: '2023-12-31' },
  ];
  const columns = [
    { key: 'id', sortable: false },
    { key: 'name' },
    { key: 'amount', format: 'number' },
    { key: 'due', format: 'date' },
  ];
  const ids = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('tbody tr').map((tr) => tr.findAll('td')[0].text());
  const sortBy = (wrapper: ReturnType<typeof mount>, key: string, shiftKey = false) =>
    wrapper.find(`[data-sort-column="${key}"]`).trigger('click', { shiftKey });

  it('a header click sorts ascending, then descending, then back to the data order', async () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows, columns }, state: {} }, global });
    expect(ids(wrapper)).toEqual(['1', '2', '3']);
    await sortBy(wrapper, 'name');
    expect(ids(wrapper)).toEqual(['2', '1', '3']); // case-insensitive
    expect(wrapper.find('th[aria-sort="ascending"]').exists()).toBe(true);
    await sortBy(wrapper, 'name');
    expect(ids(wrapper)).toEqual(['3', '1', '2']);
    expect(wrapper.find('th[aria-sort="descending"]').exists()).toBe(true);
    await sortBy(wrapper, 'name');
    expect(ids(wrapper)).toEqual(['1', '2', '3']);
  });

  it('sorts numbers and dates by value, empty cells last either way', async () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows, columns }, state: {} }, global });
    await sortBy(wrapper, 'amount'); // number columns start ascending too
    expect(ids(wrapper)).toEqual(['2', '3', '1']);
    await sortBy(wrapper, 'due');
    expect(ids(wrapper)).toEqual(['3', '1', '2']);
    await sortBy(wrapper, 'due');
    expect(ids(wrapper)).toEqual(['1', '3', '2']);
  });

  it('a sortable: false column has a plain header', () => {
    const wrapper = mount(TableWidget, { props: { props: { data: rows, columns }, state: {} }, global });
    expect(wrapper.find('[data-sort-column="id"]').exists()).toBe(false);
    expect(wrapper.find('[data-sort-column="name"]').exists()).toBe(true);
  });

  it('starts from sortBy / sortOrder, and keeps the sort when new data comes', async () => {
    const wrapper = mount(TableWidget, {
      props: { props: { data: rows, columns, sortBy: 'amount', sortOrder: 'desc' }, state: {} },
      global,
    });
    expect(ids(wrapper)).toEqual(['1', '3', '2']);
    await sortBy(wrapper, 'name');
    await wrapper.setProps({
      props: { data: [...rows, { id: 4, name: 'Beta', amount: '1' }], columns, sortBy: 'amount', sortOrder: 'desc' },
    });
    expect(ids(wrapper)).toEqual(['2', '4', '1', '3']);
    // a new sortBy starts over
    await wrapper.setProps({ props: { data: rows, columns, sortBy: 'amount' } });
    expect(ids(wrapper)).toEqual(['2', '3', '1']);
  });

  it('sortable: false on the table keeps headers plain, but sortBy still orders the rows', () => {
    const wrapper = mount(TableWidget, {
      props: { props: { data: rows, columns, sortable: false, sortBy: 'name' }, state: {} },
      global,
    });
    expect(ids(wrapper)).toEqual(['2', '1', '3']);
    expect(wrapper.find('[data-sort-column="amount"]').exists()).toBe(false);
  });

  it('editing and server-paged tables do not sort', () => {
    for (const extra of [{ allowAdd: true }, { pagination: 'server', pageSize: 2 }]) {
      const wrapper = mount(TableWidget, {
        props: { props: { data: rows, columns, sortBy: 'name', ...extra }, state: {} },
        global,
      });
      expect(wrapper.find('[data-sort-column]').exists()).toBe(false);
      expect(ids(wrapper).slice(0, 2)).toEqual(['1', '2']);
    }
  });
});

describe('ChartWidget: heat map', () => {
  const data = [
    { day: 'Mon', hour: '9', tickets: 3 },
    { day: 'Tue', hour: '10', tickets: 6 },
  ];

  it('draws a cell per pair, empty where no row falls, and fires pointClick with the row', async () => {
    const wrapper = mount(ChartWidget, {
      props: { props: { chartType: 'heatmap', data, xKey: 'hour', yKey: 'day', series: [{ key: 'tickets' }] } },
      global,
    });
    const table = wrapper.find('[data-testid="heatmap"]');
    expect(table.exists()).toBe(true);
    const cells = wrapper.findAll('td[data-cell]');
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.text())).toEqual(['3', '', '', '6']);
    await cells[3].trigger('click');
    expect(wrapper.emitted('event')?.at(-1)?.[0]).toBe('pointClick');
    expect((wrapper.emitted('event')?.at(-1)?.[1] as any).selectedPoint).toEqual(data[1]);
  });
});

describe('KpiWidget: sparkline', () => {
  it('draws the line, green when it ends higher', () => {
    const wrapper = mount(KpiWidget, {
      props: { props: { label: 'Sales', value: 12, spark: [{ v: 4 }, { v: 9 }, { v: 12 }], sparkKey: 'v' } },
      global,
    });
    const svg = wrapper.find('[data-testid="sparkline"]');
    expect(svg.exists()).toBe(true);
    expect(svg.find('polyline').attributes('points')?.split(' ')).toHaveLength(3);
    expect(svg.find('polyline').attributes('stroke')).toBe('#10b981');
  });

  it('has none with fewer than two numbers', () => {
    const wrapper = mount(KpiWidget, { props: { props: { label: 'Sales', value: 1, spark: [5] } }, global });
    expect(wrapper.find('[data-testid="sparkline"]').exists()).toBe(false);
  });
});

describe('KpiWidget: color rules', () => {
  const over100 = [
    { compareAs: 'number', operator: 'gt', value: 1, color: 'red' },
    { compareAs: 'number', operator: 'gte', value: 0.8, color: 'amber' },
  ];
  const valueColor = (props: Record<string, any>) =>
    mount(KpiWidget, { props: { props }, global }).find('[data-testid="kpi-value"]');

  it('colors the value by the first rule it matches, on the raw value', () => {
    const el = valueColor({ label: 'Usage', value: 1.05, format: 'percent', colorRules: over100 });
    expect(el.text()).toBe('105%');
    expect(el.attributes('data-color')).toBe('red');
    expect(el.classes()).toContain('text-red-600');
    expect(valueColor({ value: 0.9, format: 'percent', colorRules: over100 }).attributes('data-color')).toBe('amber');
  });

  it('reads numeric text from a binding', () => {
    expect(valueColor({ value: '1.2', colorRules: over100 }).attributes('data-color')).toBe('red');
  });

  it('falls back to color, then to none', () => {
    expect(valueColor({ value: 0.5, colorRules: over100, color: 'green' }).attributes('data-color')).toBe('green');
    expect(valueColor({ value: 0.5, colorRules: over100 }).attributes('data-color')).toBeUndefined();
    expect(valueColor({ value: 0.5, color: 'pink' }).attributes('data-color')).toBeUndefined();
  });

  it('leaves an empty value alone', () => {
    const rules = [{ compareAs: 'number', operator: 'lt', value: 1, color: 'red' }];
    expect(valueColor({ value: null, colorRules: rules }).attributes('data-color')).toBeUndefined();
  });
});

describe('KpiWidget: not-yet-loaded math', () => {
  const kpi = (value: unknown, busy = false) =>
    mount(KpiWidget, { props: { props: { label: 'Usage', value, format: 'percent' }, busy }, global });

  it('shows "—" instead of NaN / Infinity, and no rule color', () => {
    for (const v of ['NaN', ' NaN ', 'Infinity', '-Infinity', NaN, Infinity]) {
      const el = kpi(v).find('[data-testid="kpi-value"]');
      expect(el.text()).toBe('—');
    }
    const rules = [{ compareAs: 'string', operator: 'eq', value: 'NaN', color: 'red' }];
    const w = mount(KpiWidget, { props: { props: { value: 'NaN', colorRules: rules } }, global });
    expect(w.find('[data-testid="kpi-value"]').attributes('data-color')).toBeUndefined();
  });

  it('keeps the loading skeleton while the run that fills it is going', () => {
    expect(kpi('NaN', true).find('[data-testid="kpi"]').exists()).toBe(false);
  });
});

describe('KpiWidget: click', () => {
  const link = (w: ReturnType<typeof mount>) => w.find('[data-testid="kpi-link"]');

  it('stays plain without click actions', async () => {
    const wrapper = mount(KpiWidget, { props: { props: { label: 'Critical', value: 3 } }, global });
    expect(link(wrapper).exists()).toBe(false);
    expect(wrapper.find('[data-testid="kpi"]').attributes('role')).toBeUndefined();
    await wrapper.find('[data-testid="kpi"]').trigger('click');
    expect(wrapper.emitted('event')).toBeUndefined();
  });

  it('shows a link line and fires click when clickable', async () => {
    const wrapper = mount(KpiWidget, {
      props: { props: { label: 'Critical', value: 3 }, clickable: true },
      global,
    });
    expect(link(wrapper).text()).toBe('View details');
    const card = wrapper.find('[data-testid="kpi"]');
    expect(card.attributes('role')).toBe('button');
    expect(card.attributes('tabindex')).toBe('0');

    await card.trigger('click');
    await card.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('event')).toEqual([['click'], ['click']]);
  });

  it('uses linkText for the line', () => {
    const wrapper = mount(KpiWidget, {
      props: { props: { label: 'Critical', value: 3, linkText: 'Open tickets' }, clickable: true },
      global,
    });
    expect(link(wrapper).text()).toBe('Open tickets');
  });

  it('shows the line in the builder but does not fire', async () => {
    const wrapper = mount(KpiWidget, {
      props: { props: { label: 'Critical', value: 3 }, clickable: true, editable: true },
      global,
    });
    expect(link(wrapper).exists()).toBe(true);
    expect(wrapper.find('[data-testid="kpi"]').attributes('role')).toBeUndefined();
    await wrapper.find('[data-testid="kpi"]').trigger('click');
    expect(wrapper.emitted('event')).toBeUndefined();
  });
});
