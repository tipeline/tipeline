// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { i18n } from '@/i18n';
import TemplateField from '@/components/ui/auto-form/TemplateField.vue';
import {
  bindingQueryAt,
  matchSuggestions,
  valuePaths,
  type ExpressionSuggestion,
} from '@/utils/expressionField';

const customer = {
  name: 'Ada',
  age: 36,
  address: { city: 'London', zip: 'N1' },
  orders: [{ id: 1, tags: ['new'] }],
  'first name': 'skipped',
  '2fa': true,
};

describe('valuePaths', () => {
  it('lists object keys and the first array item, with parents and types', () => {
    expect(valuePaths('customer', customer)).toEqual([
      { path: 'customer.name', parent: 'customer', type: 'string' },
      { path: 'customer.age', parent: 'customer', type: 'number' },
      { path: 'customer.address', parent: 'customer', type: 'object' },
      { path: 'customer.address.city', parent: 'customer.address', type: 'string' },
      { path: 'customer.address.zip', parent: 'customer.address', type: 'string' },
      { path: 'customer.orders', parent: 'customer', type: 'array' },
      { path: 'customer.orders[0]', parent: 'customer.orders', type: 'object' },
      { path: 'customer.orders[0].id', parent: 'customer.orders[0]', type: 'number' },
      { path: 'customer.orders[0].tags', parent: 'customer.orders[0]', type: 'array' },
    ]);
  });

  it('starts at array items for a list variable and stops at the depth', () => {
    expect(valuePaths('rows', [{ id: 1, meta: { a: { b: 1 } } }], { depth: 3 })).toEqual([
      { path: 'rows[0]', parent: 'rows', type: 'object' },
      { path: 'rows[0].id', parent: 'rows[0]', type: 'number' },
      { path: 'rows[0].meta', parent: 'rows[0]', type: 'object' },
      { path: 'rows[0].meta.a', parent: 'rows[0].meta', type: 'object' },
    ]);
  });

  it('gives nothing for plain values and empty lists, and caps huge objects', () => {
    expect(valuePaths('x', 'text')).toEqual([]);
    expect(valuePaths('x', [])).toEqual([]);
    expect(valuePaths('x', null)).toEqual([]);
    const wide = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, { a: 1 }]));
    expect(valuePaths('x', wide).length).toBeLessThanOrEqual(300);
  });
});

describe('matchSuggestions with nested fields', () => {
  const suggestions: ExpressionSuggestion[] = [
    { path: 'customer', detail: 'object' },
    { path: 'customer.name', detail: 'string', parent: 'customer' },
    { path: 'customer.address', detail: 'object', parent: 'customer' },
    { path: 'customer.address.city', detail: 'string', parent: 'customer.address' },
    { path: 'orders', detail: 'array' },
    { path: 'orders[0]', detail: 'object', parent: 'orders' },
  ];
  const paths = (q: string) => matchSuggestions(suggestions, q).map((s) => s.path);

  it('hides fields until their parent is typed out', () => {
    expect(paths('')).toEqual(['customer', 'orders']);
    expect(paths('cus')).toEqual(['customer']);
    expect(paths('name')).toEqual([]);
  });

  it('lists the next level after a dot or bracket, filtered by what follows', () => {
    expect(paths('customer.')).toEqual(['customer.name', 'customer.address']);
    expect(paths('customer.ad')).toEqual(['customer.address']);
    expect(paths('customer.address.')).toEqual(['customer.address.city']);
    expect(paths('orders[')).toEqual(['orders[0]']);
    expect(paths('Customer.N')).toEqual(['customer.name']);
  });

  it('puts pickable matches before dimmed ones', () => {
    const mixed: ExpressionSuggestion[] = [
      { path: 'a', detail: 'object' },
      { path: 'a.text', parent: 'a', disabled: true },
      { path: 'a.inner', parent: 'a' },
    ];
    expect(matchSuggestions(mixed, 'a.').map((s) => s.path)).toEqual(['a.inner', 'a.text']);
  });

  it('reads the dotted query out of `{= customer.` in the field', () => {
    expect(bindingQueryAt('{= customer.', 12)?.query).toBe('customer.');
  });
});

describe('TemplateField object fields', () => {
  const variables = ref([
    { name: 'customer', type: 'object' },
    { name: 'title', type: 'string' },
  ]);
  const mountField = (props: Record<string, unknown> = {}, values: Record<string, unknown> = { customer }) =>
    mount(TemplateField, {
      props: { modelValue: '', ...props },
      global: {
        plugins: [i18n],
        provide: { taskVariables: variables, taskVariableValues: ref(values) },
      },
    });
  const suggestionsOf = (w: ReturnType<typeof mount>) =>
    w.findComponent({ name: 'ExpressionInput' }).props('suggestions') as ExpressionSuggestion[];

  it('adds the known fields of object variables under their parent', () => {
    const s = suggestionsOf(mountField());
    expect(s.slice(0, 3)).toEqual([
      { path: 'customer', detail: 'object' },
      { path: 'customer.name', detail: 'string', parent: 'customer' },
      { path: 'customer.age', detail: 'number', parent: 'customer' },
    ]);
    expect(s).toContainEqual({ path: 'title', detail: 'string' });
    expect(s).toContainEqual({ path: 'customer.address.city', detail: 'string', parent: 'customer.address' });
  });

  const pickable = (s: ExpressionSuggestion[]) => s.filter((x) => !x.disabled);

  it('offers only fields of the wanted type, surfacing a list inside a filtered-out object', () => {
    const s = suggestionsOf(mountField({ variableType: 'array', valueField: true }));
    // customer.orders[0] (an object) is filtered out too, so its tags hang off the list.
    expect(pickable(s)).toEqual([
      { path: 'customer.orders', detail: 'array' },
      { path: 'customer.orders[0].tags', detail: 'array', parent: 'customer.orders' },
    ]);
  });

  it('keeps nested fields under the nearest offered parent', () => {
    const s = pickable(suggestionsOf(mountField({ variableType: ['object', 'array'] })));
    expect(s).toContainEqual({ path: 'customer.orders', detail: 'array', parent: 'customer' });
    expect(s).toContainEqual({ path: 'customer.orders[0]', detail: 'object', parent: 'customer.orders' });
    expect(s.some((x) => x.path === 'customer.name')).toBe(false);
  });

  it('lists wrong-type fields dimmed after the dot, so an object of text fields still shows them', () => {
    // The Object → Values case: an object field, reading { name, lastname }.
    const w = mountField(
      { variableType: 'object', valueField: true },
      { customer: { name: 'Jose Daniel', lastname: 'Estrada' } }
    );
    const s = suggestionsOf(w);
    expect(s).toEqual([
      { path: 'customer', detail: 'object' },
      { path: 'customer.name', detail: 'string · needs object', parent: 'customer', disabled: true },
      { path: 'customer.lastname', detail: 'string · needs object', parent: 'customer', disabled: true },
    ]);
    expect(matchSuggestions(s, 'customer.').map((x) => x.path)).toEqual([
      'customer.name',
      'customer.lastname',
    ]);
    expect(matchSuggestions(s, 'cus').map((x) => x.path)).toEqual(['customer']);
  });

  it('marks no field dimmed when the field takes any type', () => {
    expect(suggestionsOf(mountField()).some((x) => x.disabled)).toBe(false);
  });

  it('offers just the variables when no value is known', () => {
    expect(suggestionsOf(mountField({}, {}))).toEqual([
      { path: 'customer', detail: 'object' },
      { path: 'title', detail: 'string' },
    ]);
  });

  it('keeps nested fields out of the {} menu list', async () => {
    const w = mountField();
    const input = w.findComponent({ name: 'ExpressionInput' });
    const menu = (input.vm as any).menuSuggestions as ExpressionSuggestion[];
    expect(menu.map((s) => s.path)).toEqual(['customer', 'title']);
  });
});

describe('ExpressionInput dimmed options', () => {
  it('shows dimmed options but never picks them by click or keyboard', async () => {
    const { default: ExpressionInput } = await import('@/components/ExpressionInput.vue');
    const w = mount(ExpressionInput, {
      props: {
        modelValue: '',
        suggestions: [
          { path: 'customer', detail: 'object' },
          { path: 'customer.name', detail: 'string · needs object', parent: 'customer', disabled: true },
        ],
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    (w.vm as any).query = 'customer.';
    await w.vm.$nextTick();
    const option = w.find('[role="option"]');
    expect(option.attributes('aria-disabled')).toBe('true');
    expect(option.text()).toContain('string · needs object');
    await option.trigger('mousedown');
    await w.find('[role="textbox"]').trigger('keydown', { key: 'Enter' });
    expect(w.emitted('update:modelValue')).toBeUndefined();
    w.unmount();
  });
});
