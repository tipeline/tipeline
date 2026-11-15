import { httpBaseFor } from './protocol.js';

/** Sign-in and account calls over the Server's REST routes. */

export type LoginResult =
  | { status: 'ok'; token: string }
  | { status: 'mfa_required'; challengeId: string };

export interface ServerUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  [key: string]: unknown;
}

export class ServerHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ServerHttpError';
  }
}

type FetchLike = typeof fetch;

interface HttpOptions {
  fetch?: FetchLike;
}

async function call<T>(
  serverUrl: string,
  path: string,
  init: RequestInit,
  options: HttpOptions = {}
): Promise<T> {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  let res: Response;
  try {
    res = await doFetch(`${httpBaseFor(serverUrl)}${path}`, init);
  } catch (err) {
    // fetch only throws when the request never got an answer (offline, wrong address, or
    // a browser that refused the origin).
    throw new ServerHttpError(`Could not reach the server: ${(err as Error)?.message ?? err}`, 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ServerHttpError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Signs in. With MFA on, finish with `loginMfa` and the returned challengeId. */
export async function login(
  serverUrl: string,
  email: string,
  password: string,
  options?: HttpOptions
): Promise<LoginResult> {
  const body = await call<{ token?: string; mfaRequired?: boolean; challengeId?: string }>(
    serverUrl, '/auth/login', json({ email, password }), options
  );
  if (body.mfaRequired && body.challengeId) return { status: 'mfa_required', challengeId: body.challengeId };
  if (body.token) return { status: 'ok', token: body.token };
  throw new ServerHttpError('The server answered without a token', 200);
}

export async function loginMfa(
  serverUrl: string,
  challengeId: string,
  code: string,
  options?: HttpOptions
): Promise<string> {
  const body = await call<{ token?: string }>(serverUrl, '/auth/login/mfa', json({ challengeId, code }), options);
  if (!body.token) throw new ServerHttpError('The server answered without a token', 200);
  return body.token;
}

/** The signed-in user; a ServerHttpError with status 401 means the token is no longer valid. */
export function me(serverUrl: string, token: string, options?: HttpOptions): Promise<ServerUser> {
  return call<ServerUser>(serverUrl, '/auth/me', { headers: { Authorization: `Bearer ${token}` } }, options);
}
