// @vitest-environment happy-dom
import { afterEach, describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { useForm } from 'vee-validate';
import * as z from 'zod';
import AutoFormFieldRecord from '@/components/ui/auto-form/AutoFormFieldRecord.vue';

const editorText = ref('');
const EditorStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(p) {
    return () => {
      editorText.value = p.modelValue;
      return h('textarea', { value: p.modelValue });
    };
  },
});
const templateText = ref<string | null>(null);
const TemplateFieldStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(p) {
    return () => {
      templateText.value = p.modelValue;
      return h('input', { class: 'template', value: p.modelValue });
    };
  },
});
const Pass = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) });

function mountField(initial: unknown) {
  let form: any;
  const Host = defineComponent({
    setup() {
      form = useForm({ initialValues: { headers: initial } });
      return () =>
        h(AutoFormFieldRecord as any, { fieldName: 'headers', schema: z.record(z.string(), z.string()) });
    },
  });
  mount(Host, {
    global: {
      provide: { taskVariables: ref([{ name: 'customer', type: 'object' }]) },
      stubs: {
        AutoFormCodeMirrorEditor: EditorStub,
        TemplateField: TemplateFieldStub,
        FormMessage: true,
        FormDescription: true,
        Accordion: Pass,
        AccordionItem: Pass,
        AccordionTrigger: Pass,
        AccordionContent: Pass,
        FormItem: Pass,
      },
    },
    attachTo: document.body,
  });
  return { values: () => form.values };
}

const button = (title: string) =>
  document.querySelector(`button[title="${title}"]`) as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AutoFormFieldRecord holding a variable binding', () => {
  it('opens on the expression field showing the binding', () => {
    mountField('{= customer =}');
    expect(templateText.value).toBe('{= customer =}');
  });

  it('Property list keeps the binding until a property is added', async () => {
    const { values } = mountField('{= customer =}');
    button('Property list').click();
    await flushPromises();
    expect(values().headers).toBe('{= customer =}');

    button('Raw JSON').click();
    await flushPromises();
    expect(editorText.value).toBe('{= customer =}');

    button('Property list').click();
    await flushPromises();
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Add'))!.click();
    await flushPromises();
    expect(values().headers).toEqual({});
  });
});
