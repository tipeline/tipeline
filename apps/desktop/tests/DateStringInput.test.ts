// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ get: () => 'UTC' }) }));

import DateStringInput from '@/components/ui/auto-form/DateStringInput.vue';

// Stands in for the expression field: shows its text, `type()` edits it.
const templateText = ref<string | null>(null);
const TemplateFieldStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(p, { emit, expose }) {
    expose({ type: (text: string) => emit('update:modelValue', text) });
    return () => {
      templateText.value = p.modelValue;
      return h('input', { class: 'template', value: p.modelValue });
    };
  },
});

function mountInput(modelValue: string) {
  const emitted: string[] = [];
  const wrapper = mount(DateStringInput, {
    props: { modelValue, 'onUpdate:modelValue': (v: string) => emitted.push(v) },
    global: {
      provide: { taskVariables: ref([{ name: 'due', type: 'date' }]) },
      stubs: { TemplateField: TemplateFieldStub, Calendar: true, Popover: true },
    },
    attachTo: document.body,
  });
  return { wrapper, emitted };
}

const button = (title: string) =>
  document.querySelector(`button[title="${title}"]`) as HTMLButtonElement;

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  document.body.innerHTML = '';
});

describe('DateStringInput', () => {
  it('opens a binding in the expression field', async () => {
    const { wrapper, emitted } = mountInput('{= due =}');
    expect(templateText.value).toBe('{= due =}');
    (wrapper.findComponent(TemplateFieldStub).vm as any).type('{{ due }}');
    expect(emitted).toEqual(['{{ due }}']);
  });

  it('switching to the date picker keeps an expression until a date is picked', async () => {
    const { emitted } = mountInput('{= due =}');
    button('Date picker').click();
    await flushPromises();
    expect(emitted).toEqual([]);
    expect(document.body.textContent).toContain('Picking a date replaces it');

    button('Expression or variable').click();
    await flushPromises();
    expect(templateText.value).toBe('{= due =}');
  });

  it('opens a date on the picker', () => {
    mountInput('2024-01-15T00:00:00Z');
    expect(document.querySelector('.template')).toBeNull();
  });
});
