import type http from 'http';
import type { User } from '../auth/AuthService.js';
import { readBody } from '../utils/httpBody.js';
import { PUSH_PLATFORMS, PushDeviceService, type PushDevice, type PushPlatform } from './PushDeviceService.js';

function json(res: http.ServerResponse, status: number, data: unknown): void {
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const DEVICE_RE = /^\/devices\/([^/?]+)$/;
const MAX_TOKEN_LENGTH = 4096;

/** A device as its owner sees it: the token itself stays on the Server. */
const publicDevice = (d: PushDevice) => ({
  id: d.id,
  platform: d.platform,
  locale: d.locale,
  preferences: d.preferences,
  createdAt: d.createdAt,
  lastSeenAt: d.lastSeenAt,
});

/**
 * Push notification routes. Always there, so a phone can ask whether this Server sends them:
 *   GET    /push           → { enabled, platforms }
 *   GET    /devices        → this user's devices
 *   POST   /devices        → register this phone { platform, token, locale?, preferences? }
 *   PATCH  /devices/:id    → change its choices { preferences }
 *   DELETE /devices/:id    → stop (signing out on the phone)
 * Registering is refused when the Server has no push set up for that platform.
 */
export class PushRoutes {
  constructor(private readonly platforms: PushPlatform[]) {}

  async handle(req: http.IncomingMessage, res: http.ServerResponse, requireUser: () => Promise<User | null>): Promise<boolean> {
    const { method } = req;
    const url = (req.url ?? '').split('?')[0];
    if (url !== '/push' && url !== '/devices' && !DEVICE_RE.test(url)) return false;

    const user = await requireUser();
    if (!user) return true;

    if (method === 'GET' && url === '/push') {
      json(res, 200, { enabled: this.platforms.length > 0, platforms: this.platforms });
      return true;
    }
    if (method === 'GET' && url === '/devices') {
      json(res, 200, (await PushDeviceService.listForUser(user.id)).map(publicDevice));
      return true;
    }
    if (method === 'POST' && url === '/devices') {
      let body: any;
      try {
        body = await readBody(req);
      } catch (err: any) {
        json(res, 400, { error: err?.message ?? 'Invalid body' });
        return true;
      }
      const platform = body?.platform;
      const token = typeof body?.token === 'string' ? body.token.trim() : '';
      if (!PUSH_PLATFORMS.includes(platform)) {
        json(res, 400, { error: 'platform must be "ios" or "android"' });
        return true;
      }
      if (!token || token.length > MAX_TOKEN_LENGTH) {
        json(res, 400, { error: 'token is required' });
        return true;
      }
      if (!this.platforms.includes(platform)) {
        json(res, 409, { error: `This server doesn't send push notifications to ${platform === 'ios' ? 'iPhones' : 'Android phones'}` });
        return true;
      }
      const locale = typeof body?.locale === 'string' ? body.locale.slice(0, 20) : null;
      const device = await PushDeviceService.register(user.id, { platform, token, locale, preferences: body?.preferences });
      json(res, 200, publicDevice(device));
      return true;
    }

    const match = url.match(DEVICE_RE);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (method === 'PATCH') {
        let body: any;
        try {
          body = await readBody(req);
        } catch (err: any) {
          json(res, 400, { error: err?.message ?? 'Invalid body' });
          return true;
        }
        const device = await PushDeviceService.updatePreferences(user.id, id, body?.preferences);
        if (!device) json(res, 404, { error: 'Device not found' });
        else json(res, 200, publicDevice(device));
        return true;
      }
      if (method === 'DELETE') {
        if (await PushDeviceService.remove(user.id, id)) json(res, 200, { removed: true });
        else json(res, 404, { error: 'Device not found' });
        return true;
      }
    }

    json(res, 405, { error: 'Method not allowed' });
    return true;
  }
}
