export const aiConfig = {
  providers: {
    deepseek: {
      baseUrl: 'https://api.deepseek.com/v1',
      endpoint: '/chat/completions',
      defaultModel: 'deepseek-chat',
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }),
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      endpoint: '/chat/completions',
      defaultModel: 'gpt-4-turbo-preview',
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }),
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com/v1',
      endpoint: '/messages',
      defaultModel: 'claude-3-5-sonnet-20241022',
      headers: (apiKey: string) => ({
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }),
    },
  },
  defaults: {
    temperature: 0.7,
    maxTokens: 1000,
    topP: 1,
    stream: false,
  },
};
