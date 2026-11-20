// @vitest-environment happy-dom
// The list field inside the real AutoForm with the real To String schema, as the step
// dialog builds it (validator.withDefaults(saved params)).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { getValidation } from '@tipeline/schemas';

vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ get: () => undefined }) }));

import AutoForm from '@/components/ui/auto-form/AutoForm.vue';

const editorText = ref('');
const CodemirrorStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(p, { emit, expose }) {
    expose({ type: (text: string) => emit('update:modelValue', text) });
    return () => {
      editorText.value = p.modelValue;
      return h('textarea', { class: 'cm', value: p.modelValue });
    };
  },
});
const TemplateFieldStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(p) {
    return () => h('input', { class: 'template', value: p.modelValue });
  },
});

const errors: unknown[] = [];

function mountDialogForm(params: Record<string, unknown>, { realTemplateField = false } = {}) {
  const validator = getValidation('array', 'toString', 'creation');
  const wrapper = mount(AutoForm as any, {
    props: { schema: validator.withDefaults(params), fieldConfig: validator.fieldConfig },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: {} } }), createPinia()],
      provide: { taskVariables: ref([{ name: 'tags', type: 'array' }]) },
      stubs: { codemirror: CodemirrorStub, ...(realTemplateField ? {} : { TemplateField: TemplateFieldStub }) },
      config: { errorHandler: (e: unknown) => { errors.push(e); } },
    },
    attachTo: document.body,
  });
  return wrapper;
}

const button = (title: string) =>
  document.querySelector(`button[title="${title}"]`) as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = '';
  errors.length = 0;
});

describe('list param in the step form', () => {
  it('binding → Item list → Raw JSON [1, 2, 3] → Item list → Raw JSON', async () => {
    const wrapper = mountDialogForm({ array: '{= tags =}', format: 'json' });
    await flushPromises();
    // the field opens by itself when it has a value
    expect(button('Item list')).not.toBeNull();
    button('Item list').click();
    await flushPromises();
    button('Raw JSON').click();
    await flushPromises();
    (wrapper.findComponent(CodemirrorStub).vm as any).type('[1, 2, 3]');
    await flushPromises();
    button('Item list').click();
    await flushPromises();
    expect(errors).toEqual([]);
    // the list's rows come first; the Separator field follows
    expect(wrapper.findAllComponents(TemplateFieldStub).map((c) => c.props('modelValue')).slice(0, 4)).toEqual([1, 2, 3, '']);
    button('Raw JSON').click();
    await flushPromises();
    expect(errors).toEqual([]);
    expect(editorText.value).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it('Raw JSON [1, 2, 3] → Assign variable → click in and out → Raw JSON keeps the list', async () => {
    const wrapper = mountDialogForm({ array: '{= tags =}', format: 'json' }, { realTemplateField: true });
    await flushPromises();
    button('Raw JSON').click();
    await flushPromises();
    (wrapper.findComponent(CodemirrorStub).vm as any).type('[1, 2, 3]');
    await flushPromises();
    button('Assign variable').click();
    await flushPromises();
    expect(document.body.textContent).toContain('Holds a list of 3 items');

    const field = document.querySelector('[contenteditable]') as HTMLElement;
    field.focus();
    field.dispatchEvent(new FocusEvent('focus'));
    field.blur();
    field.dispatchEvent(new FocusEvent('blur'));
    await flushPromises();
    expect(document.body.textContent).not.toContain('Must be a valid template string');

    button('Raw JSON').click();
    await flushPromises();
    expect(errors).toEqual([]);
    expect(editorText.value).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it("item rows don't repeat the list's description", async () => {
    mountDialogForm({ array: ['pdf', 'ocr'], format: 'json' });
    await flushPromises();
    const text = document.body.textContent ?? '';
    expect(text.split('The array to convert to a string.').length - 1).toBe(1);
  });
});
