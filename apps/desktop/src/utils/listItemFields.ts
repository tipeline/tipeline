// The fields of a list view's items — what `item.<field>` can be — for the builder's
// autocomplete. The builder never runs workflows to find out; it looks at the data
// it already has (see useListItemFields).

/** Keys of the first few object items (a list's items usually share their shape). */
export function itemFields(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const keys = new Set<string>();
  for (const item of items.slice(0, 5))
    if (item && typeof item === 'object' && !Array.isArray(item)) for (const k of Object.keys(item)) keys.add(k);
  return [...keys];
}

/** A list view's `data` binding to a runnable: `{= runnables.r.outputs.v =}` or `{= runnables.r.data =}`. */
export function runnableSourceOf(data: unknown): { runnable: string; output?: string } | null {
  if (typeof data !== 'string') return null;
  const m = data.match(/^\s*\{=\s*runnables\.([A-Za-z]\w*)\.(?:outputs\.([A-Za-z_]\w*)|data)\s*=\}\s*$/);
  return m ? { runnable: m[1], output: m[2] } : null;
}
