// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import SelectWidget from '@/components/app/widgets/SelectWidget.vue';
import { chosenOptions, normalizeOptions } from '@/utils/appOptions';

describe('appOptions', () => {
  it('normalizes strings and { label, value }', () => {
    expect(normalizeOptions(['a', { value: 2, label: 'Two' }, { value: 3 }])).toEqual([
      { label: 'a', value: 'a' },
      { label: 'Two', value: 2 },
      { label: '3', value: 3 },
    ]);
    expect(normalizeOptions('nope')).toEqual([]);
  });

  it('chosenOptions: labels from the options, else remembered ones, else the value', () => {
    const options = [{ label: 'Hooli', value: 6 }];
    const known = [{ label: 'Globex', value: 2 }];
    expect(chosenOptions(6, options)).toEqual([{ label: 'Hooli', value: 6 }]);
    expect(chosenOptions([2, 6, 9], options, known)).toEqual([
      { label: 'Globex', value: 2 },
      { label: 'Hooli', value: 6 },
      { label: '9', value: 9 },
    ]);
    expect(chosenOptions(null, options)).toEqual([]);
    expect(chosenOptions('', options)).toEqual([]);
  });
});

// AppField stand-in: lets the test type a search or pick a value.
const Field = defineComponent({
  props: ['options', 'modelValue', 'search', 'known', 'busy'],
  emits: ['update:modelValue', 'search'],
  setup: () => () => h('div'),
});

function mountSelect(props: Record<string, unknown>, state: Record<string, unknown> = {}) {
  return mount(SelectWidget, {
    props: { props, state, componentId: 'customer', busy: false },
    global: { plugins: [i18n], stubs: { AppField: Field } },
  });
}

describe('SelectWidget', () => {
  it('publishes the chosen options with the value (labels from the options)', () => {
    const w = mountSelect({ options: [{ value: 'cr', label: 'Costa Rica' }] });
    w.findComponent(Field).vm.$emit('update:modelValue', 'cr');
    expect(w.emitted('state')![0]).toEqual([
      { value: 'cr', selectedOptions: [{ label: 'Costa Rica', value: 'cr' }], error: null },
    ]);
    expect(w.emitted('event')![0]).toEqual(['change', { value: 'cr' }]);
  });

  it('remote: a search typed while one runs is sent once it ends — only the latest', async () => {
    const w = mountSelect({ search: 'remote' });
    const field = w.findComponent(Field);
    field.vm.$emit('search', 'o');
    expect(w.emitted('event')).toEqual([['search', { search: 'o' }]]);

    await w.setProps({ busy: true });
    field.vm.$emit('search', 'oo');
    field.vm.$emit('search', 'ooh');
    await w.setProps({ state: { search: 'ooh' } });
    expect(w.emitted('event')).toHaveLength(1); // nothing sent while busy

    await w.setProps({ busy: false });
    await nextTick();
    expect(w.emitted('event')).toEqual([
      ['search', { search: 'o' }],
      ['search', { search: 'ooh' }],
    ]);
    expect(w.emitted('state')!.map(([p]) => p)).toEqual([{ search: 'o' }, { search: 'oo' }, { search: 'ooh' }]);
  });
});
