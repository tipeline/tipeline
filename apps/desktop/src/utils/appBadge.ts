// Status badges: which color a value gets. Explicit `colors` win; otherwise common
// status words get the color people expect, and any other value a stable color of its
// own (the same value is always the same color).

export const BADGE_COLORS = ['gray', 'blue', 'green', 'amber', 'red', 'purple'] as const;
export type BadgeColor = (typeof BADGE_COLORS)[number];

const WORDS: Record<string, BadgeColor> = {};
const words = (color: BadgeColor, list: string) => list.split(' ').forEach((w) => (WORDS[w] = color));
words('green', 'active success succeeded successful done ok completed complete approved paid enabled online yes true finished');
words('amber', 'pending waiting warning paused draft review in_review processing queued scheduled partial');
words('red', 'failed failure error errored rejected canceled cancelled blocked overdue offline expired denied');
words('blue', 'new open info running started in_progress');
words('gray', 'closed archived inactive disabled unknown none no false skipped idle');

// The colors a value can land on when nothing names it (gray stays for "nothing").
const AUTO: BadgeColor[] = ['blue', 'green', 'amber', 'red', 'purple'];

export function badgeColor(value: unknown, colors?: Record<string, unknown> | null, fallback?: unknown): BadgeColor {
  const key = String(value ?? '').trim();
  const isColor = (c: unknown): c is BadgeColor => (BADGE_COLORS as readonly unknown[]).includes(c);
  const hit = mappedColor(value, colors);
  if (isColor(hit)) return hit;
  if (isColor(fallback)) return fallback;
  const word = WORDS[key.toLowerCase().replace(/[\s-]+/g, '_')];
  if (word) return word;
  if (!key) return 'gray';
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTO[hash % AUTO.length];
}

/** What `colors` names for a value (exact key first, then ignoring case), if anything. */
export function mappedColor(value: unknown, colors?: Record<string, unknown> | null): unknown {
  if (!colors || typeof colors !== 'object') return undefined;
  const key = String(value ?? '').trim();
  return colors[key] ?? Object.entries(colors).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#39f" / "#3399ff" — a color given as is (e.g. a Google calendar's color). */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value.trim());
}

/** Dark or white text, whichever reads better on a hex background. */
export function textOn(hex: string): string {
  let h = hex.trim().slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contrast against white vs against near-black (#111827, luminance ≈ 0.0092).
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0592 ? '#ffffff' : '#111827';
}

/** One badge per element when the value is a list (tags), else one. Empty → none. */
export function badgeValues(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v) => v !== null && v !== undefined && v !== '').map((v) => String(v));
}

/** Solid colors per badge color (Tailwind 500s; gray a neutral) — map markers, calendar events. */
export const BADGE_HEX: Record<BadgeColor, string> = {
  gray: '#6b7280',
  blue: '#3b82f6',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
};
