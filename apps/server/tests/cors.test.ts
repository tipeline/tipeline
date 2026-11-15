import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { applyCors, corsOrigins } from '../src/security/cors.js';

let server: http.Server;
let base: string;
let allowed: Set<string>;

beforeEach(async () => {
  allowed = corsOrigins('');
  server = http.createServer((req, res) => {
    if (applyCors(req, res, allowed)) return;
    res.writeHead(200).end('ok');
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const preflight = (origin: string) =>
  fetch(`${base}/auth/me`, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
  });

describe('corsOrigins', () => {
  it('always includes the mobile app origins', () => {
    expect([...corsOrigins(undefined)]).toEqual(['capacitor://localhost', 'https://localhost']);
  });

  it('adds listed origins, trimmed and without a trailing slash', () => {
    const origins = corsOrigins(' http://localhost:5173/ , https://app.acme.dev,,');
    expect(origins.has('http://localhost:5173')).toBe(true);
    expect(origins.has('https://app.acme.dev')).toBe(true);
    expect(origins.size).toBe(4);
  });
});

describe('applyCors', () => {
  it('answers a preflight from the iOS app', async () => {
    const res = await preflight('capacitor://localhost');
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(res.headers.get('access-control-allow-headers')).toMatch(/Authorization/);
    expect(res.headers.get('access-control-allow-methods')).toMatch(/PATCH/);
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('answers a preflight from an unlisted origin without CORS headers', async () => {
    const res = await preflight('https://evil.example');
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-methods')).toBeNull();
  });

  it('marks a normal request from an allowed origin and lets it through', async () => {
    const res = await fetch(`${base}/health`, { headers: { origin: 'https://localhost' } });
    expect(await res.text()).toBe('ok');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://localhost');
  });

  it('leaves requests without an Origin (Desktop, the CLI, webhooks) unchanged', async () => {
    const res = await fetch(`${base}/health`);
    expect(await res.text()).toBe('ok');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('lets a plain OPTIONS request (not a preflight) through to the routes', async () => {
    const res = await fetch(`${base}/health`, { method: 'OPTIONS' });
    expect(res.status).toBe(200);
  });

  it('allows every origin with "*"', async () => {
    allowed = corsOrigins('*');
    const res = await preflight('https://anything.example');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('vary')).toBeNull();
  });
});
