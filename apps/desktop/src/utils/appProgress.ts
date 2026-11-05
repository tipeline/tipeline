// A progress component's value out of its maximum. Numbers and numeric text count;
// anything else (nothing loaded yet) is "no value". The value can go over max (210 of a
// 200 quota is 105%, for text and color rules); only `fill`, what's drawn, stops at 100.

export interface Progress {
  value: number | null;
  max: number;
  /** 0 and up (over 100 past max), or null without a value. */
  percent: number | null;
  /** How much of the bar / ring is drawn: percent kept within 0..100. */
  fill: number;
}

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export function progressOf(value: unknown, max: unknown): Progress {
  const top = toNumber(max);
  const limit = top !== null && top > 0 ? top : 100;
  const raw = toNumber(value);
  if (raw === null) return { value: null, max: limit, percent: null, fill: 0 };
  const amount = Math.max(raw, 0);
  const percent = (amount / limit) * 100;
  return { value: amount, max: limit, percent, fill: Math.min(percent, 100) };
}
