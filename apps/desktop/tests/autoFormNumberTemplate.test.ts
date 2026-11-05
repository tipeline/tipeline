// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/i18n';
import TaskDialogActionEdit from '@/components/task/TaskDialogActionEdit.vue';

// The step editor, opened the way the builder (and the debugger's Edit step) opens it:
// mounted closed, then given the step and opened.
async function openEditor(params: Record<string, unknown>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  const wrapper = mount(TaskDialogActionEdit, {
    props: { open: false, actionParams: null as any, variables: [{ name: 'subtotal', type: 'number' }], globalVariables: [] },
    global: { plugins: [i18n, router, createPinia()] },
    attachTo: document.body,
  });
  await wrapper.setProps({ actionParams: { identifier: 'x', group: 'math', name: 'add', params }, open: true });
  await flushPromises();
  return wrapper;
}

const field = (name: string) =>
  document.body.querySelector(`input[name="${name}"], [data-field="${name}"]`) as HTMLInputElement | null;

describe('number params in the step editor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a number param that holds a template as that template', async () => {
    await openEditor({ augend: '{{ subtotal }}', addend: 5 });
    // The template isn't a number input's value: it's shown as text.
    expect(field('augend')).toBeNull();
    expect(document.body.textContent).toContain('{{ subtotal }}');
    expect(field('addend')?.value).toBe('5');
  });

  it('keeps a plain number in a number input', async () => {
    await openEditor({ augend: 128, addend: 5 });
    expect(field('augend')?.type).toBe('number');
    expect(field('augend')?.value).toBe('128');
  });
});

describe('opening the step editor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('puts focus in the first field, not on its {} button, and Escape closes it', async () => {
    const wrapper = await openEditor({ augend: '{{ subtotal }}', addend: 5 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.getAttribute('role')).toBe('textbox');
    expect(focused?.textContent).toContain('{{ subtotal }}');

    focused?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flushPromises();
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
  });
});
