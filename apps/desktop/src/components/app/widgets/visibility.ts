/**
 * A resolved `visible` prop: shown unless it is false, "false" or empty. Omitted
 * means shown. The builder always shows the widget (pass `editable`).
 */
export function isShown(visible: unknown, editable?: boolean): boolean {
  if (editable || visible === undefined) return true;
  return visible === true || (typeof visible === 'string' && visible.trim() !== '' && visible.trim() !== 'false');
}

/**
 * Whether a component is hidden in a running app: its `visible` prop says so, or it is
 * an alert with nothing to say (no title, no message).
 */
export function isHidden(type: string, props: Record<string, any>): boolean {
  if (!isShown(props.visible)) return true;
  return type === 'alert' && !String(props.title ?? '').trim() && !String(props.message ?? '').trim();
}

interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The grid without its hidden items, with the rows they leave empty removed: a row is
 * dropped when a hidden item covers it and no shown item does, and everything below
 * moves up by the rows dropped above it.
 */
export function collapseHidden<T extends { id: string; layout: Layout }>(
  items: T[],
  hidden: (item: T) => boolean
): T[] {
  const shown = items.filter((i) => !hidden(i));
  if (shown.length === items.length) return items;
  const used = new Set<number>();
  for (const i of shown) for (let r = i.layout.y; r < i.layout.y + i.layout.h; r++) used.add(r);
  const dropped: number[] = [];
  for (const i of items)
    if (hidden(i))
      for (let r = i.layout.y; r < i.layout.y + i.layout.h; r++) if (!used.has(r)) dropped.push(r);
  const freed = [...new Set(dropped)];
  return shown.map((i) => {
    const shift = freed.filter((r) => r < i.layout.y).length;
    return shift ? { ...i, layout: { ...i.layout, y: i.layout.y - shift } } : i;
  });
}
