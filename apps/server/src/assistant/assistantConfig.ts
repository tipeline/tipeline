import { INSTRUCTIONS_SETTING, PROVIDERS, type ProviderName } from '@tipeline/agent';

export interface AssistantConfig {
  provider: ProviderName;
  apiKey: string;
  baseURL?: string;
  model?: string;
  /** The instructions set for everyone in Settings → Assistant. */
  globalInstructions?: string;
}

/**
 * The organization's key, from the Server's Core settings: the same keys Desktop's
 * Settings → Assistant writes, so an admin connected to the Server sets it there. Only
 * admins can write settings, and the keys never go to anyone but an admin (hideSecrets.ts).
 * The provider is the chosen one, or else the first with a key, as on Desktop.
 * Null when no key is set.
 */
export function assistantConfigFrom(settings: Record<string, unknown> | null | undefined): AssistantConfig | null {
  const get = (key: string) => {
    const value = settings?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const stored = get('agent_provider');
  const provider = (PROVIDERS as readonly string[]).includes(stored ?? '')
    ? (stored as ProviderName)
    : PROVIDERS.find((name) => get(`agent_${name}_api_key`));
  const apiKey = provider ? get(`agent_${provider}_api_key`) : undefined;
  if (!provider || !apiKey) return null;
  return {
    provider,
    apiKey,
    baseURL: get(`agent_${provider}_base_url`),
    model: get(`agent_${provider}_model`),
    globalInstructions: get(INSTRUCTIONS_SETTING),
  };
}
