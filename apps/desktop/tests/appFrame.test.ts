// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import StaticGrid from '@/components/app/StaticGrid.vue';
import { frameOf } from '@/components/app/widgets/registry';

describe('frameOf', () => {
  it('uses the type default when the component sets none', () => {
    expect(frameOf({ type: 'badge' })).toBe('none');
    expect(frameOf({ type: 'button' })).toBe('none');
    expect(frameOf({ type: 'image' })).toBe('none');
    expect(frameOf({ type: 'table' })).toBe('card');
    expect(frameOf({ type: 'text' })).toBe('card');
  });

  it("prefers the component's own frame", () => {
    expect(frameOf({ type: 'badge', frame: 'card' })).toBe('card');
    expect(frameOf({ type: 'table', frame: 'none' })).toBe('none');
  });
});

describe('StaticGrid: frameless items', () => {
  const layout = { x: 0, y: 0, w: 6, h: 7 };
  const items = [
    { id: 'framed', layout },
    { id: 'bare', layout },
  ];

  it('marks only the items the frameless check picks', () => {
    const wrapper = mount(StaticGrid, {
      props: { items, frameless: (item: { id: string }) => item.id === 'bare' },
      slots: { default: ({ item }: { item: { id: string } }) => h('span', item.id) },
    });
    const cells = wrapper.findAll('.static-grid-content');
    expect(cells[0].classes()).not.toContain('is-frameless');
    expect(cells[1].classes()).toContain('is-frameless');
  });

  it('draws every item as a card without a frameless check', () => {
    const wrapper = mount(StaticGrid, { props: { items } });
    expect(wrapper.findAll('.is-frameless')).toHaveLength(0);
  });
});
