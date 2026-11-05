import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('open', () => ({ default: vi.fn() }));

import net from 'node:net';
import { OAuth2Client } from '@/action/actions/api/OAuth2Client';
import { RunCanceledSignal } from '@utils/errors';
import open from 'open';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

function client() {
  return new OAuth2Client({
    clientId: 'client-1',
    clientSecret: 'secret',
    scopes: [SCOPE],
    authEndpoint: 'https://accounts.example.com/auth',
    tokenEndpoint: 'https://accounts.example.com/token',
  });
}

// A stored token whose access token has expired but which has a refresh token.
const expiredToken = () => ({
  access_token: 'old-access',
  refresh_token: 'old-refresh',
  expires_in: 3600,
  token_created_at: Date.now() - 2 * 3600 * 1000,
  client_id: 'client-1',
  scope: SCOPE,
});

const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : 'OK',
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => body,
});

describe('OAuth2Client.authenticate', () => {
  let consent: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as any).fetch = vi.fn();
    // The browser consent step: stands in for the local redirect server.
    consent = vi.spyOn(OAuth2Client.prototype as any, 'startServerAndGetCode').mockResolvedValue('new-code');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('refreshes an expired token without asking for consent', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(response(200, { access_token: 'fresh', expires_in: 3600 }));

    const token = await client().authenticate(expiredToken());

    expect(token.access_token).toBe('fresh');
    expect(token.refresh_token).toBe('old-refresh');
    expect(consent).not.toHaveBeenCalled();
  });

  it('asks for consent again when the provider rejects the refresh token (invalid_grant)', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(
        response(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
      )
      .mockResolvedValueOnce(response(200, { access_token: 'after-consent', refresh_token: 'new-refresh' }));

    const token = await client().authenticate(expiredToken());

    expect(consent).toHaveBeenCalledTimes(1);
    expect(token).toMatchObject({ access_token: 'after-consent', refresh_token: 'new-refresh', client_id: 'client-1' });
    const exchange = JSON.parse((globalThis.fetch as any).mock.calls[1][1].body);
    expect(exchange).toMatchObject({ grant_type: 'authorization_code', code: 'new-code' });
  });

  it('still fails on other refresh errors, which a new consent would not fix', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(response(401, { error: 'invalid_client' }));
    await expect(client().authenticate(expiredToken())).rejects.toThrow('Token refresh failed: 401');

    (globalThis.fetch as any).mockResolvedValueOnce(response(400, '<html>Bad gateway</html>'));
    await expect(client().authenticate(expiredToken())).rejects.toThrow('Token refresh failed: 400');

    expect(consent).not.toHaveBeenCalled();
  });
});

describe('OAuth2Client sign-in server', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(open).mockClear();
  });

  const withPort = (port: number, signal?: AbortSignal) =>
    new OAuth2Client({
      clientId: 'client-1',
      clientSecret: 'secret',
      scopes: [SCOPE],
      authEndpoint: 'https://accounts.example.com/auth',
      tokenEndpoint: 'https://accounts.example.com/token',
      port,
      signal,
    });

  /** Something already listening on a free port: returns it and how to close it. */
  async function busyPort() {
    const other = net.createServer();
    await new Promise<void>((resolve) => other.listen(0, resolve));
    const port = (other.address() as net.AddressInfo).port;
    return { port, close: () => new Promise((resolve) => other.close(resolve)) };
  }

  it('fails the step with a clear message when the port is in use, instead of crashing', async () => {
    const busy = await busyPort();
    try {
      await expect(withPort(busy.port).authenticate()).rejects.toThrow(
        `Port ${busy.port} is in use`
      );
      expect(open).not.toHaveBeenCalled();
    } finally {
      await busy.close();
    }
  });

  it('stops waiting for consent and frees the port when the run is canceled', async () => {
    const busy = await busyPort();
    const port = busy.port;
    await busy.close();

    const abort = new AbortController();
    const signingIn = withPort(port, abort.signal)
      .authenticate()
      .catch((e) => e);
    await vi.waitFor(() => expect(open).toHaveBeenCalled());

    abort.abort(new RunCanceledSignal('ana'));
    expect(await signingIn).toBeInstanceOf(RunCanceledSignal);

    // The port is free again: a new sign-in can wait there.
    const again = net.createServer();
    await new Promise<void>((resolve, reject) => {
      again.once('error', reject);
      again.listen(port, resolve);
    });
    await new Promise((resolve) => again.close(resolve));
  });

  it('never opens the browser for a run already canceled', async () => {
    const abort = new AbortController();
    abort.abort(new RunCanceledSignal(''));
    await expect(withPort(0, abort.signal).authenticate()).rejects.toBeInstanceOf(
      RunCanceledSignal
    );
    expect(open).not.toHaveBeenCalled();
  });

  /** Starts a sign-in on a free port; resolves once it waits for the browser. */
  async function waitingSignIn() {
    const busy = await busyPort();
    const port = busy.port;
    await busy.close();
    const signingIn = withPort(port)
      .authenticate()
      .catch((e) => e);
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    return { port, signingIn };
  }

  it('ignores other requests reaching the port and waits for the real redirect', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'fresh', expires_in: 3600 }),
    }));
    const { port, signingIn } = await waitingSignIn();

    // Plain http for the local server: the fetch mock stands in for the provider.
    const http = (await import('node:http')).default;
    const get = (path: string) =>
      new Promise<number>((resolve, reject) =>
        http
          .get(`http://localhost:${port}${path}`, (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          })
          .on('error', reject)
      );

    expect(await get('/favicon.ico')).toBe(404);
    expect(await get('/oauth2callback?code=abc')).toBe(200);
    expect(await signingIn).toMatchObject({ access_token: 'fresh' });
  });

  it('says the sign-in was declined when the provider redirects with access_denied', async () => {
    const { port, signingIn } = await waitingSignIn();
    const http = (await import('node:http')).default;
    await new Promise((resolve, reject) =>
      http
        .get(`http://localhost:${port}/oauth2callback?error=access_denied`, (res) => {
          res.resume();
          resolve(null);
        })
        .on('error', reject)
    );
    const error = await signingIn;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('The sign-in was declined in the browser (access_denied).');
  });
});
