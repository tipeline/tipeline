// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseArrayVariableText, parseLenientJsonArray } from '@/utils/lenientJson';

describe('parseLenientJsonArray', () => {
  it('accepts objects with unquoted keys', () => {
    expect(
      parseLenientJsonArray(`[
  { id: 1, name: "Alice", active: true },
  { id: 2, name: "Bob", active: false }
]`)
    ).toEqual([
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
    ]);
  });

  it('returns null for an object or broken JSON', () => {
    expect(parseLenientJsonArray('{ "a": 1 }')).toBeNull();
    expect(parseLenientJsonArray('[{ id: 1 ')).toBeNull();
  });
});

describe('parseArrayVariableText', () => {
  it('reads JSON from the code editor', () => {
    expect(parseArrayVariableText('["x, y", 2]')).toEqual(['x, y', 2]);
  });

  it('refuses broken JSON instead of splitting it on commas', () => {
    expect(parseArrayVariableText('[{ id: 1, name: Alice }]')).toBeNull();
  });

  it('splits plain text on commas', () => {
    expect(parseArrayVariableText(' a, b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(parseArrayVariableText('  ')).toEqual([]);
  });
});

describe('ArrayInput modes', async () => {
  const { mount, flushPromises } = await import('@vue/test-utils');
  const ArrayInput = (await import('@/components/variable/inputs/ArrayInput.vue')).default;

  it('shows code-mode items with unquoted keys in the item list', async () => {
    const wrapper = mount(ArrayInput, {
      props: { modelValue: '[{ id: 1, name: "Alice" }, "b"]' },
      global: { stubs: { codemirror: true } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('[Object]');
    expect(wrapper.text()).toContain('"name":"Alice"');
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('b');
  });

  it('does not show broken code as an empty list', async () => {
    const wrapper = mount(ArrayInput, {
      props: { modelValue: '[{ id: 1, ' },
      global: { stubs: { codemirror: true } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("isn't a valid JSON array");
    expect(wrapper.find('.add-row-trigger').exists()).toBe(false);
  });
});
