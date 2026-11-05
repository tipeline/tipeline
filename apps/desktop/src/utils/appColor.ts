// A color input's value is hex text: "#rrggbb", or "#rrggbbaa" when it's see-through
// (only with `alpha`). Hex, short hex (#abc, #abcd) and rgb() / rgba() are read; what's
// stored is always lower-case hex, so workflows get one shape.
//
// The picker works in HSV (hue, saturation, value): its square is saturation × value at
// one hue, so the hue is kept apart — a gray (no saturation) still remembers it.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}
export interface Hsva {
  /** 0..360 */
  h: number;
  /** 0..1 */
  s: number;
  /** 0..1 */
  v: number;
  /** 0..1 */
  a: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

/** A color from hex or rgb() text, or null. */
export function parseColor(value: unknown): Rgba | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const hex = text.match(HEX);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
    const n = (i: number) => parseInt(digits.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? Math.round((n(6) / 255) * 1000) / 1000 : 1 };
  }
  const rgb = text.match(RGB);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if ([r, g, b].some((c) => c > 255)) return null;
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    return Number.isNaN(alpha) ? null : { r, g, b, a: clamp(alpha, 0, 1) };
  }
  return null;
}

const byte = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

/** "#rrggbb" — or "#rrggbbaa" when `alpha` is allowed and it's see-through. */
export function toHex(c: Rgba, alpha = false): string {
  const hex = `#${byte(c.r)}${byte(c.g)}${byte(c.b)}`;
  return alpha && c.a < 1 ? hex + byte(c.a * 255) : hex;
}

/** The value to store for some color text, or null when it isn't one. */
export function normalizeColor(value: unknown, alpha = false): string | null {
  const c = parseColor(value);
  return c ? toHex(c, alpha) : null;
}

export function rgbToHsv({ r, g, b, a }: Rgba): Hsva {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max, a };
}

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return { r: f(5), g: f(3), b: f(1), a };
}

/** A CSS color for a stored value (a swatch, a chip), or null — nothing else reaches a style. */
export function cssColor(value: unknown): string | null {
  const c = parseColor(value);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})` : null;
}

/** The colors a picker offers, normalized; anything that isn't a color is left out. */
export function swatchList(value: unknown, alpha = false): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
  return [...new Set(list.map((v) => normalizeColor(v, alpha)).filter((v): v is string => !!v))];
}
