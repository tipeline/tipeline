// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '@/i18n';
import TreeWidget from '@/components/app/widgets/TreeWidget.vue';
import { allNodes, buildTree, openToDepth, tickState, tickedSummary, toggleTick, visibleRows } from '@/utils/appTreeView';

const FOLDERS = [
  { id: 'docs', name: 'Documents', files: 3, children: [
    { id: 'inv', name: 'Invoices', children: [{ id: 'i1', name: 'March.pdf' }, { id: 'i2', name: 'April.pdf' }] },
    { id: 'con', name: 'Contracts', children: [{ id: 'c1', name: 'Acme.pdf' }] },
  ] },
  { id: 'img', name: 'Images', children: [{ id: 'p1', name: 'logo.png' }] },
];
const FLAT = [
  { id: 1, title: 'Company' },
  { id: 2, title: 'Sales', parentId: 1 },
  { id: 3, title: 'North', parentId: 2 },
  { id: 4, title: 'Loop', parentId: 5 },
  { id: 5, title: 'Back', parentId: 4 },
];

describe('buildTree', () => {
  it('nested rows: ids, labels (label / name / title), counts', () => {
    const tree = buildTree(FOLDERS, { countKey: 'files' });
    expect(tree.map((n) => [n.id, n.label, n.count])).toEqual([['docs', 'Documents', '3'], ['img', 'Images', null]]);
    expect(tree[0].children[0].children.map((n) => n.label)).toEqual(['March.pdf', 'April.pdf']);
    expect(tree[0].children[0].parent?.id).toBe('docs');
  });

  it('a flat list by parent id; a loop or a missing parent makes a root', () => {
    const tree = buildTree(FLAT);
    expect(tree[0].label).toBe('Company');
    expect(tree[0].children[0].children[0].label).toBe('North');
    expect(allNodes(tree)).toHaveLength(5);
    expect(tree.length).toBeGreaterThan(1);
  });

  it('rows without ids get their path; other keys can be named', () => {
    const tree = buildTree([{ t: 'A', sub: [{ t: 'B' }] }], { labelKey: 't', childrenKey: 'sub' });
    expect(allNodes(tree).map((n) => [n.id, n.label])).toEqual([['0', 'A'], ['0.0', 'B']]);
    expect(buildTree('nope')).toEqual([]);
  });
});

describe('visibleRows', () => {
  const tree = buildTree(FOLDERS);
  it('open to a depth', () => {
    expect(visibleRows(tree, openToDepth(tree, 1)).map((r) => r.node.id)).toEqual(['docs', 'inv', 'con', 'img', 'p1']);
    expect(visibleRows(tree, openToDepth(tree, 0)).map((r) => r.node.id)).toEqual(['docs', 'img']);
  });
  it('a search keeps the matches and the nodes above them, opened', () => {
    const rows = visibleRows(tree, new Set(), 'acme');
    expect(rows.map((r) => [r.node.id, r.depth])).toEqual([['docs', 0], ['con', 1], ['c1', 2]]);
  });
});

describe('ticking', () => {
  const tree = buildTree(FOLDERS);
  const docs = tree[0];
  it('a parent ticks all its leaves; half-ticked when some are', () => {
    let ticked = toggleTick(docs.children[0], new Set());
    expect([...ticked]).toEqual(['i1', 'i2']);
    expect(tickState(docs, ticked)).toBe('indeterminate');
    ticked = toggleTick(docs, ticked);
    expect(tickState(docs, ticked)).toBe(true);
    expect(tickedSummary(tree, ticked)).toEqual({
      checked: ['docs', 'inv', 'i1', 'i2', 'con', 'c1'],
      checkedLeaves: [{ id: 'i1', name: 'March.pdf' }, { id: 'i2', name: 'April.pdf' }, { id: 'c1', name: 'Acme.pdf' }],
    });
    expect([...toggleTick(docs, ticked)]).toEqual([]);
  });
});

describe('TreeWidget', () => {
  const mountTree = (props: Record<string, unknown>, state: Record<string, unknown> = {}) =>
    mount(TreeWidget, { props: { props, state, componentId: 'folders' }, global: { plugins: [i18n] }, attachTo: document.body });
  const labels = (w: ReturnType<typeof mountTree>) => w.findAll('[data-testid="tree-label"]').map((l) => l.text());

  it('opens the top nodes; a toggle opens and closes', async () => {
    const w = mountTree({ data: FOLDERS });
    expect(labels(w)).toEqual(['Documents', 'Invoices', 'Contracts', 'Images', 'logo.png']);
    await w.findAll('[data-testid="tree-toggle"]')[1].trigger('click');
    expect(labels(w)).toContain('March.pdf');
    await w.findAll('[data-testid="tree-toggle"]')[0].trigger('click');
    expect(labels(w)).toEqual(['Documents', 'Images', 'logo.png']);
    w.unmount();
  });

  it('a click selects the node: state and itemClick with its row', async () => {
    const w = mountTree({ data: FOLDERS });
    await w.findAll('[role="treeitem"]')[1].trigger('click');
    const row = FOLDERS[0].children[0];
    expect(w.emitted('state')![0]).toEqual([{ selectedNode: row, selectedId: 'inv' }]);
    expect(w.emitted('event')![0]).toEqual(['itemClick', { selectedNode: row, selectedId: 'inv' }]);
    await w.setProps({ state: { selectedId: 'inv' } });
    expect(w.findAll('[role="treeitem"]')[1].attributes('aria-selected')).toBe('true');
    w.unmount();
  });

  it('multiple: ticking a parent ticks its leaves and fires change', async () => {
    const w = mountTree({ data: FOLDERS, selection: 'multiple', expandDepth: 2 });
    await w.findAll('[role="treeitem"]')[1].trigger('keydown', { key: ' ' });
    const [, summary] = w.emitted('event')!.at(-1)!;
    expect(summary).toEqual({ checked: ['inv', 'i1', 'i2'], checkedLeaves: [{ id: 'i1', name: 'March.pdf' }, { id: 'i2', name: 'April.pdf' }] });
    await w.setProps({ state: summary as Record<string, unknown> });
    const docs = w.findAll('[role="treeitem"]')[0];
    expect(docs.attributes('aria-checked')).toBe('mixed');
    w.unmount();
  });

  it('ticks given by id (a parent’s, too) get their leaves filled in', async () => {
    const w = mountTree({ data: FOLDERS, selection: 'multiple' }, { checked: ['con'], checkedLeaves: [] });
    await nextTick();
    expect(w.emitted('state')![0]).toEqual([{ checked: ['con', 'c1'], checkedLeaves: [{ id: 'c1', name: 'Acme.pdf' }] }]);
    expect(w.emitted('event')).toBeUndefined();
    w.unmount();
  });

  it('search filters and marks the match; nothing found says so', async () => {
    const w = mountTree({ data: FOLDERS, search: true });
    await w.get('[data-testid="tree-search"]').setValue('apr');
    expect(labels(w)).toEqual(['Documents', 'Invoices', 'April.pdf']);
    expect(w.get('mark').text()).toBe('Apr');
    await w.get('[data-testid="tree-search"]').setValue('zzz');
    expect(w.text()).toContain('No matches');
    w.unmount();
  });

  it('arrow keys move, open and close', async () => {
    const w = mountTree({ data: FOLDERS, expandDepth: 0 });
    const items = () => w.findAll('[role="treeitem"]');
    await items()[0].trigger('keydown', { key: 'ArrowRight' });
    expect(labels(w)).toEqual(['Documents', 'Invoices', 'Contracts', 'Images']);
    await items()[0].trigger('keydown', { key: 'ArrowRight' });
    await nextTick();
    expect(document.activeElement?.getAttribute('data-node')).toBe('inv');
    await items()[1].trigger('keydown', { key: 'ArrowLeft' });
    await nextTick();
    expect(document.activeElement?.getAttribute('data-node')).toBe('docs');
    w.unmount();
  });
});
