import type { AppComponent, AppComponentParent } from '@tipeline/schemas';
import { coreValidations } from '@tipeline/schemas';

// A page's components are one flat list; containers and tabs hold others through
// the children's `parent`. These helpers read that list as a tree.

const CONTAINER_TYPES = new Set<string>(coreValidations.appObject.APP_CONTAINER_TYPES);

export function isContainer(component: Pick<AppComponent, 'type'>): boolean {
  return CONTAINER_TYPES.has(component.type);
}

/** Same place: both on the page, or both in the same container (and tab). */
export function sameParent(a: AppComponentParent | undefined, b: AppComponentParent | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.id === b.id && (a.tab ?? null) === (b.tab ?? null);
}

/** Components laid out on one grid: the page's (`parent` omitted) or a container's / tab's. */
export function childrenOf<T extends AppComponent>(components: T[], parent?: AppComponentParent | null): T[] {
  return components.filter((c) => sameParent(c.parent, parent ?? undefined));
}

/** Every component inside `id`, at any depth (not `id` itself). */
export function descendantIds(components: AppComponent[], id: string): Set<string> {
  const found = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const c of components) {
      if (c.parent?.id === current && !found.has(c.id)) {
        found.add(c.id);
        queue.push(c.id);
      }
    }
  }
  return found;
}

/** The containers `id` sits in, innermost first. */
export function ancestors(components: AppComponent[], id: string): AppComponent[] {
  const result: AppComponent[] = [];
  const seen = new Set([id]);
  let parentId = components.find((c) => c.id === id)?.parent?.id;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = components.find((c) => c.id === parentId);
    if (!parent) break;
    result.push(parent);
    parentId = parent.parent?.id;
  }
  return result;
}

/** The lowest free row of a grid, where a new or moved component goes. */
export function bottomOf(components: AppComponent[], parent?: AppComponentParent | null): number {
  return childrenOf(components, parent).reduce((max, c) => Math.max(max, c.layout.y + c.layout.h), 0);
}

/**
 * Components in reading order with their depth: each grid top to bottom, left to
 * right, a container's (or tab's) children right after it.
 */
export function treeOrder(components: AppComponent[]): Array<{ component: AppComponent; depth: number }> {
  const byPosition = (a: AppComponent, b: AppComponent) => a.layout.y - b.layout.y || a.layout.x - b.layout.x;
  const result: Array<{ component: AppComponent; depth: number }> = [];
  const visit = (list: AppComponent[], depth: number) => {
    for (const component of [...list].sort(byPosition)) {
      result.push({ component, depth });
      if (component.type === 'tabs') {
        for (const tab of (component.props as { tabs?: Array<{ id: string }> }).tabs ?? []) {
          visit(childrenOf(components, { id: component.id, tab: tab.id }), depth + 1);
        }
      } else if (isContainer(component)) {
        visit(childrenOf(components, { id: component.id }), depth + 1);
      }
    }
  };
  visit(childrenOf(components, null), 0);
  return result;
}

const LIST_ITEM_TYPES = new Set<string>(coreValidations.appObject.APP_LIST_ITEM_TYPES);

/** The list view `parentId` is in (or is), if any — its template only takes value-less components. */
export function listViewAround(components: AppComponent[], parentId: string | null | undefined): AppComponent | undefined {
  const seen = new Set<string>();
  for (let id = parentId; id && !seen.has(id); ) {
    seen.add(id);
    const c = components.find((x) => x.id === id);
    if (!c) return undefined;
    if (c.type === 'listView') return c;
    id = c.parent?.id;
  }
  return undefined;
}

/**
 * The first type among `types` that can't go inside `parentId` (a list view's
 * template, at any depth), or null when they all can.
 */
export function refusedInside(components: AppComponent[], types: string[], parentId: string | null | undefined): string | null {
  if (!listViewAround(components, parentId)) return null;
  return types.find((t) => !LIST_ITEM_TYPES.has(t)) ?? null;
}
