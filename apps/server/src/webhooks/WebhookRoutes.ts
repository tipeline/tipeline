import type http from 'http';
import { WebhookService, hashWebhookToken } from './WebhookService.js';
import type { User } from '../auth/AuthService.js';
import type { CoreIpcClient } from '../ipc/CoreIpcClient.js';
import type { WsGateway } from '../ws/WsGateway.js';
import { AuditLogService } from '../audit/AuditLogService.js';
import { readBody } from '../utils/httpBody.js';

// Simple in-memory rate limiter: 100 requests/min per token hash
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= 100) return false;
  bucket.count++;
  return true;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc: any, key: string) => acc?.[key], obj);
}

function resolveVariables(body: any, mapping: Record<string, string> | null): Record<string, any> {
  const variables: Record<string, any> = { payload: body };
  if (mapping) {
    for (const [varName, path] of Object.entries(mapping)) {
      variables[varName] = getNestedValue(body, path);
    }
  }
  return variables;
}

function json(res: http.ServerResponse, status: number, data: any): void {
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify(data));
}

// The trigger token travels in the X-Webhook-Token header, not the URL — a URL-embedded
// secret is prone to leaking via access logs, proxies, browser history, and Referer headers
// on redirect. The path itself identifies nothing; the header alone determines the webhook.
const TRIGGER_PATH = '/webhooks/trigger';
const WEBHOOK_TOKEN_HEADER = 'x-webhook-token';
const WEBHOOK_ID_RE = /^\/webhooks\/([^/]+)$/;
const ROTATE_RE = /^\/webhooks\/([^/]+)\/rotate$/;

export class WebhookRoutes {
  constructor(
    private readonly coreClient: CoreIpcClient,
    private readonly gateway?: WsGateway
  ) {}

  async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requireAdmin: () => Promise<User | null>,
    ip?: string
  ): Promise<boolean> {
    const { method, url = '' } = req;

    if (!url.startsWith('/webhooks')) return false;

    const path = url.split('?')[0];
    if (path === TRIGGER_PATH) {
      await this.handleTrigger(req, res);
      return true;
    }

    const admin = await requireAdmin();
    if (!admin) return true;

    if (method === 'GET' && url === '/webhooks') {
      json(res, 200, await WebhookService.list());
      return true;
    }

    if (method === 'POST' && url === '/webhooks') {
      try {
        const body = await readBody(req);
        if (!body.name || !body.task_identifier) {
          json(res, 400, { error: 'name and task_identifier are required' });
          return true;
        }
        const result = await WebhookService.create({
          name: body.name,
          task_identifier: body.task_identifier,
          method: body.method,
          variables_mapping: body.variables_mapping ?? null,
          created_by: admin.id,
        });
        await AuditLogService.log({
          actorId: admin.id, actorEmail: admin.email, action: 'webhook.created',
          targetType: 'webhook', targetId: result.webhook.id, metadata: { name: body.name }, ip,
        });
        json(res, 201, result);
      } catch (err: any) {
        json(res, err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: err.message ?? 'Bad request' });
      }
      return true;
    }

    const rotateMatch = url.match(ROTATE_RE);
    const idMatch = url.match(WEBHOOK_ID_RE);

    if (method === 'POST' && rotateMatch) {
      try {
        const result = await WebhookService.rotateToken(rotateMatch[1]);
        await AuditLogService.log({
          actorId: admin.id, actorEmail: admin.email, action: 'webhook.rotated',
          targetType: 'webhook', targetId: rotateMatch[1], ip,
        });
        json(res, 200, result);
      } catch (err: any) {
        json(res, 404, { error: err.message ?? 'Not found' });
      }
      return true;
    }

    if (method === 'GET' && idMatch) {
      const webhook = await WebhookService.getById(idMatch[1]);
      if (!webhook) { json(res, 404, { error: 'Not found' }); return true; }
      json(res, 200, webhook);
      return true;
    }

    if (method === 'PATCH' && idMatch) {
      try {
        const body = await readBody(req);
        const updated = await WebhookService.update(idMatch[1], {
          name: body.name,
          task_identifier: body.task_identifier,
          method: body.method,
          enabled: body.enabled,
          variables_mapping: body.variables_mapping,
        });
        json(res, 200, updated);
      } catch (err: any) {
        json(res, err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: err.message ?? 'Bad request' });
      }
      return true;
    }

    if (method === 'DELETE' && idMatch) {
      try {
        await WebhookService.delete(idMatch[1]);
        await AuditLogService.log({
          actorId: admin.id, actorEmail: admin.email, action: 'webhook.deleted',
          targetType: 'webhook', targetId: idMatch[1], ip,
        });
        json(res, 200, { ok: true });
      } catch (err: any) {
        json(res, 400, { error: err.message ?? 'Bad request' });
      }
      return true;
    }

    return false;
  }

  private async handleTrigger(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const rawToken = req.headers[WEBHOOK_TOKEN_HEADER];
    if (typeof rawToken !== 'string' || !rawToken) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    const tokenHash = hashWebhookToken(rawToken);

    if (!checkRateLimit(tokenHash)) {
      json(res, 429, { error: 'Too many requests' });
      return;
    }

    const webhook = await WebhookService.findByTokenHash(tokenHash);

    if (!webhook || !webhook.enabled) {
      json(res, 404, { error: 'Not found' });
      return;
    }

    let body: any = {};
    const method = req.method ?? 'POST';
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try {
        body = await readBody(req);
      } catch (err: any) {
        json(res, err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { error: err.message ?? 'Bad request' });
        return;
      }
    }

    const urlObj = new URL(req.url ?? '/', 'http://localhost');
    const queryParams: Record<string, string> = {};
    urlObj.searchParams.forEach((v, k) => { queryParams[k] = v; });

    const mapping = webhook.variables_mapping ? JSON.parse(webhook.variables_mapping) : null;
    const variables = resolveVariables(body, mapping);
    if (Object.keys(queryParams).length > 0) variables.query = queryParams;

    const correlationId = `webhook-${webhook.id}-${Date.now()}`;

    this.gateway?.registerWebhookTrigger(correlationId, webhook.id, webhook.name, webhook.task_identifier);

    this.coreClient.send('exec', {
      correlationId,
      payload: {
        identifier: webhook.task_identifier,
        variables,
      },
    });

    await WebhookService.updateLastTriggered(webhook.id);
    console.log(`[WebhookRoutes] Triggered "${webhook.task_identifier}" via webhook "${webhook.name}" [${webhook.id}]`);

    json(res, 202, { ok: true });
  }
}
