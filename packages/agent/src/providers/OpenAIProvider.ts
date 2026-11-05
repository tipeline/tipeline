import { OpenAICompatibleProvider } from '@/providers/OpenAICompatibleProvider';

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Plain OpenAI-compatible provider. With no `baseURL` it talks to api.openai.com;
 * pointing `baseURL` at an OpenAI-compatible proxy (e.g. an internal LiteLLM
 * deployment) routes through that instead, using the same request/response shape.
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: OpenAIProviderConfig) {
    super({
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_MODEL,
      baseURL: config.baseURL,
    });
  }
}
