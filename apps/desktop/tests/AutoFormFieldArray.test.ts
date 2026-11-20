// @vitest-environment happy-dom
import { afterEach, describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { useForm } from 'vee-validate';
import * as z from 'zod';
import { provideDependencies } from '@/components/ui/auto-form/dependencies';
import AutoFormFieldArray from '@/components/ui/auto-form/AutoFormFieldArray.vue';

// The editor and the accordion are stand-ins: these tests are about the field's modes.
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
const Pass = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) });

function mountField(initial: unknown, { realRows = false } = {}) {
  let form: any;
  const Host = defineComponent({
    setup() {
      form = useForm({ initialValues: { array: initial } });
      provideDependencies(ref(undefined));
      return () => h(AutoFormFieldArray as any, { fieldName: 'array', schema: z.array(realRows ? z.any() : z.string()) });
    },
  });
  const wrapper = mount(Host, {
    global: {
      provide: { taskVariables: ref([{ name: 'tags', type: 'array' }]) },
      stubs: {
        codemirror: CodemirrorStub,
        FormMessage: true,
        Accordion: Pass,
        AccordionItem: Pass,
        AccordionTrigger: Pass,
        AccordionContent: Pass,
        FormItem: Pass,
        ...(realRows ? {} : { AutoFormField: true }),
        TemplateField: TemplateFieldStub,
      },
    },
    attachTo: document.body,
  });
  return { wrapper, values: () => form.values };
}

const button = (title: string) =>
  document.querySelector(`button[title="${title}"]`) as HTMLButtonElement;
const addButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Add'))!;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AutoFormFieldArray holding a variable binding', () => {
  it('Raw JSON shows the binding and keeps it', async () => {
    const { wrapper, values } = mountField('{= tags =}');
    button('Raw JSON').click();
    await flushPromises();
    expect(editorText.value).toBe('{= tags =}');
    expect(values().array).toBe('{= tags =}');

    (wrapper.findComponent(CodemirrorStub).vm as any).type('{= extraTags =}');
    await flushPromises();
    expect(values().array).toBe('{= extraTags =}');
    expect(document.body.textContent).not.toContain('Must be a valid JSON array');
  });

  it('opens on the expression field showing the binding', async () => {
    const { wrapper, values } = mountField('{= tags =}');
    await flushPromises();
    expect(templateText.value).toBe('{= tags =}');
    (wrapper.findComponent(TemplateFieldStub).vm as any).type('{= invoice.items =}');
    await flushPromises();
    expect(values().array).toBe('{= invoice.items =}');
  });

  it('Item list keeps the binding until an item is added', async () => {
    const { values } = mountField('{= tags =}');
    button('Item list').click();
    await flushPromises();
    expect(values().array).toBe('{= tags =}');
    expect(document.body.textContent).toContain('Adding an item replaces it');

    button('Raw JSON').click();
    await flushPromises();
    expect(editorText.value).toBe('{= tags =}');

    button('Item list').click();
    await flushPromises();
    addButton().click();
    await flushPromises();
    expect(values().array).toEqual([null]);
  });

  it('Raw JSON typed over a binding, then Item list, shows the items and can go back', async () => {
    const { wrapper, values } = mountField('{= tags =}', { realRows: true });
    button('Item list').click();
    await flushPromises();
    button('Raw JSON').click();
    await flushPromises();
    (wrapper.findComponent(CodemirrorStub).vm as any).type('[1, 2, 3]');
    await flushPromises();
    expect(values().array).toEqual([1, 2, 3]);

    button('Item list').click();
    await flushPromises();
    expect(values().array).toEqual([1, 2, 3]);
    expect(wrapper.findAllComponents(TemplateFieldStub).map((c) => c.props('modelValue'))).toEqual([1, 2, 3]);

    button('Raw JSON').click();
    await flushPromises();
    expect(editorText.value).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it('Item list from Raw JSON text keeps its items and Add works', async () => {
    const { values } = mountField('["pdf"]');
    button('Item list').click();
    await flushPromises();
    addButton().click();
    await flushPromises();
    expect(values().array).toEqual(['pdf', null]);
  });
});
