import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import { explainCoreError, explainModelError, networkFailure } from '@/errors';

/** The shape fetch failures take inside Node: TypeError('fetch failed') caused by a system error. */
function fetchFailed(code: string, hostname?: string) {
  const system = Object.assign(new Error(`getaddrinfo ${code}`), { code, hostname });
  return Object.assign(new TypeError('fetch failed'), { cause: system });
}

describe('networkFailure', () => {
  it('finds the code and host in the cause chain', () => {
    expect(networkFailure(fetchFailed('ENOTFOUND', 'api.deepseek.com'))).toEqual({
      code: 'ENOTFOUND',
      host: 'api.deepseek.com',
    });
  });

  it("recognises the OpenAI SDK's own connection error", () => {
    const error = new OpenAI.APIConnectionError({ cause: fetchFailed('ENOTFOUND', 'api.deepseek.com') });
    expect(error.message).toBe('Connection error.');
    expect(networkFailure(error)?.code).toBe('ENOTFOUND');
    expect(networkFailure(new OpenAI.APIConnectionError({}))).toEqual({ code: 'connection' });
  });

  it('ignores errors that are not about the network', () => {
    expect(networkFailure(new Error('Bad request'))).toBeNull();
  });
});

describe('explainModelError', () => {
  it('names the provider and the host it could not look up', () => {
    const error = new OpenAI.APIConnectionError({ cause: fetchFailed('ENOTFOUND', 'api.deepseek.com') });
    expect(explainModelError(error, 'DeepSeek').message).toBe(
      "Couldn't reach DeepSeek (api.deepseek.com: its address couldn't be looked up). Check your internet connection and try again."
    );
  });

  it('keeps the original error as the cause', () => {
    const original = fetchFailed('ECONNREFUSED');
    expect((explainModelError(original, 'OpenAI') as any).cause).toBe(original);
  });

  it('points a rejected key at Settings', () => {
    const error = Object.assign(new Error('401 Unauthorized'), { status: 401 });
    expect(explainModelError(error, 'Anthropic').message).toBe(
      'Anthropic rejected the API key. Check it in Settings → Assistant.'
    );
  });

  it('prefixes any other error with the provider', () => {
    expect(explainModelError(new Error('model not found'), 'Gemini').message).toBe('Gemini: model not found');
  });
});

describe('explainCoreError', () => {
  it('says Core is not reachable', () => {
    expect(explainCoreError(fetchFailed('ECONNREFUSED'), 'http://127.0.0.1:4002/mcp').message).toBe(
      "Couldn't reach Tipeline Core at http://127.0.0.1:4002/mcp. Make sure it's running (tipeline start)."
    );
  });

  it('says the token was refused', () => {
    expect(explainCoreError(new Error('Error POSTing to endpoint (HTTP 401)'), 'x').message).toMatch(/refused the MCP token/);
  });

  it('passes other errors through unchanged', () => {
    const error = new Error('Tool failed');
    expect(explainCoreError(error, 'x')).toBe(error);
  });
});
