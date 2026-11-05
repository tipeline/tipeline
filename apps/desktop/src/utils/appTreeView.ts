import { valueAt } from './appFormat';

// A Tree component's nodes, from rows that hold their children (`children`, or
// `childrenKey`) — or from a flat list where each row names its parent (`parentId`, or
// `parentKey`). Like the JSON viewer's tree, which nodes are open is a set (of ids here),
// and only the rows that show are drawn.
//
// Ticking (selection: multiple) works on the leaves: a parent is ticked when all its
// leaves are, half-ticked when some are, and ticking it ticks (or clears) them all.

export interface TreeNode {
  id: string;
  label: string;
  icon: string | null;
  count: string | null;
  row: Record<string, unknown>;
  children: TreeNode[];
  parent: TreeNode | null;
}

export interface TreeOptions {
  idKey?: string;
  labelKey?: string;
  childrenKey?: string;
  parentKey?: string;
  iconKey?: string;
  countKey?: string;
}

export interface TreeRow {
  node: TreeNode;
  depth: number;
  open: boolean;
}

const LABEL_KEYS = ['label', 'name', 'title'];
const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const isRow = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function nodeOf(row: Record<string, unknown>, fallbackId: string, options: TreeOptions, parent: TreeNode | null): TreeNode {
  const id = valueAt(row, options.idKey || 'id');
  const label = options.labelKey
    ? valueAt(row, options.labelKey)
    : LABEL_KEYS.map((k) => row[k]).find((v) => v !== undefined && v !== null && v !== '');
  const icon = options.iconKey ? valueAt(row, options.iconKey) : undefined;
  const count = options.countKey ? valueAt(row, options.countKey) : undefined;
  return {
    id: id === undefined || id === null || id === '' ? fallbackId : String(id),
    label: text(label ?? id ?? fallbackId),
    icon: typeof icon === 'string' && icon.trim() ? icon.trim() : null,
    count: count === undefined || count === null || count === '' ? null : String(count),
    row,
    children: [],
    parent,
  };
}

export function buildTree(data: unknown, options: TreeOptions = {}): TreeNode[] {
  const rows = (Array.isArray(data) ? data : isRow(data) ? [data] : []).filter(isRow);
  const childrenKey = options.childrenKey || 'children';
  const parentKey = options.parentKey || 'parentId';
  const flat = !rows.some((r) => Array.isArray(r[childrenKey])) && rows.some((r) => parentKey in r);

  if (!flat) {
    const walk = (list: unknown[], parent: TreeNode | null, path: string): TreeNode[] =>
      list.filter(isRow).map((row, i) => {
        const node = nodeOf(row, `${path}${i}`, options, parent);
        const kids = row[childrenKey];
        node.children = Array.isArray(kids) ? walk(kids, node, `${path}${i}.`) : [];
        return node;
      });
    return walk(rows, null, '');
  }

  // Flat: by id; a row whose parent isn't there (or would make a loop) is a root.
  const nodes = rows.map((row, i) => nodeOf(row, String(i), options, null));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: TreeNode[] = [];
  nodes.forEach((node, i) => {
    const parentId = text(valueAt(rows[i], parentKey));
    let parent = parentId ? byId.get(parentId) ?? null : null;
    for (let up = parent; up; up = up.parent) if (up === node) parent = null; // a loop
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    } else roots.push(node);
  });
  return roots;
}

/** Every node, depth first. */
export function allNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...allNodes(n.children)]);
}

/** The ids open at the start: every node down to `depth` levels (0: all closed). */
export function openToDepth(nodes: TreeNode[], depth: number): Set<string> {
  const open = new Set<string>();
  const walk = (list: TreeNode[], level: number) => {
    if (level >= depth) return;
    for (const n of list) {
      if (n.children.length) open.add(n.id);
      walk(n.children, level + 1);
    }
  };
  walk(nodes, 0);
  return open;
}

/**
 * The rows that show: open nodes' children. With a `search`, only nodes whose label
 * matches and the nodes above them — opened, so the matches can be seen.
 */
export function visibleRows(nodes: TreeNode[], open: Set<string>, search = ''): TreeRow[] {
  const q = search.trim().toLowerCase();
  let keep: Set<TreeNode> | null = null;
  if (q) {
    keep = new Set();
    for (const n of allNodes(nodes)) {
      if (!n.label.toLowerCase().includes(q)) continue;
      for (let up: TreeNode | null = n; up; up = up.parent) keep.add(up);
    }
  }
  const rows: TreeRow[] = [];
  const walk = (list: TreeNode[], depth: number) => {
    for (const node of list) {
      if (keep && !keep.has(node)) continue;
      const isOpen = node.children.length > 0 && (keep ? node.children.some((c) => keep!.has(c)) : open.has(node.id));
      rows.push({ node, depth, open: isOpen });
      if (isOpen) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return rows;
}

// ---- ticking (on the leaves)

export const leavesOf = (node: TreeNode): TreeNode[] => (node.children.length ? node.children.flatMap(leavesOf) : [node]);

export type TickState = boolean | 'indeterminate';

export function tickState(node: TreeNode, ticked: Set<string>): TickState {
  const leaves = leavesOf(node);
  const on = leaves.filter((l) => ticked.has(l.id)).length;
  return on === 0 ? false : on === leaves.length ? true : 'indeterminate';
}

/** The leaves ticked after (un)ticking `node`: a parent sets all its leaves. */
export function toggleTick(node: TreeNode, ticked: Set<string>): Set<string> {
  const next = new Set(ticked);
  const on = tickState(node, ticked) !== true;
  for (const leaf of leavesOf(node)) {
    if (on) next.add(leaf.id);
    else next.delete(leaf.id);
  }
  return next;
}

/** What the app reads: ids of fully ticked nodes (parents too), and the ticked leaves' rows. */
export function tickedSummary(nodes: TreeNode[], ticked: Set<string>) {
  const all = allNodes(nodes);
  return {
    checked: all.filter((n) => tickState(n, ticked) === true).map((n) => n.id),
    checkedLeaves: all.filter((n) => !n.children.length && ticked.has(n.id)).map((n) => n.row),
  };
}
