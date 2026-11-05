// What an Embed component shows, and how tightly it is fenced in.
//
// - html: HTML text (a workflow's report, a snippet written in the app). Wins over src.
// - url: a web page (http / https).
// - file: an HTML file a workflow wrote — read by the main process with the same rules
//   as an Image or PDF (inside ~/Tipeline, or anywhere for a trusted app / picked file).
//
// Every frame is sandboxed. HTML and files never get `allow-same-origin`: they run with
// an origin of their own, so their scripts can't reach the app (nor Tipeline's bridge to
// the main process). A web page keeps its own origin (sites need their cookies and
// storage) — which is why a URL on the app's own origin is refused: same origin plus
// scripts would let it reach into the app. No frame may navigate the app itself.

export type EmbedSource =
  | { kind: 'html'; html: string }
  | { kind: 'url'; url: string }
  | { kind: 'file'; path: string }
  | { kind: 'none' }
  | { kind: 'invalid'; reason: 'badUrl' | 'ownOrigin' };

export function embedSource(src: unknown, html: unknown, appOrigin?: string): EmbedSource {
  if (typeof html === 'string' && html.trim()) return { kind: 'html', html };
  if (typeof src !== 'string' || !src.trim()) return { kind: 'none' };
  const value = src.trim();
  if (/^https?:\/\//i.test(value)) {
    let origin: string;
    try {
      origin = new URL(value).origin;
    } catch {
      return { kind: 'invalid', reason: 'badUrl' };
    }
    if (appOrigin && origin === appOrigin) return { kind: 'invalid', reason: 'ownOrigin' };
    return { kind: 'url', url: value };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) return { kind: 'invalid', reason: 'badUrl' };
  return { kind: 'file', path: value };
}

/** The iframe's sandbox: never same-origin for HTML / files, never top navigation. */
export function embedSandbox(kind: EmbedSource['kind'], scripts = true): string {
  const tokens = ['allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox'];
  if (scripts) tokens.unshift('allow-scripts');
  if (kind === 'url') tokens.push('allow-same-origin');
  return tokens.join(' ');
}

/**
 * A message the embedded page posted to the app (`parent.postMessage(…)`), as plain
 * data — or undefined when it isn't JSON (functions, DOM nodes…) or is too big.
 */
export function embedMessage(data: unknown, maxBytes = 256 * 1024): unknown {
  try {
    const text = JSON.stringify(data);
    if (text === undefined || text.length > maxBytes) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
