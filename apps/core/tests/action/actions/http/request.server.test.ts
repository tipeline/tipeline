import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validations } from '@tipeline/schemas';
import { GroupHTTP } from '@/action/actions/http/actions';
import { coerceVariableValue } from '@/utils/coerceVariableValue';

// Real axios against a real local server: what a response looks like is the point here.
describe('GroupHTTP.request against a real server', () => {
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Request-Id', 'abc');
        res.setHeader('Set-Cookie', 'session=secret-value');
        res.end(JSON.stringify({ id: 1 }));
      } else if (req.url === '/html') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!DOCTYPE html><title>Hi</title>');
      } else if (req.url === '/slow') {
        setTimeout(() => res.end('late'), 1000);
      } else {
        res.statusCode = 503;
        res.end('<!DOCTYPE html><title>Down</title>');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const request = (path: string, extra: Record<string, unknown> = {}): Promise<any> =>
    GroupHTTP.request({ url: `${base}${path}`, allowPrivateNetwork: true, ...extra } as any);

  it('parses a JSON body into data', async () => {
    const result = await request('/json');
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ id: 1 });
    expect(result.headers['x-request-id']).toBe('abc');
  });

  it('hides credential headers', async () => {
    const result = await request('/json');
    expect(result.headers['set-cookie']).toBe('[REDACTED]');
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('gives a plain, serializable object', async () => {
    const result = await request('/json');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.getPrototypeOf(result.headers)).toBe(Object.prototype);
  });

  it('keeps an HTML page as text in data, and an object variable accepts the result', async () => {
    const result = await request('/html');
    expect(result.status).toBe(200);
    expect(result.data).toContain('<!DOCTYPE html>');
    expect(coerceVariableValue(result, 'object', 'response')).toBe(result);
  });

  it('fails the step on a 5xx by default', async () => {
    await expect(request('/down')).rejects.toThrow('503');
  });

  it('returns the status of a 5xx when failOnHttpError is false', async () => {
    const result = await request('/down', { failOnHttpError: false });
    expect(result.status).toBe(503);
    expect(result.data).toContain('Down');
  });

  it('fails when the response takes longer than timeout', async () => {
    await expect(request('/slow', { timeout: 50 })).rejects.toThrow('timeout');
  });

  it('lets a saved workflow take its timeout from a variable', () => {
    const { schema } = validations.http.request.creation;
    const valid = (timeout: unknown) => schema.safeParse({ url: base, timeout }).success;
    expect(valid(5000)).toBe(true);
    expect(valid('{= timeoutMs =}')).toBe(true);
    expect(valid('soon')).toBe(false);
    expect(valid(-1)).toBe(false);
  });

  it('fails on a connection error by default', async () => {
    await expect(
      GroupHTTP.request({ url: 'http://127.0.0.1:1/', allowPrivateNetwork: true } as any)
    ).rejects.toThrow();
  });

  it('returns status 0 and the reason on a connection error when failOnHttpError is false', async () => {
    const result = await GroupHTTP.request({
      url: 'http://127.0.0.1:1/',
      allowPrivateNetwork: true,
      failOnHttpError: false,
    } as any);
    expect(result).toEqual({
      status: 0,
      headers: {},
      data: null,
      error: expect.stringContaining('ECONNREFUSED'),
    });
  });

  it('returns status 0 and the reason on a timeout when failOnHttpError is false', async () => {
    const result = await request('/slow', { timeout: 50, failOnHttpError: false });
    expect(result.status).toBe(0);
    expect(result.error).toContain('timeout');
  });

  it('adds no error when a response arrived', async () => {
    const result = await request('/down', { failOnHttpError: false });
    expect(result).not.toHaveProperty('error');
  });
});
