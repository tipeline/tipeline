import { APP_PHONE_COLUMNS } from './App';

/**
 * Where components go on phones. One rule for the app builder's phone canvas and the
 * phone app itself, so what the builder shows is what phones get.
 *
 * Phones have a grid of APP_PHONE_COLUMNS columns and Desktop's rows. A component
 * the author placed on it (`mobile.layout`) stays there. The others follow below, in
 * reading order of their desktop layout (top to bottom, then left to right), each the
 * full width, except small ones (KPIs, buttons, badges) that sat next to each other on
 * Desktop, which share a row in pairs. `mobile.hidden` components aren't on phones.
 */

export interface PhoneGridLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhoneLayoutItem {
  id: string;
  layout: PhoneGridLayout;
  mobile?: { hidden?: boolean; layout?: PhoneGridLayout };
}

export interface PhonePlacement<T> {
  item: T;
  layout: PhoneGridLayout;
  /** Placed by the author (`mobile.layout`), not by the automatic rule. */
  placed: boolean;
}

/** At most this many of Desktop's 12 columns: small enough to sit two to a row. */
const SMALL = 4;
const HALF = APP_PHONE_COLUMNS / 2;

export const isPhoneHidden = (item: PhoneLayoutItem) => item.mobile?.hidden === true;

/** Whether the author arranged this grid for phones (any shown component has a place). */
export const isPhoneArranged = (items: PhoneLayoutItem[]) =>
  items.some((i) => !isPhoneHidden(i) && i.mobile?.layout);

/** The components shown on phones with their place on the phone grid, top to bottom. */
export function phoneLayouts<T extends PhoneLayoutItem>(items: T[]): Array<PhonePlacement<T>> {
  const shown = items.filter((i) => !isPhoneHidden(i));
  const out: Array<PhonePlacement<T>> = [];
  let top = 0;
  for (const item of shown) {
    const l = item.mobile?.layout;
    if (!l) continue;
    out.push({ item, layout: { ...l }, placed: true });
    top = Math.max(top, l.y + l.h);
  }

  const rest = shown
    .filter((i) => !i.mobile?.layout)
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  const small = (c: T) => c.layout.w <= SMALL;
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    const next = rest[i + 1];
    // Neighbours: both small, side by side on Desktop (their rows overlap).
    const besides =
      next &&
      small(item) &&
      small(next) &&
      next.layout.y < item.layout.y + item.layout.h &&
      item.layout.y < next.layout.y + next.layout.h;
    if (besides) {
      // The pair shares one height, so nothing below moves up into a gap.
      const h = Math.max(item.layout.h, next.layout.h);
      out.push(
        { item, layout: { x: 0, y: top, w: HALF, h }, placed: false },
        { item: next, layout: { x: HALF, y: top, w: HALF, h }, placed: false }
      );
      top += h;
      i++;
    } else {
      out.push({ item, layout: { x: 0, y: top, w: APP_PHONE_COLUMNS, h: item.layout.h }, placed: false });
      top += item.layout.h;
    }
  }
  return out.sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
}

/**
 * Places components on the phone grid in the given order, left to right, starting a
 * new row when the next one doesn't fit (rows as tall as their tallest component).
 */
export function packPhoneLayouts(
  entries: Array<{ id: string; w: number; h: number }>
): Array<{ id: string } & PhoneGridLayout> {
  const out: Array<{ id: string } & PhoneGridLayout> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const { id, w, h } of entries) {
    const width = Math.min(Math.max(1, w), APP_PHONE_COLUMNS);
    if (x + width > APP_PHONE_COLUMNS) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    out.push({ id, x, y, w: width, h });
    x += width;
    rowHeight = Math.max(rowHeight, h);
  }
  return out;
}
