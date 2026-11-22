// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, nextTick, ref } from 'vue';
import type { AppSource } from '@tipeline/schemas';
import { i18n } from '@/i18n';
import TemplateField from '@/components/ui/auto-form/TemplateField.vue';
import BindingInput from '@/pages/apps/builder/components/BindingInput.vue';
import { BINDING_SUGGESTIONS } from '@/pages/apps/builder/bindingSuggestions';
import { bindingScope } from '@/utils/appProblems';

const spans = (w: ReturnType<typeof mount>) =>
  [...w.find('[role="textbox"]').element.querySelectorAll('span')].map((s) => ({
    text: s.textContent,
    title: s.getAttribute('title'),
    issue: s.className.includes('decoration-wavy'),
  }));

describe('TemplateField (workflow action params)', () => {
  it('colors task variable references and flags unknown ones, re-checking when variables change', async () => {
    const variables = ref([{ name: 'customer', type: 'string' }]);
    const w = mount(TemplateField, {
      props: { modelValue: 'Hi {{ customer.name }}, {{ ordr }}' },
      global: { plugins: [i18n], provide: { taskVariables: variables } },
    });
    expect(spans(w)).toEqual([
      { text: '{{ customer.name }}', title: null, issue: false },
      {
        text: '{{ ordr }}',
        title: 'Unknown variable “ordr” — it will silently resolve to an empty value',
        issue: true,
      },
    ]);
    expect(w.find('[role="textbox"]').text()).toBe('Hi {{ customer.name }}, {{ ordr }}');

    variables.value = [...variables.value, { name: 'ordr', type: 'string' }];
    await nextTick();
    expect(spans(w).every((s) => !s.issue)).toBe(true);
  });

  it('flags a malformed template, which fails the action at run time', () => {
    const w = mount(TemplateField, {
      props: { modelValue: 'a {% if customer %}b' },
      global: { plugins: [i18n], provide: { taskVariables: ref([{ name: 'customer', type: 'object' }]) } },
    });
    expect(spans(w)).toEqual([{ text: '{% if customer %}', title: 'Not closed — add {% endif %}', issue: true }]);
  });

  it('has an insert menu only when the editor provides variables', () => {
    const plain = mount(TemplateField, {
      props: { modelValue: '' },
      global: { plugins: [i18n] },
    });
    expect(plain.find('button').exists()).toBe(false);
    const withVars = mount(TemplateField, {
      props: { modelValue: '' },
      global: { plugins: [i18n], provide: { taskVariables: ref([]) } },
    });
    expect(withVars.find('button').attributes('aria-label')).toBe('Insert reference');
  });

  it('shows a number, boolean or object from YAML as text instead of crashing', () => {
    // e.g. a condition's `secondOperand: 3` — this used to take the whole step dialog down.
    for (const [value, shown] of [
      [3, '3'],
      [false, 'false'],
      [{ id: 3 }, '{"id":3}'],
    ] as const) {
      const w = mount(TemplateField, {
        props: { modelValue: value },
        global: { plugins: [i18n], provide: { taskVariables: ref([]) } },
      });
      expect(w.find('[role="textbox"]').text()).toBe(shown);
    }
  });

  it('offers only variables of the field type, without flagging references to others', () => {
    // For Each's `iterable` takes lists only; a typed reference to another variable is
    // still a known name, not an unknown one.
    const w = mount(TemplateField, {
      props: { modelValue: '{{ customer }}', valueField: true, variableType: 'array' },
      global: {
        plugins: [i18n],
        provide: {
          taskVariables: ref([
            { name: 'customer', type: 'string' },
            { name: 'orders', type: 'array' },
          ]),
        },
      },
    });
    const input = w.findComponent({ name: 'ExpressionInput' });
    expect(input.props('suggestions')).toEqual([{ path: 'orders', detail: 'array' }]);
    expect(input.props('valueField')).toBe(true);
    expect(spans(w).every((s) => !s.issue)).toBe(true);
  });

  it('offers every type in a list of field types (an email address or a list of them)', () => {
    const w = mount(TemplateField, {
      props: { modelValue: '', valueField: true, variableType: ['string', 'array'] },
      global: {
        plugins: [i18n],
        provide: {
          taskVariables: ref([
            { name: 'to', type: 'string' },
            { name: 'team', type: 'array' },
            { name: 'db', type: 'dbConnection' },
          ]),
        },
      },
    });
    const suggestions = w.findComponent({ name: 'ExpressionInput' }).props('suggestions') as any[];
    expect(suggestions.filter((s) => !s.path.startsWith('_'))).toEqual([
      { path: 'to', detail: 'string' },
      { path: 'team', detail: 'array' },
    ]);
  });

  const mountText = (variableType: string, modelValue = '') =>
    mount(TemplateField, {
      props: { modelValue, variableType },
      global: { plugins: [i18n], provide: { taskVariables: ref([{ name: 'to', type: 'string' }]) } },
    });

  it('offers this run and the Core running it in a text field, after the variables', () => {
    const suggestions = mountText('string').findComponent({ name: 'ExpressionInput' }).props('suggestions') as any[];
    expect(suggestions[0]).toEqual({ path: 'to', detail: 'string' });
    expect(suggestions).toContainEqual({ path: '_run', detail: 'This run', container: true });
    expect(suggestions).toContainEqual(expect.objectContaining({ path: '_run.trigger', parent: '_run' }));
    expect(suggestions).toContainEqual(expect.objectContaining({ path: '_core.id', parent: '_core' }));
  });

  it('leaves them out of a field that takes no text', () => {
    const suggestions = mountText('array').findComponent({ name: 'ExpressionInput' }).props('suggestions') as any[];
    expect(suggestions.some((s) => s.path.startsWith('_run') || s.path.startsWith('_core'))).toBe(false);
  });

  it('knows _run and _core are not unknown variables', () => {
    const w = mountText('string', '{{ _run.id }} on {{ _core.host }}');
    expect(spans(w).every((s) => !s.issue)).toBe(true);
  });
});

describe('BindingInput (app builder)', () => {
  const source = {
    schemaVersion: 2,
    workflows: {},
    state: { total: 0 },
    pages: [
      {
        id: 'main',
        name: 'Main',
        showInMenu: true,
        events: {},
        runnables: {},
        components: [
          { id: 'search', type: 'input', name: 'Search', layout: { x: 0, y: 0, w: 6, h: 1 }, props: {}, events: {} },
        ],
      },
    ],
  } as unknown as AppSource;

  function mountBinding(modelValue: string) {
    return mount(BindingInput, {
      props: { modelValue, suggestions: [] },
      global: {
        plugins: [i18n],
        provide: {
          [BINDING_SUGGESTIONS as symbol]: {
            page: computed(() => []),
            handler: computed(() => []),
            scope: computed(() => bindingScope(source, source.pages[0])),
          },
        },
      },
    });
  }

  it('colors whole bindings and underlines only the reference the Problems list would report', () => {
    const w = mountBinding('{{ search.value | default: tabel.selectedRow }} {{ state.total }}');
    expect(spans(w)).toEqual([
      { text: '{{ search.value | default: ', title: null, issue: false },
      {
        text: 'tabel.selectedRow',
        title: '“tabel.selectedRow” refers to a component that isn’t on this page.',
        issue: true,
      },
      { text: ' }}', title: null, issue: false },
      { text: '{{ state.total }}', title: null, issue: false },
    ]);
  });

  it('underlines a malformed binding, which would otherwise render as empty', () => {
    expect(spans(mountBinding('{{ state.tab }'))).toEqual([
      { text: '{{ state.tab }', title: 'Not closed — add }}', issue: true },
    ]);
    expect(spans(mountBinding('Total {= state.total =}'))[0]).toEqual({
      text: '{= state.total =}',
      title: 'A raw reference {= … =} must be the whole value — inside text, use {{ … }}',
      issue: true,
    });
  });

  it('still colors bindings outside a builder page', () => {
    const w = mount(BindingInput, {
      props: { modelValue: 'x {{ anything }}', suggestions: [] },
      global: { plugins: [i18n] },
    });
    expect(spans(w)).toEqual([{ text: '{{ anything }}', title: null, issue: false }]);
  });
});
