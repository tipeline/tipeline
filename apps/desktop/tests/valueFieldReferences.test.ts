// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/i18n';
import TaskDialogActionEdit from '@/components/task/TaskDialogActionEdit.vue';
import { textWrappedValueReference, wholeTextReferencePath } from '@/utils/templateReferences';

const variables = [
  { name: 'items', type: 'array' },
  { name: 'count', type: 'number' },
  { name: 'customer', type: 'object' },
  { name: 'title', type: 'string' },
  { name: 'due', type: 'date' },
  { name: '_global.settings', type: 'object' },
];

describe('textWrappedValueReference', () => {
  it('flags a whole {{ }} reference to a list, number or object variable', () => {
    expect(textWrappedValueReference('{{ items }}', variables)).toMatchObject({ path: 'items', type: 'array' });
    expect(textWrappedValueReference('  {{count}} ', variables)).toMatchObject({ path: 'count', from: 2, to: 11 });
    expect(textWrappedValueReference('{{ _global.settings }}', variables)?.type).toBe('object');
  });

  it('leaves text and dates, references inside text, raw references and unknown paths alone', () => {
    expect(textWrappedValueReference('{{ title }}', variables)).toBeNull();
    expect(textWrappedValueReference('{{ due }}', variables)).toBeNull();
    expect(textWrappedValueReference('Total: {{ count }}', variables)).toBeNull();
    expect(textWrappedValueReference('{= items =}', variables)).toBeNull();
    // A dotted path's type isn't known.
    expect(textWrappedValueReference('{{ customer.name }}', variables)).toBeNull();
    expect(textWrappedValueReference('{{ missing }}', variables)).toBeNull();
  });
});

describe('wholeTextReferencePath', () => {
  it('is the path only when the text is one {{ }} reference', () => {
    expect(wholeTextReferencePath('{{ items[0].id }}')).toBe('items[0].id');
    expect(wholeTextReferencePath('a {{ items }}')).toBeNull();
    expect(wholeTextReferencePath('{= items =}')).toBeNull();
  });
});

// The step editor, opened the way the builder opens it: mounted closed, then given the
// step and opened.
async function openEditor(group: string, name: string, params: Record<string, unknown>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  const wrapper = mount(TaskDialogActionEdit, {
    props: { open: false, actionParams: null as any, variables, globalVariables: [] },
    global: { plugins: [i18n, router, createPinia()] },
    attachTo: document.body,
  });
  await wrapper.setProps({ actionParams: { identifier: 'x', group, name, params }, open: true });
  await flushPromises();
  return wrapper;
}

const fixButton = () =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Use {='));

async function openAccordion(label: string) {
  const trigger = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  trigger?.click();
  await flushPromises();
}

describe('value params in the step editor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('warns when a value param gets a list as text, and switches it to {= =}', async () => {
    await openEditor('variable', 'set', { name: 'copy', value: '{{ items }}' });
    expect(document.body.textContent).toContain('Passed as text, not as the array itself.');
    const button = fixButton();
    expect(button?.textContent?.trim()).toBe('Use {= items =}');
    button!.click();
    await flushPromises();
    expect(document.body.textContent).toContain('{= items =}');
    expect(fixButton()).toBeUndefined();
  });

  it('does not warn for a text variable in a value param', async () => {
    await openEditor('variable', 'set', { name: 'copy', value: '{{ title }}' });
    expect(fixButton()).toBeUndefined();
  });

  it('warns on a script context entry', async () => {
    await openEditor('script', 'runScript', { code: 'return items.length', context: { items: '{{ items }}' } });
    await openAccordion('Context');
    expect(fixButton()?.textContent?.trim()).toBe('Use {= items =}');
  });

  it('warns on a sub-workflow prop', async () => {
    await openEditor('subtask', 'exec', { identifier: 'child', props: { rows: '{{ items }}' } });
    await openAccordion('Props');
    expect(fixButton()?.textContent?.trim()).toBe('Use {= items =}');
  });

  it('does not warn on text-only entries like sub-workflow output names', async () => {
    await openEditor('subtask', 'exec', { identifier: 'child', outputs: { total: '{{ count }}' } });
    await openAccordion('Outputs');
    expect(document.body.textContent).toContain('{{ count }}');
    expect(fixButton()).toBeUndefined();
  });
});
