// A slider input's value: one number, or with `range` two — [from, to]. It always
// holds a value inside min..max on the step, so there's nothing to check but
// `required`. With no default it starts at min (a range: min..max) — unless it's
// required: then it starts unanswered (null), so the person has to pick (0 can be an
// answer, e.g. "how likely are you to recommend us").

export interface SliderSettings {
  min?: unknown;
  max?: unknown;
  step?: unknown;
  range?: unknown;
  required?: unknown;
}

export interface SliderBounds {
  min: number;
  max: number;
  step: number;
  range: boolean;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** min / max / step with defaults 0 / 100 / 1; a max below min is swapped. */
export function sliderBounds(s: SliderSettings = {}): SliderBounds {
  let min = num(s.min) ?? 0;
  let max = num(s.max) ?? 100;
  if (max < min) [min, max] = [max, min];
  const step = num(s.step);
  return { min, max, step: step && step > 0 ? step : 1, range: s.range === true || s.range === 'true' };
}

// Decimals of the step, so 0.1 steps give 0.3, not 0.30000000000000004.
const decimals = (step: number) => (String(step).split('.')[1] ?? '').length;

function snap(n: number, b: SliderBounds): number {
  const on = b.min + Math.round((n - b.min) / b.step) * b.step;
  const inside = Math.min(b.max, Math.max(b.min, on));
  return Number(inside.toFixed(decimals(b.step)));
}

// A default typed in the builder is text: "[300, 1200]" or "300, 1200".
function parse(value: unknown): unknown {
  if (typeof value !== 'string' || !/[[,]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value.split(',');
  }
}

/** The handle positions for a value: [n], or [from, to] for a range (in order). */
export function sliderPositions(raw: unknown, b: SliderBounds): number[] {
  const value = parse(raw);
  if (b.range) {
    const pair = Array.isArray(value) ? value.map(num) : [];
    const from = snap(pair[0] ?? b.min, b);
    const to = snap(pair[1] ?? b.max, b);
    return from <= to ? [from, to] : [to, from];
  }
  const n = num(Array.isArray(value) ? value[0] : value);
  return [snap(n ?? b.min, b)];
}

/** The value to store for handle positions: a number, or [from, to]. */
export function sliderValue(positions: number[], b: SliderBounds): number | [number, number] {
  const [a, c] = sliderPositions(b.range ? positions : positions[0], b);
  return b.range ? [a, c] : a;
}

/** The starting value: the default when given (kept inside), else min — or min..max; null when required. */
export function sliderInitial(value: unknown, s: SliderSettings): number | [number, number] | null {
  if ((value == null || value === '') && s.required === true) return null;
  return sliderValue(sliderPositions(value, sliderBounds(s)), sliderBounds(s));
}

/** One position as shown: as currency when given, else a number with the unit after it. */
export function formatSliderNumber(n: number, opts: { unit?: string; currency?: string; locale?: string; step?: number }): string {
  const digits = opts.step ? decimals(opts.step) : 0;
  if (opts.currency) {
    try {
      return new Intl.NumberFormat(opts.locale, {
        style: 'currency',
        currency: opts.currency.toUpperCase(),
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(n);
    } catch {
      // an unknown code: shown as a plain number
    }
  }
  const text = n.toLocaleString(opts.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const unit = (opts.unit ?? '').trim();
  if (!unit) return text;
  return /^[%°]/.test(unit) ? `${text}${unit}` : `${text} ${unit}`;
}
