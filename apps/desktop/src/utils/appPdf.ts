// What a PDF viewer's `src` points at, and its bytes. Like an Image's src: a web URL,
// a data URL, bare base64 (a workflow's file.toBase64), or the path of a file a
// workflow wrote — read from ~/Tipeline only. Files and web links are read by the
// main process: a page may show tipeline-asset:// in an <img>, but not fetch() it
// (it's another origin), and most sites don't let a page read their files either.

export type PdfSource =
  | { kind: 'url'; url: string }
  | { kind: 'file'; path: string; url: string }
  | { kind: 'data'; base64: string }
  | { kind: 'none' }
  | { kind: 'invalid' };

// "%PDF-" base64-encoded.
const PDF_BASE64 = 'JVBERi0';

export function pdfSource(src: unknown): PdfSource {
  if (typeof src !== 'string' || !src.trim()) return { kind: 'none' };
  const value = src.trim();
  if (/^https?:\/\//i.test(value)) return { kind: 'url', url: value };
  const dataUrl = /^data:application\/pdf;base64,(.*)$/is.exec(value);
  if (dataUrl) return { kind: 'data', base64: dataUrl[1].replace(/\s+/g, '') };
  const compact = value.replace(/\s+/g, '');
  if (compact.length > 32 && /^[A-Za-z0-9+/]+=*$/.test(compact))
    return compact.startsWith(PDF_BASE64) ? { kind: 'data', base64: compact } : { kind: 'invalid' };
  if (/^(\/|~\/|[A-Za-z]:[\\/]|\.{0,2}[\w-])/.test(value) && !/^[a-z]+:\/\//i.test(value)) {
    const path = value.replace(/\\/g, '/');
    return { kind: 'file', path: value, url: `tipeline-asset://${encodeURI(path).replace(/\?/g, '%3F').replace(/#/g, '%23')}` };
  }
  return { kind: 'invalid' };
}

export class PdfLoadError extends Error {
  constructor(
    public code: 'notFound' | 'outsideTipeline' | 'badUrl' | 'tooLarge' | 'httpError' | 'fetchFailed' | 'invalid',
    detail?: string
  ) {
    super(detail ?? code);
  }
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The PDF's bytes. Web links go through the main process (other sites rarely allow a
 * page to read them); outside the desktop app they're fetched directly. `version`
 * busts the cache of a file a workflow rewrote. Files outside ~/Tipeline are read only
 * for an app the user trusts, or a file they picked (see electron appFileTrust).
 */
export async function loadPdfBytes(source: PdfSource, version = 0, appIdentifier?: string): Promise<Uint8Array> {
  if (source.kind === 'data') return fromBase64(source.base64);
  if (source.kind === 'file') {
    if (window.ipcRenderer) {
      // Always read fresh from disk (a workflow may have rewritten it), so no cache-buster.
      // The app's identifier: a trusted app may read files outside ~/Tipeline.
      const result = await window.ipcRenderer.invoke('app:read-file', { path: source.path, appIdentifier });
      if (!result?.ok) throw new PdfLoadError(result?.error ?? 'notFound');
      return result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
    }
    const response = await fetch(version ? `${source.url}?v=${version}` : source.url);
    if (!response.ok) throw new PdfLoadError('notFound');
    return new Uint8Array(await response.arrayBuffer());
  }
  if (source.kind === 'url') {
    if (window.ipcRenderer) {
      const result = await window.ipcRenderer.invoke('app:fetch-url', { url: source.url });
      if (!result?.ok) throw new PdfLoadError(result?.error ?? 'fetchFailed', result?.detail);
      return result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
    }
    const response = await fetch(source.url);
    if (!response.ok) throw new PdfLoadError('httpError', String(response.status));
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new PdfLoadError('invalid');
}
