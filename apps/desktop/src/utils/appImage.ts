// What an app Image's `src` points at, as a URL an <img> can load. Workflows hand
// images over in several shapes: a web URL, a data URL, bare base64 (image.toBuffer),
// or — most often — the path of a file they wrote (a screenshot, a QR code…).

export type ImageSource =
  | { kind: 'url' | 'data' | 'base64' | 'file'; url: string }
  | { kind: 'none' }
  /** Something that isn't an image we can show (e.g. a path outside ~/Tipeline is only caught when loading). */
  | { kind: 'invalid' };

// The first bytes of each format, base64-encoded.
const BASE64_SIGNATURES: Array<[string, string]> = [
  ['iVBORw0KGgo', 'image/png'],
  ['/9j/', 'image/jpeg'],
  ['R0lGOD', 'image/gif'],
  ['UklGR', 'image/webp'],
  ['PHN2Zy', 'image/svg+xml'], // "<svg"
  ['PD94bWwg', 'image/svg+xml'], // "<?xml "
];

export function imageSource(src: unknown): ImageSource {
  if (typeof src !== 'string' || !src.trim()) return { kind: 'none' };
  const value = src.trim();
  if (/^https?:\/\//i.test(value)) return { kind: 'url', url: value };
  if (/^data:image\/[\w.+-]+;base64,/i.test(value)) return { kind: 'data', url: value };
  const compact = value.replace(/\s+/g, '');
  if (compact.length > 32 && /^[A-Za-z0-9+/]+=*$/.test(compact)) {
    const sig = BASE64_SIGNATURES.find(([prefix]) => compact.startsWith(prefix));
    return sig ? { kind: 'base64', url: `data:${sig[1]};base64,${compact}` } : { kind: 'invalid' };
  }
  // A file: absolute, `~/…`, or relative to ~/Tipeline. The protocol only serves
  // files inside ~/Tipeline (anything else is a 404, shown as "not found").
  if (/^(\/|~\/|[A-Za-z]:[\\/]|\.{0,2}[\w-])/.test(value) && !/^[a-z]+:\/\//i.test(value)) {
    const path = value.replace(/\\/g, '/');
    return { kind: 'file', url: `tipeline-asset://${encodeURI(path).replace(/\?/g, '%3F').replace(/#/g, '%23')}` };
  }
  return { kind: 'invalid' };
}

/** A file URL that loads again when `version` changes (a workflow rewrote the file). */
export function withVersion(source: ImageSource, version: number): string | null {
  if (!('url' in source)) return null;
  return source.kind === 'file' && version ? `${source.url}?v=${version}` : source.url;
}
