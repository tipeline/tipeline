import type http from 'http';
import { AuthService } from '../auth/AuthService.js';
import { AuditLogService } from '../audit/AuditLogService.js';
import type { User } from '../auth/AuthService.js';
import { readBody } from '../utils/httpBody.js';

function json(res: http.ServerResponse, status: number, data: any): void {
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const TOKEN_ID_RE = /^\/tokens\/([^/]+)$/;
const ROTATE_RE = /^\/tokens\/([^/]+)\/rotate$/;
const REVOKE_RE = /^\/tokens\/([^/]+)\/revoke$/;

const EXPIRY_DAYS: Record<string, number> = { '30d': 30, '90d': 90, '180d': 180 };

export class TokenRoutes {
  async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requireUser: () => Promise<User | null>,
    ip: string
  ): Promise<boolean> {
    const { method, url = '' } = req;
    if (!url.startsWith('/tokens')) return false;

    const user = await requireUser();
    if (!user) return true;

    try {
      return await this.route(req, res, user, method, url, ip);
    } catch (err: any) {
      json(res, 500, { error: err?.message ?? 'Internal server error' });
      return true;
    }
  }

  private async route(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    user: User,
    method: string | undefined,
    url: string,
    ip: string
  ): Promise<boolean> {
    if (method === 'GET' && url === '/tokens') {
      const raw = req.headers['authorization']?.slice(7) ?? '';
      const [tokens, currentTokenId] = await Promise.all([
        AuthService.listTokens(user),
        AuthService.currentTokenId(raw),
      ]);
      json(res, 200, { tokens, currentTokenId });
      return true;
    }

    if (method === 'POST' && url === '/tokens') {
      try {
        const body = await readBody(req);
        if (!body.name) {
          json(res, 400, { error: 'name is required' });
          return true;
        }
        const expiresAt = body.expiresIn && EXPIRY_DAYS[body.expiresIn]
          ? new Date(Date.now() + EXPIRY_DAYS[body.expiresIn] * 24 * 60 * 60 * 1000).toISOString()
          : null;
        // Manual creation always produces an API token — sessions only ever come from login().
        const token = await AuthService.createToken(user.id, body.name, { expiresAt, scope: body.scope, kind: 'api' });
        const [created] = await AuthService.listTokens(user);
        await AuditLogService.log({
          actorId: user.id, actorEmail: user.email, action: 'token.created',
          targetType: 'token', targetId: created?.id, metadata: { name: body.name }, ip,
        });
        json(res, 201, { token, ...created });
      } catch (err: any) {
        json(res, err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: err.message ?? 'Bad request' });
      }
      return true;
    }

    const rotateMatch = url.match(ROTATE_RE);
    const revokeMatch = url.match(REVOKE_RE);
    const idMatch = url.match(TOKEN_ID_RE);

    if (method === 'POST' && rotateMatch) {
      const id = rotateMatch[1];
      const owner = await AuthService.getTokenOwner(id);
      if (!owner || (owner !== user.id && user.role !== 'admin')) {
        json(res, 403, { error: 'Forbidden' });
        return true;
      }
      try {
        const token = await AuthService.rotateToken(id);
        const updated = await AuthService.getTokenPublic(id);
        await AuditLogService.log({
          actorId: user.id, actorEmail: user.email, action: 'token.rotated',
          targetType: 'token', targetId: id, ip,
        });
        json(res, 200, { token, ...updated });
      } catch (err: any) {
        json(res, 400, { error: err.message ?? 'Bad request' });
      }
      return true;
    }

    if (method === 'POST' && revokeMatch) {
      const id = revokeMatch[1];
      const owner = await AuthService.getTokenOwner(id);
      if (!owner || (owner !== user.id && user.role !== 'admin')) {
        json(res, 403, { error: 'Forbidden' });
        return true;
      }
      const before = await AuthService.getTokenPublic(id);
      await AuthService.revokeToken(id);
      const updated = await AuthService.getTokenPublic(id);
      await AuditLogService.log({
        actorId: user.id, actorEmail: user.email, action: before?.kind === 'session' ? 'session.revoked' : 'token.revoked',
        targetType: 'token', targetId: id, ip,
      });
      json(res, 200, { ok: true, ...updated });
      return true;
    }

    if (method === 'DELETE' && idMatch) {
      const id = idMatch[1];
      const owner = await AuthService.getTokenOwner(id);
      if (!owner || (owner !== user.id && user.role !== 'admin')) {
        json(res, 403, { error: 'Forbidden' });
        return true;
      }
      const before = await AuthService.getTokenPublic(id);
      await AuthService.revokeToken(id);
      await AuditLogService.log({
        actorId: user.id, actorEmail: user.email, action: before?.kind === 'session' ? 'session.revoked' : 'token.revoked',
        targetType: 'token', targetId: id, ip,
      });
      json(res, 200, { ok: true });
      return true;
    }

    return false;
  }
}
