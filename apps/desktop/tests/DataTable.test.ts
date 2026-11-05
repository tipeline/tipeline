// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';
import DataTable from '@/components/DataTable.vue';

const columns = [
  { id: 'id', accessorKey: 'id', header: 'ID' },
  { id: 'name', accessorKey: 'name', header: 'Name' },
];
const data = [
  { id: 1, name: 'Acme' },
  { id: 2, name: 'Globex' },
];

function mountTable(props: Record<string, unknown> = {}) {
  return mount(DataTable, {
    props: { columns, data, filters: [], ...props },
    global: { plugins: [i18n, createPinia()] },
  });
}

describe('DataTable row clicks', () => {
  // Regression: every cell had `@click.stop` (meant for inline editing), so clicking a
  // row's text never reached the row and `rowClick` only fired between cells.
  it("clicking a cell's content emits rowClick for that row", async () => {
    const wrapper = mountTable();
    const cellContent = wrapper
      .findAll('tbody tr')[1]
      .findAll('td')[1]
      .find('div');

    await cellContent.trigger('click');

    expect(wrapper.emitted('rowClick')).toEqual([[data[1]]]);
  });

  it('an editable cell starts editing instead of selecting the row', async () => {
    const wrapper = mountTable({ editableColumns: ['name'] });
    const cells = wrapper.findAll('tbody tr')[0].findAll('td');

    await cells[1].trigger('click');
    expect(wrapper.emitted('rowClick')).toBeUndefined();
    expect(wrapper.find('.edit-container').exists()).toBe(true);

    await cells[0].trigger('click');
    expect(wrapper.emitted('rowClick')).toEqual([[data[0]]]);
  });

  it('pages through rows when pageSize is set', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `R${i + 1}`,
    }));
    const wrapper = mountTable({ data: many, pageSize: 2 });
    const names = () =>
      wrapper.findAll('tbody tr').map((tr) => tr.findAll('td')[1].text());

    expect(names()).toEqual(['R1', 'R2']);
    expect(wrapper.text()).toContain('1–2 of 5');
    await wrapper.find('button[title="Next page"]').trigger('click');
    expect(names()).toEqual(['R3', 'R4']);
    expect(wrapper.text()).toContain('3–4 of 5');
  });
});

describe('DataTable selection', () => {
  const rowKey = (row: { id: number }) => String(row.id);
  const boxes = (wrapper: ReturnType<typeof mountTable>) => wrapper.findAll('[role="checkbox"]');

  function mountSelectable(props: Record<string, unknown> = {}) {
    const wrapper = mountTable({
      selectable: true,
      rowKey,
      selection: [],
      'onUpdate:selection': (keys: string[]) => wrapper.setProps({ selection: keys }),
      ...props,
    });
    return wrapper;
  }

  it('ticking a row adds its key without firing rowClick', async () => {
    const wrapper = mountSelectable();
    await boxes(wrapper)[2].trigger('click');

    expect(wrapper.props('selection')).toEqual(['2']);
    expect(wrapper.emitted('rowClick')).toBeUndefined();
    expect(wrapper.findAll('tbody tr')[1].attributes('data-state')).toBe('selected');
  });

  it('the header box ticks every shown row, then clears them', async () => {
    const wrapper = mountSelectable();
    await boxes(wrapper)[0].trigger('click');
    expect(wrapper.props('selection')).toEqual(['1', '2']);

    await boxes(wrapper)[0].trigger('click');
    expect(wrapper.props('selection')).toEqual([]);
  });

  it('drops ticked rows that leave the data', async () => {
    const wrapper = mountSelectable({ selection: ['1', '2'] });
    await wrapper.setProps({ data: [data[0]] });

    expect(wrapper.props('selection')).toEqual(['1']);
  });
});
