import { AnthropicProvider } from '@/providers/AnthropicProvider';
import { DeepSeekProvider } from '@/providers/DeepSeekProvider';
import { GeminiProvider } from '@/providers/GeminiProvider';
import { OpenAIProvider } from '@/providers/OpenAIProvider';
import type { LLMProvider } from '@/types';
import { PROVIDERS, type ProviderName } from '@/providerNames';

export { PROVIDERS };
export type { ProviderName };

export interface CreateProviderConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;
  baseURL?: string;
}

/** Central registry apps select an `LLMProvider` from — add new providers here only. */
export function createProvider(config: CreateProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey: config.apiKey, model: config.model });
    case 'gemini':
      return new GeminiProvider({ apiKey: config.apiKey, model: config.model });
    case 'deepseek':
      return new DeepSeekProvider({ apiKey: config.apiKey, model: config.model, baseURL: config.baseURL });
    case 'openai':
      return new OpenAIProvider({ apiKey: config.apiKey, model: config.model, baseURL: config.baseURL });
  }
}
