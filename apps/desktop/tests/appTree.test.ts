import { describe, expect, it } from 'vitest';
import type { AppComponent } from '@tipeline/schemas';
import { ancestors, bottomOf, childrenOf, descendantIds, treeOrder } from '@/utils/appTree';

const c = (id: string, type: string, y: number, parent?: { id: string; tab?: string }, props: object = {}) =>
  ({ id, type, name: id, layout: { x: 0, y, w: 6, h: 2 }, parent, props, events: {} }) as unknown as AppComponent;

// page: header, tabs(a: box(inner), b: chart)
const components = [
  c('inner', 'text', 0, { id: 'box' }),
  c('chart', 'chart', 0, { id: 'tabs', tab: 'b' }),
  c('tabs', 'tabs', 2, undefined, { tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }),
  c('box', 'container', 0, { id: 'tabs', tab: 'a' }),
  c('header', 'text', 0),
];

describe('appTree', () => {
  it('lists the components of one grid', () => {
    expect(childrenOf(components, null).map((x) => x.id)).toEqual(['tabs', 'header']);
    expect(childrenOf(components, { id: 'tabs', tab: 'b' }).map((x) => x.id)).toEqual(['chart']);
    expect(childrenOf(components, { id: 'box' }).map((x) => x.id)).toEqual(['inner']);
  });

  it('finds everything inside a component, and what it is inside', () => {
    expect([...descendantIds(components, 'tabs')].sort()).toEqual(['box', 'chart', 'inner']);
    expect(ancestors(components, 'inner').map((x) => x.id)).toEqual(['box', 'tabs']);
  });

  it('gives the lowest free row of a grid', () => {
    expect(bottomOf(components, null)).toBe(4);
    expect(bottomOf(components, { id: 'box' })).toBe(2);
    expect(bottomOf(components, { id: 'tabs', tab: 'missing' })).toBe(0);
  });

  it('orders components as a tree: each grid by position, children after their container, tab by tab', () => {
    expect(treeOrder(components).map(({ component, depth }) => `${depth}:${component.id}`)).toEqual([
      '0:header',
      '0:tabs',
      '1:box',
      '2:inner',
      '1:chart',
    ]);
  });
});

describe('appTree: list views', () => {
  const list = [
    c('cards', 'listView', 0),
    c('box', 'container', 0, { id: 'cards' }),
    c('title', 'text', 0, { id: 'box' }),
    c('side', 'container', 2),
  ];

  it('finds the list view a grid is in, at any depth', async () => {
    const { listViewAround } = await import('@/utils/appTree');
    expect(listViewAround(list, 'box')?.id).toBe('cards');
    expect(listViewAround(list, 'cards')?.id).toBe('cards');
    expect(listViewAround(list, 'side')).toBeUndefined();
    expect(listViewAround(list, null)).toBeUndefined();
  });

  it('refuses value components in a list template only', async () => {
    const { refusedInside } = await import('@/utils/appTree');
    expect(refusedInside(list, ['text', 'input'], 'box')).toBe('input');
    expect(refusedInside(list, ['text', 'button', 'container'], 'cards')).toBeNull();
    expect(refusedInside(list, ['input'], 'side')).toBeNull();
  });
});
