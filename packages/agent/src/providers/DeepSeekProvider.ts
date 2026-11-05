import { OpenAICompatibleProvider } from '@/providers/OpenAICompatibleProvider';

export interface DeepSeekProviderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';

/** DeepSeek's chat API is OpenAI-compatible, so this just pins the shared client to DeepSeek's defaults. */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config: DeepSeekProviderConfig) {
    super({
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_MODEL,
      baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    });
  }
}
