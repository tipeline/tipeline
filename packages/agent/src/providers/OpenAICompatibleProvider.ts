import OpenAI from 'openai';
import type { ChatMessage, ChatResult, LLMProvider, ToolCall, ToolDefinition } from '@/types';

export interface OpenAICompatibleProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

/**
 * Shared client for any provider that speaks OpenAI's chat-completions + tool-calling
 * shape — DeepSeek, OpenAI itself, and OpenAI-compatible proxies such as LiteLLM.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    this.model = config.model;
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(toOpenAIMessage),
      tools: tools.length > 0 ? tools.map(toOpenAITool) : undefined,
    });

    const message = response.choices[0]?.message;
    if (!message) return {};

    const toolCalls: ToolCall[] = (message.tool_calls ?? [])
      .filter((tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => tc.type === 'function')
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJson(tc.function.arguments),
      }));

    return {
      text: message.content ?? undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

function toOpenAITool(tool: ToolDefinition): OpenAI.Chat.ChatCompletionFunctionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.inputSchema,
    },
  };
}

function toOpenAIMessage(msg: ChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (msg.role === 'tool') {
    return { role: 'tool', tool_call_id: msg.toolCallId ?? '', content: msg.content };
  }
  if (msg.role === 'assistant') {
    return {
      role: 'assistant',
      content: msg.content || null,
      tool_calls: msg.toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  if (msg.role === 'system') {
    return { role: 'system', content: msg.content };
  }
  return { role: 'user', content: msg.content };
}

function safeParseJson(text: string): Record<string, any> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
