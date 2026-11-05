import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ChatResult, LLMProvider, ToolCall, ToolDefinition } from '@/types';

export interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;
}

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16000;
// "default" lets the API retry a policy decline on the model's own fallback chain.
// On a model without fallbacks the request simply runs on the model it names.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Claude via the Messages API. Assistant turns are replayed from `raw` (the
 * response's own content blocks) so thinking blocks go back unchanged, and the
 * results of one turn's tool calls are sent together in a single user message.
 */
export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult> {
    const system = messages.find((m) => m.role === 'system')?.content;

    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      ...(system ? { system } : {}),
      messages: toAnthropicMessages(messages.filter((m) => m.role !== 'system')),
      ...(tools.length > 0 ? { tools: tools.map(toAnthropicTool) } : {}),
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined this request.');
    }

    let text = '';
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, arguments: (block.input as Record<string, any>) ?? {} });
      }
    }

    return {
      text: text || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      raw: response.content,
    };
  }
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Beta.BetaTool {
  return {
    name: tool.name,
    description: tool.description ?? '',
    input_schema: tool.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
  };
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const result: Anthropic.Beta.BetaMessageParam[] = [];
  let pendingResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];

  const flushResults = () => {
    if (pendingResults.length === 0) return;
    result.push({ role: 'user', content: pendingResults });
    pendingResults = [];
  };

  for (const msg of messages) {
    if (msg.role === 'tool') {
      pendingResults.push({ type: 'tool_result', tool_use_id: msg.toolCallId ?? '', content: msg.content });
      continue;
    }
    flushResults();
    if (msg.role === 'assistant') {
      if (Array.isArray(msg.raw)) {
        result.push({ role: 'assistant', content: msg.raw as Anthropic.Beta.BetaContentBlockParam[] });
        continue;
      }
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      for (const tc of msg.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
      }
      result.push({ role: 'assistant', content });
    } else {
      result.push({ role: 'user', content: msg.content });
    }
  }
  flushResults();

  return result;
}
