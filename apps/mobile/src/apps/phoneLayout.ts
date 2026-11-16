/** Desktop's app row height (APP_GRID_ROW_HEIGHT): a component keeps its designed height. */
export const ROW_HEIGHT = 10;

export interface PhoneGridItem {
  id: string;
  layout: { x: number; y: number; w: number; h: number };
  fill?: boolean;
}

/** At most this many of Desktop's 12 columns: small enough to sit two to a row. */
const SMALL = 4;

/**
 * An app page on a phone: the components in reading order (top to bottom, then left to
 * right as laid out on Desktop), each the full width. Small ones (KPIs, buttons, badges)
 * that sat next to each other on Desktop share a row in pairs, so a dashboard doesn't turn
 * into a long column of tiles. A small one left alone takes the whole row.
 */
export function phoneLayout<T extends PhoneGridItem>(items: T[]): Array<{ item: T; half: boolean }> {
  const ordered = [...items].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  const cells: Array<{ item: T; half: boolean }> = [];
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const next = ordered[i + 1];
    const small = (c: T) => c.layout.w <= SMALL;
    // Neighbours: both small, side by side on Desktop (their rows overlap).
    const besides =
      next &&
      small(item) &&
      small(next) &&
      next.layout.y < item.layout.y + item.layout.h &&
      item.layout.y < next.layout.y + next.layout.h;
    if (besides) {
      cells.push({ item, half: true }, { item: next, half: true });
      i++;
    } else {
      cells.push({ item, half: false });
    }
  }
  return cells;
}
