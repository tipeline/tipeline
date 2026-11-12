// Project colors are picked freely, so text drawn on one (Home's project tiles) has to
// choose between white and dark ink by how light the color is.

const DARK_INK = '#0f172a';
const LIGHT_INK = '#ffffff';

/** `#rgb` / `#rrggbb` to 0–255 channels, or null for anything else (named colors, rgb()…). */
export function parseHex(color: string | null | undefined): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** White or dark ink, whichever contrasts more with `background`. Unknown colors get white. */
export function readableInk(background: string | null | undefined): string {
  const rgb = parseHex(background);
  if (!rgb) return LIGHT_INK;
  const l = luminance(rgb);
  return contrast(l, 1) >= contrast(l, luminance([15, 23, 42])) ? LIGHT_INK : DARK_INK;
}
