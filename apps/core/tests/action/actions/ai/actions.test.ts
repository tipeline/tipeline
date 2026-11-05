import { describe, expect, it, vi, beforeEach } from 'vitest';

// --------------------------------------------------
// Mock `axios` so no real network call/API key usage happens.
// GroupAI.prompt calls `axios.post(url, requestBody, { headers })`.
// --------------------------------------------------
const { mockPost } = vi.hoisted(() => {
  const mockPost = vi.fn();
  return { mockPost };
});

vi.mock('axios', () => ({
  default: { post: mockPost },
}));

import { GroupAI } from '@action/actions/ai/actions';

describe('GroupAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('prompt', () => {
    it('posts to the OpenAI chat completions endpoint with the built request body', async () => {
      mockPost.mockResolvedValueOnce({
        data: { choices: [{ message: { content: 'Hello from OpenAI' } }] },
      });

      const result = await GroupAI.prompt({
        provider: 'openai',
        apiKey: 'sk-test-key',
        prompt: 'Say hello',
      });

      expect(result).toBe('Hello from OpenAI');
      expect(mockPost).toHaveBeenCalledTimes(1);
      const [url, body, config] = mockPost.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(body).toMatchObject({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: 'Say hello' }],
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1,
        stream: false,
      });
      expect(config.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-test-key',
      });
    });

    it('includes a system message as the first message for OpenAI/DeepSeek-style providers', async () => {
      mockPost.mockResolvedValueOnce({
        data: { choices: [{ message: { content: 'ok' } }] },
      });

      await GroupAI.prompt({
        provider: 'openai',
        apiKey: 'sk-test-key',
        prompt: 'Summarize this',
        systemMessage: 'You are terse.',
      });

      const [, body] = mockPost.mock.calls[0];
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are terse.' },
        { role: 'user', content: 'Summarize this' },
      ]);
    });

    it('posts to the DeepSeek endpoint using the OpenAI-shaped request body', async () => {
      mockPost.mockResolvedValueOnce({
        data: { choices: [{ message: { content: 'Hello from DeepSeek' } }] },
      });

      const result = await GroupAI.prompt({
        provider: 'deepseek',
        apiKey: 'ds-test-key',
        prompt: 'Say hello',
      });

      expect(result).toBe('Hello from DeepSeek');
      const [url, body, config] = mockPost.mock.calls[0];
      expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(body.model).toBe('deepseek-chat');
      expect(body.messages).toEqual([{ role: 'user', content: 'Say hello' }]);
      expect(config.headers.Authorization).toBe('Bearer ds-test-key');
    });

    it('posts to the Anthropic messages endpoint with anthropic-shaped body and headers', async () => {
      mockPost.mockResolvedValueOnce({
        data: { content: [{ text: 'Hello from Claude' }] },
      });

      const result = await GroupAI.prompt({
        provider: 'anthropic',
        apiKey: 'ak-test-key',
        prompt: 'Say hello',
        systemMessage: 'Be concise.',
      });

      expect(result).toBe('Hello from Claude');
      const [url, body, config] = mockPost.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(body).toMatchObject({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 1,
        stream: false,
        system: 'Be concise.',
        messages: [{ role: 'user', content: 'Say hello' }],
      });
      expect(config.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-api-key': 'ak-test-key',
        'anthropic-version': '2023-06-01',
      });
      // Anthropic requests must not carry an OpenAI-style Authorization header
      expect(config.headers.Authorization).toBeUndefined();
    });

    it('uses an explicit model override instead of the provider default', async () => {
      mockPost.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'x' } }] } });

      await GroupAI.prompt({
        provider: 'openai',
        apiKey: 'sk-test-key',
        prompt: 'Say hello',
        model: 'gpt-4o',
      });

      const [, body] = mockPost.mock.calls[0];
      expect(body.model).toBe('gpt-4o');
    });

    it('passes frequencyPenalty/presencePenalty through for OpenAI when provided', async () => {
      mockPost.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'x' } }] } });

      await GroupAI.prompt({
        provider: 'openai',
        apiKey: 'sk-test-key',
        prompt: 'Say hello',
        frequencyPenalty: 0.5,
        presencePenalty: -0.2,
      });

      const [, body] = mockPost.mock.calls[0];
      expect(body.frequency_penalty).toBe(0.5);
      expect(body.presence_penalty).toBe(-0.2);
    });

    it('omits frequency/presence penalty keys entirely for Anthropic (unsupported)', async () => {
      mockPost.mockResolvedValueOnce({ data: { content: [{ text: 'x' }] } });

      await GroupAI.prompt({
        provider: 'anthropic',
        apiKey: 'ak-test-key',
        prompt: 'Say hello',
        frequencyPenalty: 0.5,
        presencePenalty: -0.2,
      });

      const [, body] = mockPost.mock.calls[0];
      expect(body.frequency_penalty).toBeUndefined();
      expect(body.presence_penalty).toBeUndefined();
      expect(body.frequencyPenalty).toBeUndefined();
    });

    it('returns an empty string when the Anthropic response has no content blocks', async () => {
      mockPost.mockResolvedValueOnce({ data: { content: [] } });

      const result = await GroupAI.prompt({
        provider: 'anthropic',
        apiKey: 'ak-test-key',
        prompt: 'Say hello',
      });

      expect(result).toBe('');
    });

    it('returns an empty string when the OpenAI-shaped response has no choices', async () => {
      mockPost.mockResolvedValueOnce({ data: { choices: [] } });

      const result = await GroupAI.prompt({
        provider: 'openai',
        apiKey: 'sk-test-key',
        prompt: 'Say hello',
      });

      expect(result).toBe('');
    });

    it('throws when apiKey is missing', async () => {
      await expect(
        GroupAI.prompt({ provider: 'openai', prompt: 'hi' } as any)
      ).rejects.toThrow();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('throws when prompt is an empty string', async () => {
      await expect(
        GroupAI.prompt({ provider: 'openai', apiKey: 'sk-test', prompt: '' })
      ).rejects.toThrow();
    });

    it('throws for an unsupported provider', async () => {
      await expect(
        GroupAI.prompt({ provider: 'bard' as any, apiKey: 'x', prompt: 'hi' })
      ).rejects.toThrow();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('throws when temperature is out of the 0-2 range', async () => {
      await expect(
        GroupAI.prompt({ provider: 'openai', apiKey: 'sk-test', prompt: 'hi', temperature: 3 })
      ).rejects.toThrow();
    });

    it('wraps a provider error response into an "AI API Error" message', async () => {
      mockPost.mockRejectedValueOnce({
        response: { data: { error: { message: 'invalid_api_key' } } },
      });

      await expect(
        GroupAI.prompt({ provider: 'openai', apiKey: 'sk-bad-key', prompt: 'hi' })
      ).rejects.toThrow('AI API Error: invalid_api_key');
    });

    it('falls back to the raw error message when the response has no structured error body', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network Error'));

      await expect(
        GroupAI.prompt({ provider: 'openai', apiKey: 'sk-test-key', prompt: 'hi' })
      ).rejects.toThrow('AI API Error: Network Error');
    });

    it('propagates a timeout/network rejection as an AI API Error', async () => {
      mockPost.mockRejectedValueOnce({ message: 'timeout of 5000ms exceeded' });

      await expect(
        GroupAI.prompt({ provider: 'deepseek', apiKey: 'ds-test-key', prompt: 'hi' })
      ).rejects.toThrow('AI API Error: timeout of 5000ms exceeded');
    });
  });
});
