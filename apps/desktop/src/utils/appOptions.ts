// Select options as written (strings, or { label, value }) → { label, value }.

export interface AppOption {
  label: string;
  value: unknown;
}

export function normalizeOptions(raw: unknown): AppOption[] {
  return (Array.isArray(raw) ? raw : []).map((o: any) =>
    o && typeof o === 'object'
      ? { label: String(o.label ?? o.value), value: o.value }
      : { label: String(o), value: o }
  );
}

const keyOf = (value: unknown) => JSON.stringify(value ?? null);

/**
 * The options a select's value stands for, in value order. A value no option has
 * keeps a label from `known` (options chosen earlier), else its own text.
 */
export function chosenOptions(value: unknown, options: AppOption[], known: AppOption[] = []): AppOption[] {
  const values = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value];
  return values.map((v) => {
    const key = keyOf(v);
    return (
      options.find((o) => keyOf(o.value) === key) ??
      known.find((o) => keyOf(o.value) === key) ?? { label: String(v), value: v }
    );
  });
}
