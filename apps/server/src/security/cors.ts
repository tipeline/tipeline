import type http from 'http';

/**
 * Cross-origin access for browser clients (the mobile app, a web client). Desktop and the CLI
 * are not browsers, so CORS never applies to them.
 *
 * Only listed origins get CORS headers. The default list is the mobile app's own WebView
 * origins: Capacitor serves the app from `capacitor://localhost` on iOS and
 * `https://localhost` on Android. `TIPELINE_CORS_ORIGINS` (comma-separated) adds more, for
 * example `http://localhost:5173` while developing; `*` allows every origin.
 *
 * Requests carry their token in the Authorization header, never in a cookie, so no
 * credentials mode is needed.
 */
export const DEFAULT_CORS_ORIGINS = ['capacitor://localhost', 'https://localhost'];

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type';
const PREFLIGHT_MAX_AGE_SECONDS = '600';

export function corsOrigins(env: string | undefined = process.env.TIPELINE_CORS_ORIGINS): Set<string> {
  const extra = (env ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return new Set([...DEFAULT_CORS_ORIGINS, ...extra]);
}

/**
 * Sets the CORS headers this request gets. Returns true when the request was a preflight and
 * has been answered: the caller stops there.
 */
export function applyCors(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  allowed: Set<string>
): boolean {
  const origin = req.headers.origin;
  const allowAll = allowed.has('*');
  const isAllowed = typeof origin === 'string' && (allowAll || allowed.has(origin));

  // The answer depends on the Origin header, so caches must keep one copy per origin.
  if (!allowAll) res.setHeader('Vary', 'Origin');
  if (isAllowed) res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);

  const isPreflight = req.method === 'OPTIONS' && req.headers['access-control-request-method'] !== undefined;
  if (!isPreflight) return false;

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS);
  }
  // A refused origin gets an answer without CORS headers, which the browser treats as a no.
  res.writeHead(204).end();
  return true;
}
