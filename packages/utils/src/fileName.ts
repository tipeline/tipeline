const MAX_SLUG_LENGTH = 60;
const ID_SUFFIX_LENGTH = 6;

/**
 * A file-name-safe slug of a name, for export file names: accents stripped
 * ("Facturación" → "facturacion"), lowercase, anything else joined by dashes.
 * `fallback` when nothing usable is left (empty name, only symbols).
 */
export function fileSlug(name: string | null | undefined, fallback: string): string {
  const slug = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
  return slug || fallback;
}

/**
 * File names (without extension) for items written side by side, from their
 * names: `invoice-report`. Items whose names give the same slug all get the
 * start of their identifier added (`invoice-report-a1b2c3`), so no file
 * overwrites another and a name doesn't depend on which item came first.
 */
export function readableFileNames(
  items: { identifier: string; name?: string | null }[],
  fallback: string
): Map<string, string> {
  const slugs = new Map(items.map((item) => [item.identifier, fileSlug(item.name, fallback)]));
  const count = new Map<string, number>();
  for (const slug of slugs.values()) count.set(slug, (count.get(slug) ?? 0) + 1);

  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const [identifier, slug] of slugs) {
    if (count.get(slug) === 1) {
      names.set(identifier, slug);
      taken.add(slug);
    }
  }
  for (const [identifier, slug] of slugs) {
    if (count.get(slug) === 1) continue;
    const suffix = identifier.toLowerCase().replace(/[^a-z0-9]+/g, '');
    let name = `${slug}-${suffix.slice(0, ID_SUFFIX_LENGTH)}`;
    // Identifiers sharing their start (or a name that already reads like one) take the whole identifier.
    if (taken.has(name)) name = `${slug}-${suffix}`;
    for (let n = 2; taken.has(name); n++) name = `${slug}-${suffix}-${n}`;
    names.set(identifier, name);
    taken.add(name);
  }
  return names;
}
