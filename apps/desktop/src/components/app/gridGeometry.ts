// Shared by the gridstack grid (AppGrid) and the plain one list items use (StaticGrid),
// so a card sits in the same place in both.

/**
 * Gap between cards: each card is inset this much inside its cell. Gridstack also
 * leaves it around the grid's outer edge; the page grid of a running app cancels that
 * (app-grid--flush) so cards line up with the header.
 */
export const GRID_MARGIN = 8;

interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Items as laid out when `rows` rows fit the area around the grid (null: not measured).
 * A `fill` item with nothing below it in its columns grows down to the last of those
 * rows, or to the grid's lowest row when that is further down (the page is taller than
 * the window) — never shorter than its own height.
 */
export function fillLayouts<T extends { layout: Layout; fill?: boolean }>(
  items: T[],
  rows: number | null
): T[] {
  if (!items.some((i) => i.fill)) return items;
  const bottom = Math.max(rows ?? 0, ...items.map((i) => i.layout.y + i.layout.h));
  const clear = (item: T) => {
    const { x, y, w, h } = item.layout;
    return !items.some(
      (o) => o !== item && o.layout.y >= y + h && o.layout.x < x + w && x < o.layout.x + o.layout.w
    );
  };
  return items.map((i) =>
    i.fill && i.layout.y + i.layout.h < bottom && clear(i)
      ? { ...i, layout: { ...i.layout, h: bottom - i.layout.y } }
      : i
  );
}
