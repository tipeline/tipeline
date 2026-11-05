/**
 * Deep-clones a value like structuredClone but preserves non-serializable
 * references (functions, class instances) instead of throwing. This is
 * needed when action params may already contain resolved runtime objects
 * such as Knex connections or browser handles injected by `{= var =}`.
 */
export function safeClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return (value as unknown[]).map(safeClone) as unknown as T;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  return Object.fromEntries(
    Object.entries(value as object).map(([k, v]) => [k, safeClone(v)])
  ) as T;
}
