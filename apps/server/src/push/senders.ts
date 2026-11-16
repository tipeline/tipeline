import crypto from 'crypto';
import http2 from 'http2';
import type { ApnsConfig, FcmConfig } from './pushConfig.js';
import type { PushPlatform } from './PushDeviceService.js';

/** One notification. `data` reaches the app (which run to open); it isn't shown. */
export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
  /** Groups notifications of the same kind on the lock screen. */
  threadId: string;
}

/** `invalid`: the token is dead (app removed, signed out), so the device is forgotten. */
export type SendResult = 'sent' | 'invalid' | 'failed';

export interface PushSender {
  send(device: { platform: PushPlatform; token: string }, message: PushMessage): Promise<SendResult>;
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/** A signed JWT: ES256 for Apple, RS256 for Google. */
export function signJwt(header: object, payload: object, key: string, alg: 'ES256' | 'RS256'): string {
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature =
    alg === 'ES256'
      ? crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
      : crypto.sign('RSA-SHA256', Buffer.from(unsigned), key);
  return `${unsigned}.${base64url(signature)}`;
}

/** Apple Push Notification service, over HTTP/2 with a token (.p8) key. */
export class ApnsSender implements PushSender {
  private session: http2.ClientHttp2Session | null = null;
  private jwt: { value: string; at: number } | null = null;

  constructor(private readonly config: ApnsConfig) {}

  private host() {
    return this.config.sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  }

  /** Apple accepts a provider token for up to an hour; a fresh one every 50 minutes. */
  private token(force = false): string {
    const now = Date.now();
    if (!force && this.jwt && now - this.jwt.at < 50 * 60_000) return this.jwt.value;
    const value = signJwt(
      { alg: 'ES256', kid: this.config.keyId },
      { iss: this.config.teamId, iat: Math.floor(now / 1000) },
      this.config.key,
      'ES256'
    );
    this.jwt = { value, at: now };
    return value;
  }

  private connect(): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const session = http2.connect(this.host());
    session.on('error', () => session.destroy());
    session.on('close', () => {
      if (this.session === session) this.session = null;
    });
    session.unref();
    this.session = session;
    return session;
  }

  private post(token: string, body: string, jwt: string): Promise<{ status: number; reason: string }> {
    return new Promise((resolve, reject) => {
      const req = this.connect().request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': this.config.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0;
      let text = '';
      req.on('response', (headers) => (status = Number(headers[':status'])));
      req.setEncoding('utf8');
      req.on('data', (chunk) => (text += chunk));
      req.on('end', () => {
        let reason = '';
        try {
          reason = JSON.parse(text || '{}').reason ?? '';
        } catch {}
        resolve({ status, reason });
      });
      req.on('error', reject);
      req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.end(body);
    });
  }

  async send(device: { token: string }, message: PushMessage): Promise<SendResult> {
    const body = JSON.stringify({
      aps: { alert: { title: message.title, body: message.body }, sound: 'default', 'thread-id': message.threadId },
      ...message.data,
    });
    try {
      let answer = await this.post(device.token, body, this.token());
      if (answer.status === 403 && answer.reason === 'ExpiredProviderToken') {
        answer = await this.post(device.token, body, this.token(true));
      }
      if (answer.status === 200) return 'sent';
      if (answer.status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(answer.reason)) {
        return 'invalid';
      }
      console.warn(`[Push] Apple refused a notification: ${answer.status} ${answer.reason}`);
      return 'failed';
    } catch (err: any) {
      console.warn(`[Push] Could not reach Apple: ${err?.message ?? err}`);
      return 'failed';
    }
  }
}

/** Firebase Cloud Messaging (HTTP v1), with a service account. */
export class FcmSender implements PushSender {
  private access: { value: string; until: number } | null = null;

  constructor(
    private readonly config: FcmConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async accessToken(force = false): Promise<string> {
    const now = Date.now();
    if (!force && this.access && now < this.access.until) return this.access.value;
    const iat = Math.floor(now / 1000);
    const assertion = signJwt(
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: this.config.clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: this.config.tokenUri,
        iat,
        exp: iat + 3600,
      },
      this.config.privateKey,
      'RS256'
    );
    const res = await this.fetchImpl(this.config.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new Error(`Google sign-in failed (${res.status})`);
    this.access = { value: json.access_token, until: now + Math.max(60, (json.expires_in ?? 3600) - 300) * 1000 };
    return this.access.value;
  }

  private async post(token: string, message: PushMessage, access: string) {
    return this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          data: message.data,
          android: { priority: 'high', notification: { tag: message.threadId } },
        },
      }),
    });
  }

  async send(device: { token: string }, message: PushMessage): Promise<SendResult> {
    try {
      let res = await this.post(device.token, message, await this.accessToken());
      if (res.status === 401) res = await this.post(device.token, message, await this.accessToken(true));
      if (res.ok) return 'sent';
      const json: any = await res.json().catch(() => ({}));
      const codes = JSON.stringify(json?.error ?? '');
      if (res.status === 404 || codes.includes('UNREGISTERED') || (res.status === 400 && codes.includes('registration token'))) {
        return 'invalid';
      }
      console.warn(`[Push] Google refused a notification: ${res.status} ${json?.error?.status ?? ''}`);
      return 'failed';
    } catch (err: any) {
      console.warn(`[Push] Could not reach Google: ${err?.message ?? err}`);
      return 'failed';
    }
  }
}

/** Development: writes each notification to the log instead of sending it. */
export class LogSender implements PushSender {
  readonly sent: Array<{ platform: PushPlatform; token: string; message: PushMessage }> = [];

  async send(device: { platform: PushPlatform; token: string }, message: PushMessage): Promise<SendResult> {
    this.sent.push({ ...device, message });
    if (this.sent.length > 100) this.sent.shift();
    console.log(
      `[Push] (log) ${device.platform} …${device.token.slice(-6)}: ${message.title} — ${message.body} ${JSON.stringify(message.data)}`
    );
    return 'sent';
  }
}
