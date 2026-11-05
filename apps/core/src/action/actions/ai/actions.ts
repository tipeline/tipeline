import axios from 'axios';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';
import { aiConfig } from './ai.config';

type PromptParams = z.infer<typeof validations.ai.prompt.runtime.schema>;

/**
 * @group Actions
 */
export class GroupAI {
  // --------------------------------------------------
  // Text Generation
  // --------------------------------------------------

  /**
   * Sends a prompt to an AI provider and returns the generated response text.
   *
   * Supported providers: `deepseek`, `openai`, `anthropic`.
   * `frequencyPenalty` and `presencePenalty` are only supported by OpenAI and DeepSeek.
   *
   * @param params - The input parameters.
   * @returns The AI-generated response text.
   * @example
   * ```yaml
   * # Summarize a document with DeepSeek using a system message and moderate temperature
   * - group: ai
   *   name: prompt
   *   params:
   *     provider: deepseek
   *     apiKey: '{{ deepseekKey }}'
   *     prompt: 'Summarize the following document: {{ documentText }}'
   *     systemMessage: 'You are a concise technical writer. Return plain text only.'
   *     temperature: 0.5
   *     maxTokens: 300
   * ```
   */
  static async prompt(params: PromptParams): Promise<string> {
    const parsed = validations.ai.prompt.runtime.validate(params);

    const provider = parsed.provider as 'deepseek' | 'openai' | 'anthropic';
    const providerConfig = aiConfig.providers[provider];
    if (!providerConfig) {
      throw new Error(`Unsupported provider: ${parsed.provider}`);
    }

    const model = parsed.model || providerConfig.defaultModel;
    const url = `${providerConfig.baseUrl}${providerConfig.endpoint}`;
    const headers = providerConfig.headers(parsed.apiKey);
    const requestBody = GroupAI.buildRequestBody(parsed.provider, model, parsed);

    try {
      const response = await axios.post(url, requestBody, { headers });
      return GroupAI.extractResponse(parsed.provider, response.data);
    } catch (error: any) {
      throw new Error(`AI API Error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // --------------------------------------------------
  // Private helpers
  // --------------------------------------------------

  private static buildRequestBody(provider: string, model: string, params: PromptParams): any {
    switch (provider) {
      case 'anthropic':
        return GroupAI.buildAnthropicRequest(model, params);
      case 'openai':
        return GroupAI.buildOpenAIRequest(model, params);
      case 'deepseek':
        return GroupAI.buildDeepSeekRequest(model, params);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private static buildAnthropicRequest(model: string, params: PromptParams): any {
    const body: any = {
      model,
      max_tokens: params.maxTokens ?? aiConfig.defaults.maxTokens,
      temperature: params.temperature ?? aiConfig.defaults.temperature,
      top_p: params.topP ?? aiConfig.defaults.topP,
      stream: params.stream ?? aiConfig.defaults.stream,
      messages: [{ role: 'user', content: params.prompt }],
    };

    if (params.systemMessage) {
      body.system = params.systemMessage;
    }

    return body;
  }

  private static buildOpenAIRequest(model: string, params: PromptParams): any {
    const messages: any[] = [];

    if (params.systemMessage) {
      messages.push({ role: 'system', content: params.systemMessage });
    }

    messages.push({ role: 'user', content: params.prompt });

    const body: any = {
      model,
      messages,
      temperature: params.temperature ?? aiConfig.defaults.temperature,
      max_tokens: params.maxTokens ?? aiConfig.defaults.maxTokens,
      top_p: params.topP ?? aiConfig.defaults.topP,
      stream: params.stream ?? aiConfig.defaults.stream,
    };

    if (params.frequencyPenalty !== undefined) {
      body.frequency_penalty = params.frequencyPenalty;
    }

    if (params.presencePenalty !== undefined) {
      body.presence_penalty = params.presencePenalty;
    }

    return body;
  }

  // DeepSeek uses the same request format as OpenAI
  private static buildDeepSeekRequest(model: string, params: PromptParams): any {
    return GroupAI.buildOpenAIRequest(model, params);
  }

  private static extractResponse(provider: string, data: any): string {
    if (provider === 'anthropic') {
      return data.content?.[0]?.text || '';
    }
    return data.choices?.[0]?.message?.content || '';
  }
}
