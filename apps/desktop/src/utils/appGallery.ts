import { valueAt } from './appFormat';

// A gallery's pictures: one per element of `data` — a row (its picture at `srcKey`,
// its caption at `captionKey`, or the usual names) or just a picture's src as text.

export interface GalleryItem {
  key: string;
  row: unknown;
  index: number;
  src: unknown;
  caption: string;
}

const SRC_KEYS = ['src', 'url', 'image', 'path', 'photo', 'picture', 'thumbnail'];
const CAPTION_KEYS = ['caption', 'title', 'name', 'label', 'alt'];

function pick(row: Record<string, unknown>, key: string | undefined, names: string[]): unknown {
  if (key) return valueAt(row, key);
  for (const name of names) {
    const hit = Object.keys(row).find((k) => k.toLowerCase() === name);
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

export function galleryItems(data: unknown, options: { srcKey?: string; captionKey?: string } = {}): GalleryItem[] {
  const list = Array.isArray(data) ? data : [];
  return list
    .map((row, index) => {
      if (typeof row === 'string') return { key: `${index}:${row}`, row, index, src: row, caption: '' };
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const caption = pick(r, options.captionKey, CAPTION_KEYS);
      return {
        key: String(r.id ?? `#${index}`),
        row,
        index,
        src: pick(r, options.srcKey, SRC_KEYS),
        caption: caption === undefined || caption === null ? '' : String(caption),
      };
    })
    .filter((item): item is GalleryItem => item !== null);
}

/** The next index, wrapping around (a carousel and the lightbox go round). */
export const wrapIndex = (index: number, length: number) => (length ? ((index % length) + length) % length : 0);
