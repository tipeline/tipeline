import http from 'http';
import { runMigrations } from './db/migrations.js';
import { AuthService, type User } from './auth/AuthService.js';
import { isRole } from './auth/Permissions.js';
import { CoreIpcClient } from './ipc/CoreIpcClient.js';
import { WsGateway } from './ws/WsGateway.js';
import { WebhookRoutes } from './webhooks/WebhookRoutes.js';
import { TokenRoutes } from './tokens/TokenRoutes.js';
import { TaskOwnershipService } from './ownership/TaskOwnershipService.js';
import { PipelineAuditService } from './audit/PipelineAuditService.js';
import { AuditLogService } from './audit/AuditLogService.js';
import { RateLimiter } from './security/RateLimiter.js';
import { readBody, MAX_BODY_BYTES } from './utils/httpBody.js';

const PORT = parseInt(process.env.TIPELINE_SERVER_PORT ?? '4001', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.TIPELINE_RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.TIPELINE_RATE_LIMIT_MAX ?? '100', 10);
// Number of reverse-proxy hops to trust when reading X-Forwarded-For (0 = ignore the header
// entirely and use the raw socket address — the only safe default when there's no proxy in
// front of this process, since the header is otherwise fully attacker-controlled).
const TRUST_PROXY = parseInt(process.env.TIPELINE_TRUST_PROXY ?? '0', 10);

const LOGIN_RATE_LIMIT_MAX = 10;

export class ServerApp {
  private webhookRoutes!: WebhookRoutes;
  private tokenRoutes = new TokenRoutes();
  private generalLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);
  private loginLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX);

  async start(): Promise<void> {
    await runMigrations();
    await this.seedAdminUser();

    const coreClient = new CoreIpcClient();
    const wsGateway = new WsGateway(coreClient);
    this.webhookRoutes = new WebhookRoutes(coreClient, wsGateway);

    const httpServer = http.createServer((req, res) => {
      this.handleHttp(req, res).catch((err) => {
        console.error('[Server] Unhandled error in request handler:', err);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        if (!res.writableEnded) res.end(JSON.stringify({ error: 'Internal server error' }));
      });
    });
    wsGateway.attach(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
    });

    coreClient.connect().catch((err) => {
      console.error('[Server] Core connection error:', err);
    });

    const shutdown = () => {
      httpServer.close();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  private async seedAdminUser(): Promise<void> {
    const email = process.env.TIPELINE_ADMIN_EMAIL;
    const password = process.env.TIPELINE_ADMIN_PASSWORD;
    if (!email || !password) {
      if (!(await AuthService.hasUsers())) {
        console.warn('[Server] No admin user found. Set TIPELINE_ADMIN_EMAIL and TIPELINE_ADMIN_PASSWORD to create one.');
      }
      return;
    }
    if (!(await AuthService.hasUsers())) {
      await AuthService.createUser(email, 'Admin', password, 'admin');
      console.log(`[Server] Admin user created: ${email}`);
    } else {
      await AuthService.ensureAdminRole(email);
    }
  }

  private async requireUser(req: http.IncomingMessage, res: http.ServerResponse): Promise<User | null> {
    const raw = req.headers['authorization']?.slice(7) ?? '';
    const user = await AuthService.validateToken(raw);
    if (!user) {
      res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return user;
  }

  private async requireAdmin(req: http.IncomingMessage, res: http.ServerResponse): Promise<User | null> {
    const raw = req.headers['authorization']?.slice(7) ?? '';
    const user = await AuthService.validateToken(raw);
    if (!user || user.role !== 'admin') {
      res.writeHead(403).end(JSON.stringify({ error: 'Forbidden' }));
      return null;
    }
    return user;
  }

  private clientIp(req: http.IncomingMessage): string {
    const socketIp = req.socket.remoteAddress ?? 'unknown';
    if (TRUST_PROXY <= 0) return socketIp;

    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded !== 'string') return socketIp;

    // Each trusted proxy hop appends its own view of the client to the end of the chain.
    // Skip TRUST_PROXY entries from the right (those were appended by proxies we trust) to
    // land on the address the nearest trusted proxy actually saw — never trust the leftmost
    // entry outright, since that's whatever the original client chose to send.
    const chain = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    if (chain.length === 0) return socketIp;
    const index = Math.max(chain.length - TRUST_PROXY, 0);
    return chain[index] ?? socketIp;
  }

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    const ip = this.clientIp(req);

    if (req.method === 'POST' && req.url === '/auth/login') {
      if (!this.loginLimiter.hit(ip)) {
        res.setHeader('Retry-After', String(this.loginLimiter.retryAfter(ip)));
        res.writeHead(429).end(JSON.stringify({ error: 'Too many login attempts. Please try again later.' }));
        return;
      }
    } else if (!this.generalLimiter.hit(ip)) {
      res.setHeader('Retry-After', String(this.generalLimiter.retryAfter(ip)));
      res.writeHead(429).end(JSON.stringify({ error: 'Rate limit exceeded.' }));
      return;
    }

    const requireAdmin = () => this.requireAdmin(req, res);
    const requireUser = () => this.requireUser(req, res);
    if (await this.webhookRoutes.handle(req, res, requireAdmin, ip)) return;
    if (await this.tokenRoutes.handle(req, res, requireUser, ip)) return;

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200).end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'GET' && req.url === '/auth/me') {
      const raw = req.headers['authorization']?.slice(7) ?? '';
      const user = await AuthService.validateToken(raw);
      if (!user) { res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' })); return; }
      res.writeHead(200).end(JSON.stringify(user));
      return;
    }

    if (req.method === 'POST' && req.url === '/auth/login') {
      try {
        const body = await readBody(req, MAX_BODY_BYTES);
        const result = await AuthService.login(body.email, body.password);
        if (result.status === 'invalid') {
          await AuditLogService.log({ actorEmail: body.email, action: 'user.login_failed', ip });
          res.writeHead(401).end(JSON.stringify({ error: 'Invalid credentials' }));
          return;
        }
        if (result.status === 'mfa_required') {
          res.writeHead(200).end(JSON.stringify({ mfaRequired: true, challengeId: result.challengeId }));
          return;
        }
        await AuditLogService.log({ actorEmail: body.email, action: 'user.login_success', ip });
        res.writeHead(200).end(JSON.stringify({ token: result.token }));
      } catch (err: any) {
        const status = err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        res.writeHead(status).end(JSON.stringify({ error: err?.message ?? 'Bad request' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/auth/login/mfa') {
      if (!this.loginLimiter.hit(ip)) {
        res.writeHead(429).end(JSON.stringify({ error: 'Too many attempts. Please try again later.' }));
        return;
      }
      try {
        const body = await readBody(req, MAX_BODY_BYTES);
        const token = await AuthService.completeMfaLogin(body.challengeId, body.code);
        if (!token) {
          await AuditLogService.log({ action: 'user.login_failed', metadata: { reason: 'mfa' }, ip });
          res.writeHead(401).end(JSON.stringify({ error: 'Invalid or expired code' }));
          return;
        }
        await AuditLogService.log({ action: 'user.login_success', ip });
        res.writeHead(200).end(JSON.stringify({ token }));
      } catch (err: any) {
        res.writeHead(400).end(JSON.stringify({ error: err?.message ?? 'Bad request' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/auth/mfa/status') {
      const user = await this.requireUser(req, res);
      if (!user) return;
      res.writeHead(200).end(JSON.stringify(await AuthService.mfaStatus(user.id)));
      return;
    }

    if (req.method === 'GET' && req.url === '/auth/mfa/enrollment') {
      const admin = await this.requireAdmin(req, res);
      if (!admin) return;
      res.writeHead(200).end(JSON.stringify(await AuthService.mfaEnrollment()));
      return;
    }

    if (req.method === 'POST' && req.url === '/auth/mfa/enroll') {
      const user = await this.requireUser(req, res);
      if (!user) return;
      try {
        res.writeHead(200).end(JSON.stringify(await AuthService.startMfaEnrollment(user.id)));
      } catch (err: any) {
        res.writeHead(400).end(JSON.stringify({ error: err?.message ?? 'Bad request' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/auth/mfa/confirm') {
      const user = await this.requireUser(req, res);
      if (!user) return;
      try {
        const body = await readBody(req, MAX_BODY_BYTES);
        const backupCodes = await AuthService.confirmMfaEnrollment(user.id, body.code);
        await AuditLogService.log({ actorId: user.id, actorEmail: user.email, action: 'user.mfa_enabled', ip });
        res.writeHead(200).end(JSON.stringify({ backupCodes }));
      } catch (err: any) {
        res.writeHead(400).end(JSON.stringify({ error: err?.message ?? 'Invalid verification code' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/auth/mfa/disable') {
      const user = await this.requireUser(req, res);
      if (!user) return;
      try {
        const body = await readBody(req, MAX_BODY_BYTES);
        // Step-up re-auth: a stolen bearer token alone must not be enough to strip MFA —
        // require proof of the password or the second factor itself.
        const verified = body.password
          ? await AuthService.verifyUserPassword(user.id, body.password)
          : body.code
            ? await AuthService.verifyMfaCode(user.id, body.code)
            : false;
        if (!verified) {
          res.writeHead(401).end(JSON.stringify({ error: 'Re-authentication required: provide your current password or a verification code.' }));
          return;
        }
        await AuthService.disableMfa(user.id);
        await AuditLogService.log({ actorId: user.id, actorEmail: user.email, action: 'user.mfa_disabled', ip });
        res.writeHead(200).end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        const status = err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        res.writeHead(status).end(JSON.stringify({ error: err?.message ?? 'Bad request' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/audit-log')) {
      const admin = await this.requireAdmin(req, res);
      if (!admin) return;
      const urlObj = new URL(req.url, 'http://localhost');
      const limit = Math.min(parseInt(urlObj.searchParams.get('limit') ?? '100', 10), 500);
      const offset = parseInt(urlObj.searchParams.get('offset') ?? '0', 10);
      const action = urlObj.searchParams.get('action') ?? undefined;
      res.writeHead(200).end(JSON.stringify(await AuditLogService.list({ action, limit, offset })));
      return;
    }

    if (req.method === 'GET' && req.url === '/users') {
      const admin = await this.requireAdmin(req, res);
      if (!admin) return;
      res.writeHead(200).end(JSON.stringify(await AuthService.listUsers()));
      return;
    }

    if (req.method === 'POST' && (req.url === '/users' || req.url === '/auth/users')) {
      const admin = await this.requireAdmin(req, res);
      if (!admin) return;
      try {
        const body = await readBody(req, MAX_BODY_BYTES);
        if (!body.email || !body.name || !body.password) {
          res.writeHead(400).end(JSON.stringify({ error: 'email, name and password are required' }));
          return;
        }
        const role = body.role ?? 'editor';
        if (!isRole(role)) {
          res.writeHead(400).end(JSON.stringify({ error: 'role must be admin, editor, or viewer' }));
          return;
        }
        const user = await AuthService.createUser(body.email, body.name, body.password, role);
        await AuditLogService.log({
          actorId: admin.id, actorEmail: admin.email, action: 'user.invited',
          targetType: 'user', targetId: user.id, metadata: { role }, ip,
        });
        res.writeHead(201).end(JSON.stringify(user));
      } catch (err: any) {
        const status = err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        res.writeHead(status).end(JSON.stringify({ error: err?.message ?? 'Bad request' }));
      }
      return;
    }

    const userIdMatch = req.url?.match(/^\/users\/([^/]+)$/);

    if (req.method === 'PATCH' && userIdMatch) {
      const admin = await this.requireAdmin(req, res);
      if (!admin) return;
      try {
        const id = userIdMatch[1];
        const body = await readBody(req, MAX_BODY_BYTES);
        if (id === admin.id) {
          if (body.role !== undefined && body.role !== 'admin') {
            res.writeHead(400).end(JSON.stringify({ error: 'You cannot change your own role.' }));
            return;
          }
          if (body.is_active === 0) {
            res.writeHead(400).end(JSON.stringify({ error: 'You cannot deactivate your own account.' }));
            return;
          }
        }
        if (body.role !== undefined && !isRole(body.role)) {
          res.writeHead(400).end(JSON.stringify({ error: 'role must be admin, editor, or viewer' }));
          return;
        }
        const user = await AuthService.updateUser(id, {
          name: body.name,
          role: body.role,
          is_active: body.is_active,
        });
        if (body.role !== undefined) {
          await AuditLogService.log({
            actorId: admin.id, actorEmail: admin.email, action: 'user.role_changed',
            targetType: 'user', targetId: id, metadata: { role: body.role }, ip,
          });
        }
        if (body.is_active === 0) {
          await AuditLogService.log({
            actorId: admin.id, actorEmail: admin.email, action: 'user.deactivated',
            targetType: 'user', targetId: id, ip,
          });
        }
        res.writeHead(200).end(JSON.stringify(user));
      } catch (err: any) {
        const status = err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        res.writeHead(status).end(JSON.stringify({ error: err?.message ?? 'Bad request' }));
      }
      return;
    }

    if (req.method === 'DELETE' && userIdMatch) {
      const admin = await this.requireAdmin(req, res);
      if (!admin) return;
      try {
        const id = userIdMatch[1];
        await AuthService.updateUser(id, { is_active: 0 });
        res.writeHead(200).end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        res.writeHead(400).end(JSON.stringify({ error: err.message ?? 'Bad request' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/tasks/ownership') {
      const user = await this.requireUser(req, res);
      if (!user) return;
      res.writeHead(200).end(JSON.stringify(await TaskOwnershipService.listAll()));
      return;
    }

    const taskVisibilityMatch = req.url?.match(/^\/tasks\/([^/]+)\/visibility$/);
    if (req.method === 'PATCH' && taskVisibilityMatch) {
      const user = await this.requireUser(req, res);
      if (!user) return;
      try {
        const identifier = decodeURIComponent(taskVisibilityMatch[1]);
        const body = await readBody(req, MAX_BODY_BYTES);
        if (!['shared', 'private'].includes(body.visibility)) {
          res.writeHead(400).end(JSON.stringify({ error: 'visibility must be "shared" or "private"' }));
          return;
        }
        const ok = await TaskOwnershipService.setVisibility(identifier, user.id, user.role === 'admin', body.visibility);
        if (!ok) {
          res.writeHead(403).end(JSON.stringify({ error: 'You do not own this workflow' }));
          return;
        }
        res.writeHead(200).end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        const status = err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        res.writeHead(status).end(JSON.stringify({ error: err?.message ?? 'Bad request' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/pipeline-audit')) {
      const user = await this.requireUser(req, res);
      if (!user) return;
      const urlObj = new URL(req.url, 'http://localhost');
      const limit = Math.min(parseInt(urlObj.searchParams.get('limit') ?? '100', 10), 500);
      const offset = parseInt(urlObj.searchParams.get('offset') ?? '0', 10);
      res.writeHead(200).end(JSON.stringify(await PipelineAuditService.list(limit, offset)));
      return;
    }

    res.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
  }
}
