// A pagination component's pages: how many there are, which numbers to show (the first,
// the last, a few around the current one, and "…" for the gaps), and the rows a page
// covers — `offset` / `from` / `to` for a workflow that reads one page at a time.

export interface PageInfo {
  page: number;
  pageSize: number;
  pages: number;
  total: number;
  offset: number;
  /** 1-based rows shown, e.g. 11–20 (0–0 when there are none). */
  from: number;
  to: number;
}

const whole = (v: unknown, fallback: number, min: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min ? n : fallback;
};

export function pageInfo(page: unknown, pageSize: unknown, total: unknown): PageInfo {
  const size = whole(pageSize, 10, 1);
  const count = whole(total, 0, 0);
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Math.min(pages, whole(page, 1, 1));
  const offset = (current - 1) * size;
  return {
    page: current,
    pageSize: size,
    pages,
    total: count,
    offset,
    from: count ? offset + 1 : 0,
    to: Math.min(count, offset + size),
  };
}

/**
 * The numbers to show — always the same number of slots (so the bar doesn't jump), every
 * page when they fit: 1 2 3 4 5 … 20 near the start, 1 … 5 [6] 7 … 20 in the middle,
 * with `around` pages each side of the current one.
 */
export function pageWindow(page: number, pages: number, around = 1): Array<number | '…'> {
  const range = (a: number, b: number) => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));
  const ends = 1; // the first and the last page are always shown
  const startPages = range(1, Math.min(ends, pages));
  const endPages = range(Math.max(pages - ends + 1, ends + 1), pages);
  const siblingsStart = Math.max(Math.min(page - around, pages - ends - around * 2 - 1), ends + 2);
  const siblingsEnd = Math.min(Math.max(page + around, ends + around * 2 + 2), endPages.length ? endPages[0] - 2 : pages - 1);
  return [
    ...startPages,
    ...(siblingsStart > ends + 2 ? (['…'] as const) : ends + 1 < pages - ends ? [ends + 1] : []),
    ...range(siblingsStart, siblingsEnd),
    ...(siblingsEnd < pages - ends - 1 ? (['…'] as const) : pages - ends > ends ? [pages - ends] : []),
    ...endPages,
  ];
}
