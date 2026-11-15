import { describe, expect, it } from 'vitest';
import { login, loginMfa, me, ServerHttpError, httpBaseFor, wsUrlFor, answerEventFor } from '../src/index.js';

/** Records the call and answers with `status` + `body`. */
const fakeFetch = (status: number, body: unknown) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
};

describe('login', () => {
  it('posts to /auth/login on the http address of a ws url', async () => {
    const { fn, calls } = fakeFetch(200, { token: 'tok' });
    await expect(login('wss://srv.acme.dev/', 'a@b.c', 'pw', { fetch: fn })).resolves.toEqual({ status: 'ok', token: 'tok' });
    expect(calls[0].url).toBe('https://srv.acme.dev/auth/login');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'a@b.c', password: 'pw' });
  });

  it('returns the MFA challenge', async () => {
    const { fn } = fakeFetch(200, { mfaRequired: true, challengeId: 'ch-1' });
    await expect(login('https://srv', 'a', 'b', { fetch: fn })).resolves.toEqual({ status: 'mfa_required', challengeId: 'ch-1' });
  });

  it('throws the Server message with its status', async () => {
    const { fn } = fakeFetch(401, { error: 'Invalid credentials' });
    const err = await login('https://srv', 'a', 'b', { fetch: fn }).catch((e) => e);
    expect(err).toBeInstanceOf(ServerHttpError);
    expect(err.status).toBe(401);
    expect(err.message).toBe('Invalid credentials');
  });

  it('reports an unreachable server with status 0', async () => {
    const fn = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const err = await login('https://srv', 'a', 'b', { fetch: fn }).catch((e) => e);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Could not reach the server/);
  });
});

describe('loginMfa and me', () => {
  it('finishes MFA with the challenge and code', async () => {
    const { fn, calls } = fakeFetch(200, { token: 'tok2' });
    await expect(loginMfa('https://srv', 'ch-1', '123456', { fetch: fn })).resolves.toBe('tok2');
    expect(calls[0].url).toBe('https://srv/auth/login/mfa');
  });

  it('sends the token to /auth/me', async () => {
    const { fn, calls } = fakeFetch(200, { id: 'u', email: 'a@b.c', name: 'A', role: 'editor' });
    await expect(me('ws://srv:4011', 'tok', { fetch: fn })).resolves.toMatchObject({ role: 'editor' });
    expect(calls[0].url).toBe('http://srv:4011/auth/me');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
});

describe('address helpers', () => {
  it('convert between ws and http addresses', () => {
    expect(httpBaseFor('wss://a.dev')).toBe('https://a.dev');
    expect(httpBaseFor('ws://a.dev:4001/')).toBe('http://a.dev:4001');
    expect(httpBaseFor('https://a.dev')).toBe('https://a.dev');
    expect(wsUrlFor('https://a.dev')).toBe('wss://a.dev');
    expect(wsUrlFor('http://a.dev:4011')).toBe('ws://a.dev:4011');
    expect(wsUrlFor(' wss://a.dev/ ')).toBe('wss://a.dev');
  });

  it('names answer events', () => {
    expect(answerEventFor('taskList')).toBe('onTaskList');
  });
});
