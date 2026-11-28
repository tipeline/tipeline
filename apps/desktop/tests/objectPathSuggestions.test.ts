// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { i18n } from '@/i18n';
import TemplateField from '@/components/ui/auto-form/TemplateField.vue';
import {
  bindingQueryAt,
  containerPrefix,
  insertPathPrefix,
  matchSuggestions,
  menuEntries,
  valuePaths,
  type ExpressionSuggestion,
} from '@/utils/expressionField';

const EVERY_ITEM =
  'Lists show their first item. To use every item, loop over the list with a For Each step.';

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
  // The workflow's own variables; `_run` / `_core` / `_env` come after them (tests/expressionInputs).
  const suggestionsOf = (w: ReturnType<typeof mount>) =>
    (w.findComponent({ name: 'ExpressionInput' }).props('suggestions') as ExpressionSuggestion[]).filter(
      (x) => !/^_(run|core|env)\b/.test(x.path)
    );

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

  it('turns an object that holds fields of the wanted type into a container, not lifting them', () => {
    const s = suggestionsOf(mountField({ variableType: 'array', valueField: true }));
    expect(pickable(s)).toEqual([
      { path: 'customer', detail: 'object · 2 fields inside', container: true },
      { path: 'customer.orders', detail: 'array', parent: 'customer' },
      {
        path: 'customer.orders[0]',
        detail: 'first item · object · 1 field inside',
        note: EVERY_ITEM,
        parent: 'customer.orders',
        container: true,
      },
      { path: 'customer.orders[0].tags', detail: 'array', parent: 'customer.orders[0]' },
    ]);
    // Nothing nested sits at the top level, however big the object is.
    expect(s.filter((x) => !x.parent).map((x) => x.path)).toEqual(['customer']);
  });

  it('a text field opens objects for their text fields and leaves out ones with none', () => {
    const w = mountField(
      { variableType: ['string', 'number', 'boolean', 'date'] },
      { customer, browserish: undefined, counts: { a: [1], b: [2] } }
    );
    variables.value = [
      { name: 'customer', type: 'object' },
      { name: 'title', type: 'string' },
      { name: 'counts', type: 'object' },
    ];
    return w.vm.$nextTick().then(() => {
      const top = suggestionsOf(w).filter((x) => !x.parent);
      expect(top).toEqual([
        // name, age, address.city, address.zip, orders[0].id
        { path: 'customer', detail: 'object · 5 fields inside', container: true },
        { path: 'title', detail: 'string' },
        // counts holds lists of numbers: counts.a[0] is a number, so it opens too.
        { path: 'counts', detail: 'object · 2 fields inside', container: true },
      ]);
      variables.value = [
        { name: 'customer', type: 'object' },
        { name: 'title', type: 'string' },
      ];
    });
  });

  it('hides an object with nothing that fits, and hints at running one whose fields are unknown', async () => {
    variables.value = [
      { name: 'flags', type: 'object' },
      { name: 'later', type: 'object' },
      { name: 'title', type: 'string' },
    ];
    const s = suggestionsOf(mountField({ variableType: 'string' }, { flags: { on: true } }));
    expect(s).toEqual([
      { path: 'later', detail: 'object · run once to see its fields', disabled: true },
      { path: 'title', detail: 'string' },
    ]);
    variables.value = [
      { name: 'customer', type: 'object' },
      { name: 'title', type: 'string' },
    ];
  });

  it('keeps nested fields under the nearest offered parent', () => {
    const s = pickable(suggestionsOf(mountField({ variableType: ['object', 'array'] })));
    expect(s).toContainEqual({ path: 'customer.orders', detail: 'array', parent: 'customer' });
    expect(s).toContainEqual({
      path: 'customer.orders[0]',
      detail: 'first item · object',
      note: EVERY_ITEM,
      parent: 'customer.orders',
    });
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

  it('shows a container in autocomplete with how many fields fit', async () => {
    const { default: ExpressionInput } = await import('@/components/ExpressionInput.vue');
    const w = mount(ExpressionInput, {
      props: {
        modelValue: '',
        suggestions: [
          { path: 'customer', detail: 'object · 1 field inside', container: true },
          { path: 'customer.name', detail: 'string', parent: 'customer' },
        ],
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    const field = w.find('[role="textbox"]').element as HTMLElement;
    field.focus();
    field.textContent = '{{ cus';
    const range = document.createRange();
    range.setStart(field.firstChild!, 6);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    (w.vm as any).query = 'cus';
    await w.vm.$nextTick();
    expect(w.find('[role="option"]').text()).toContain('1 field inside');
    w.unmount();
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

describe('the {} menu', () => {
  const suggestions: ExpressionSuggestion[] = [
    { path: 'title', detail: 'string' },
    { path: 'customer', detail: 'object · 3 fields inside', container: true },
    { path: 'customer.name', detail: 'string', parent: 'customer' },
    { path: 'customer.tags', detail: 'array · needs string', parent: 'customer', disabled: true },
    { path: 'customer.address', detail: 'object · 2 fields inside', parent: 'customer', container: true },
    { path: 'customer.address.city', detail: 'string', parent: 'customer.address' },
    { path: 'customer.address.zip', detail: 'string', parent: 'customer.address' },
    { path: 'config', detail: 'object' },
    { path: 'config.mode', detail: 'object', parent: 'config' },
  ];
  const rows = (opts?: Parameters<typeof menuEntries>[1]) =>
    menuEntries(suggestions, opts).map((r) => [r.suggestion.path, r.opens, r.canOpen]);

  it('lists one level: the top, then what is inside an opened object', () => {
    expect(rows()).toEqual([
      ['title', false, false],
      ['customer', true, false],
      ['config', false, true],
    ]);
    expect(rows({ path: 'customer' })).toEqual([
      ['customer.name', false, false],
      ['customer.address', true, false],
      ['customer.tags', false, false],
    ]);
    expect(rows({ path: 'customer.address' }).map((r) => r[0])).toEqual([
      'customer.address.city',
      'customer.address.zip',
    ]);
  });

  it('searches pickable paths at any depth, matches on a field name first, and caps the list', () => {
    expect(rows({ search: 'zip' }).map((r) => r[0])).toEqual(['customer.address.zip']);
    // `mode` starts with m, so config.mode leads; the others only contain an m.
    expect(rows({ search: 'm' }).map((r) => r[0])).toEqual([
      'config.mode',
      'customer.name',
      'customer.address.city',
      'customer.address.zip',
    ]);
    expect(rows({ search: 'tags' })).toEqual([]);
    expect(menuEntries(suggestions, { search: 'e', limit: 2 })).toHaveLength(2);
  });

  it('opens a container from autocomplete by typing its dot or bracket', () => {
    expect(containerPrefix(suggestions, 'customer')).toBe('customer.');
    expect(containerPrefix([{ path: 'rows[0]', parent: 'rows' }], 'rows')).toBe('rows[');
    expect(insertPathPrefix('Hi {{ cus', 9, 'customer.')).toEqual({ text: 'Hi {{ customer.', caret: 15 });
    expect(insertPathPrefix('{{ cus }} x', 6, 'customer.')).toEqual({ text: '{{ customer. }} x', caret: 12 });
  });
});

describe("a list's first item", () => {
  const suggestions: ExpressionSuggestion[] = [
    { path: 'cosas', detail: 'array' },
    { path: 'cosas[0]', detail: 'first item · object', parent: 'cosas', note: EVERY_ITEM },
    { path: 'cosas[0].name', detail: 'string', parent: 'cosas[0]' },
  ];
  const mountInput = async () => {
    const { default: ExpressionInput } = await import('@/components/ExpressionInput.vue');
    return mount(ExpressionInput, {
      props: { modelValue: '', suggestions },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
  };

  it('says so under the autocomplete list once the list is opened, and not before', async () => {
    const w = await mountInput();
    (w.vm as any).query = 'cosas';
    await w.vm.$nextTick();
    expect(w.text()).not.toContain('For Each');
    (w.vm as any).query = 'cosas[';
    await w.vm.$nextTick();
    expect(w.find('[role="option"]').text()).toContain('first item · object');
    expect(w.find('[role="presentation"]').text()).toBe(EVERY_ITEM);
    w.unmount();
  });

  it('shows the note on the menu level that holds the first item, and not in a search', async () => {
    // The `{}` menu is its own component, shared with the CodeMirror template editors.
    const { default: VariableInsertMenu } = await import('@/components/VariableInsertMenu.vue');
    const w = mount(VariableInsertMenu, {
      props: { suggestions },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    const vm = w.vm as any;
    expect(vm.menuNotes).toEqual([]);
    vm.menuPath = 'cosas';
    await w.vm.$nextTick();
    expect(vm.menuNotes).toEqual([EVERY_ITEM]);
    vm.menuSearch = 'name';
    await w.vm.$nextTick();
    expect(vm.menuNotes).toEqual([]);
    w.unmount();
  });
});
