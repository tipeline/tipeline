// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, defineComponent, h } from 'vue';
import { TooltipProvider } from 'reka-ui';
import { i18n } from '@/i18n';
import FormFieldsEditor from '@/pages/apps/builder/components/FormFieldsEditor.vue';
import TabsEditor from '@/pages/apps/builder/components/TabsEditor.vue';
import { BINDING_SUGGESTIONS } from '@/pages/apps/builder/bindingSuggestions';

const global = {
  plugins: [i18n],
  provide: {
    [BINDING_SUGGESTIONS as symbol]: {
      page: computed(() => [{ path: 'state.title', detail: 'state' }]),
      handler: computed(() => []),
      scope: computed(() => null),
    },
  },
};

// Inside the TooltipProvider the app has at its root (the fx hints are tooltips).
function mountIn(component: any, props: Record<string, unknown>) {
  const w = mount(
    defineComponent({ render: () => h(TooltipProvider, () => h(component, props)) }),
    { global }
  );
  return { w, editor: w.findComponent(component) };
}

// Types into a binding field and leaves it, the way a user would.
async function commit(el: Element, text: string) {
  (el as HTMLElement).textContent = text;
  el.dispatchEvent(new Event('input'));
  el.dispatchEvent(new FocusEvent('blur'));
}

describe('binding fields inside the nested editors', () => {
  it('form fields: label, placeholder, description, options and default bind; the name doesn’t', async () => {
    const { w, editor } = mountIn(FormFieldsEditor, {
      modelValue: [{ name: 'city', type: 'select', label: 'City' }],
    });
    await w.find('button').trigger('click'); // open the field
    const boxes = w.findAll('[role="textbox"]');
    expect(boxes).toHaveLength(5);
    expect(w.findAll('input').map((i) => i.element.value)).toEqual(['city']);
    // …and each binding field's label carries the fx hint.
    expect(w.findAll('[aria-label="This field can show live values"]')).toHaveLength(5);

    await commit(boxes[0].element, '{{ state.title }}');
    expect(editor.emitted('update:modelValue')!.at(-1)![0]).toEqual([
      { name: 'city', type: 'select', label: '{{ state.title }}' },
    ]);

    // Leaving a field unchanged saves nothing (no empty undo steps).
    const count = editor.emitted('update:modelValue')!.length;
    boxes[1].element.dispatchEvent(new FocusEvent('blur'));
    expect(editor.emitted('update:modelValue')!.length).toBe(count);
  });

  it('tab labels bind; an unchanged one saves nothing', async () => {
    const { w, editor } = mountIn(TabsEditor, {
      modelValue: [{ id: 'tab1', label: 'One' }, { id: 'tab2', label: 'Two' }],
    });
    const boxes = w.findAll('[role="textbox"]');
    expect(boxes).toHaveLength(2);
    boxes[0].element.dispatchEvent(new FocusEvent('blur'));
    expect(editor.emitted('update:modelValue')).toBeUndefined();
    await commit(boxes[1].element, 'Two ({{ state.n }})');
    expect(editor.emitted('update:modelValue')![0][0]).toEqual([
      { id: 'tab1', label: 'One' },
      { id: 'tab2', label: 'Two ({{ state.n }})' },
    ]);
  });
});
