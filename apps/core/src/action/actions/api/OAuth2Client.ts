import http from 'node:http';
import { URL } from 'node:url';
import open from 'open';

// How long to wait for the user to complete the browser consent flow before
// giving up — without this, a rejected/abandoned request (e.g. Google
// blocking it for a bad client_id) leaves the local callback server waiting
// forever, since it only settles when a redirect actually reaches it.
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// Where the provider sends the browser back after consent (the redirect URI's path).
const CALLBACK_PATH = '/oauth2callback';

// The provider no longer accepts the refresh token (OAuth2 `invalid_grant`): it expired
// (Google expires them after 7 days for apps in Testing mode), was revoked, or was
// replaced. Only a new consent can fix that, so authenticate() falls back to it.
export class RefreshTokenRejectedError extends Error {}

interface OAuth2Options {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  port?: number;
  authEndpoint: string;
  tokenEndpoint: string;
  // Additional params appended to the authorization URL (e.g. access_type, prompt).
  // Defaults to { access_type: 'offline', prompt: 'consent' } to request a refresh token.
  extraAuthParams?: Record<string, string>;
  // Aborted when the run is canceled: stop waiting for consent and free the port.
  signal?: AbortSignal;
}

// Stateless OAuth2 authorization-code-flow client — it never reads or writes
// anything itself. The caller (GroupApi.auth) is responsible for sourcing a
// previously issued token and persisting whatever this returns; that keeps
// token storage/reuse an explicit pipeline concern instead of a hidden cache.
export class OAuth2Client {
  private clientId: string;
  private clientSecret: string;
  private scopes: string[];
  private port: number;
  private authEndpoint: string;
  private tokenEndpoint: string;
  private redirectUri: string;
  private extraAuthParams: Record<string, string>;
  private signal?: AbortSignal;

  constructor(options: OAuth2Options) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.scopes = options.scopes;
    this.port = options.port ?? 3000;
    this.authEndpoint = options.authEndpoint;
    this.tokenEndpoint = options.tokenEndpoint;
    this.redirectUri = '';
    this.extraAuthParams = options.extraAuthParams ?? { access_type: 'offline', prompt: 'consent' };
    this.signal = options.signal;
  }

  // A cached token missing one of the currently requested scopes (granted under a
  // narrower consent, or sourced from an unrelated integration) can't be reused —
  // it would only fail downstream with an unhelpful insufficient-scope error.
  private hasRequiredScopes(tokens: any): boolean {
    if (typeof tokens?.scope !== 'string') return false;
    const granted = new Set(tokens.scope.split(' ').filter(Boolean));
    return this.scopes.every((scope) => granted.has(scope));
  }

  private getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      ...this.extraAuthParams,
    });
    return `${this.authEndpoint}?${params.toString()}`;
  }

  private isExpired(tokens: any): boolean {
    if (!tokens.expires_in || !tokens.token_created_at) return false;
    const expiresAt = tokens.token_created_at + tokens.expires_in * 1000;
    return Date.now() >= expiresAt - 60_000; // 1-minute buffer before actual expiry
  }

  private async refreshTokens(tokens: any): Promise<any> {
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const message = `Token refresh failed: ${response.status} ${response.statusText} - ${body}`;
      let code: unknown;
      try {
        code = JSON.parse(body)?.error;
      } catch {
        // Not JSON: not an OAuth2 error response.
      }
      throw code === 'invalid_grant' ? new RefreshTokenRejectedError(message) : new Error(message);
    }

    const refreshed = await response.json();
    // Google omits `scope` on refresh responses when the granted scope hasn't
    // changed — fall back to the previously recorded scope rather than losing it.
    return {
      ...tokens,
      ...refreshed,
      scope: refreshed.scope ?? tokens.scope,
      client_id: this.clientId,
      token_created_at: Date.now(),
    };
  }

  private async exchangeCode(code: string): Promise<any> {
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${body}`);
    }

    const tokens = await response.json();
    return { ...tokens, client_id: this.clientId, token_created_at: Date.now() };
  }

  // If `existingToken` is present, valid for the current client_id/scopes, and
  // not forced, it's reused as-is or silently refreshed. Otherwise — or when the
  // provider rejects the refresh token — a fresh browser consent flow is triggered.
  // Other refresh failures (bad client credentials, network) still throw: a new
  // consent wouldn't fix them.
  public async authenticate(existingToken?: any, forceReauth = false): Promise<any> {
    if (
      !forceReauth &&
      existingToken &&
      existingToken.client_id === this.clientId &&
      this.hasRequiredScopes(existingToken)
    ) {
      if (!this.isExpired(existingToken)) return existingToken;
      if (existingToken.refresh_token) {
        try {
          return await this.refreshTokens(existingToken);
        } catch (error) {
          if (!(error instanceof RefreshTokenRejectedError)) throw error;
          console.log(`${error.message}\nThe refresh token is no longer valid — asking for consent again.`);
        }
      }
    }

    const code = await this.startServerAndGetCode();
    return await this.exchangeCode(code);
  }

  private async startServerAndGetCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      const signal = this.signal;
      if (signal?.aborted) return reject(signal.reason);

      // Settles once: the redirect, a timeout, a cancel or a server error.
      const finish = (error: Error | null, code?: string) => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        server.close();
        if (error) reject(error);
        else resolve(code!);
      };
      const onAbort = () => finish(signal!.reason);

      const timeout = setTimeout(() => {
        finish(
          new Error(
            `OAuth2 authorization timed out after ${AUTH_TIMEOUT_MS / 1000}s waiting for browser consent`
          )
        );
      }, AUTH_TIMEOUT_MS);
      signal?.addEventListener('abort', onAbort, { once: true });

      const server = http.createServer((req, res) => {
        if (!req.url) return;
        const url = new URL(req.url, this.redirectUri);
        // Only the provider's redirect counts: anything else reaching the port (a
        // favicon, another local page's polling on a common port) must not end the wait.
        if (url.pathname !== CALLBACK_PATH) {
          res.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get('code');
        // The provider says why there's no code, e.g. access_denied when consent is declined.
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (code) {
          res.end('<h1>Authorization successful. You can close this window.</h1>');
          finish(null, code);
        } else {
          res.end('<h1>Authorization failed. You can close this window.</h1>');
          const description = url.searchParams.get('error_description');
          finish(
            new Error(
              error === 'access_denied'
                ? 'The sign-in was declined in the browser (access_denied).'
                : error
                  ? `The sign-in failed: ${error}${description ? ` — ${description}` : ''}`
                  : 'No authorization code received in redirect'
            )
          );
        }
      });

      // Without this a busy port is an uncaught error that takes the whole run down.
      server.on('error', (error: NodeJS.ErrnoException) => {
        finish(
          error.code === 'EADDRINUSE'
            ? new Error(
                `Port ${this.port} is in use, so the sign-in can't wait for the browser there. ` +
                  'Another sign-in may still be waiting — finish or cancel it, or set a different port.'
              )
            : error
        );
      });

      server.listen(this.port, () => {
        const address = server.address();
        const realPort = typeof address === 'object' && address?.port ? address.port : this.port;
        this.redirectUri = `http://localhost:${realPort}${CALLBACK_PATH}`;
        console.log('Opening browser for OAuth2 authorization...');
        open(this.getAuthUrl());
      });
    });
  }
}
