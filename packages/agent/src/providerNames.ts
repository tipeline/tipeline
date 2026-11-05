export const PROVIDERS = ['anthropic', 'deepseek', 'gemini', 'openai'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  openai: 'OpenAI',
};
