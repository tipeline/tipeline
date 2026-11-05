// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';
import VariableForm from '@/components/forms/VariableForm.vue';

const mountFields = (fields: unknown[]) =>
  mount(VariableForm, {
    props: { fields: fields as any },
    global: { plugins: [i18n, createPinia()], stubs: { codemirror: true } },
  });

const mountForm = (value: unknown[]) =>
  mountFields([{ type: 'array', name: 'seats', value, visibility: 'public' }]);

const addItem = (wrapper: ReturnType<typeof mountForm>) =>
  wrapper.get('button.add-row-trigger').trigger('click');

describe('VariableForm array field', () => {
  it('adds an item to an empty list, and it is submitted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountForm([]);
    await addItem(wrapper);
    await flushPromises();

    const input = wrapper.get('input');
    await input.setValue('B2');
    await flushPromises();

    expect(warn.mock.calls.filter(([m]) => String(m).includes('readonly'))).toEqual([]);
    await wrapper.get('form').trigger('submit');
    await vi.waitFor(() => expect(wrapper.emitted('submit')).toBeTruthy());
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ seats: ['B2'] });
    warn.mockRestore();
  });

  it('submits alongside an output, private fields and a private list', async () => {
    const wrapper = mountFields([
      { type: 'array', name: 'seats', value: [], visibility: 'public' },
      { type: 'array', name: 'booked', value: [], visibility: 'public', output: true },
      { type: 'string', name: 'raw', value: '' },
      { type: 'array', name: 'seed', value: ['A3'] },
    ]);
    await addItem(wrapper);
    await flushPromises();
    await wrapper.get('input').setValue('B2');
    await flushPromises();

    await wrapper.get('form').trigger('submit');
    await vi.waitFor(() => expect(wrapper.emitted('submit')).toBeTruthy());
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ seats: ['B2'], seed: ['A3'] });
  });

  it('adds to a list that starts with items', async () => {
    const wrapper = mountForm(['A1', 'A2']);
    await addItem(wrapper);
    await flushPromises();
    expect(wrapper.findAll('input')).toHaveLength(3);
    expect(wrapper.findAll('input')[1].element.value).toBe('A2');
  });
});
