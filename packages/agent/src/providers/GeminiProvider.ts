import { randomUUID } from 'node:crypto';
import { GoogleGenAI, type Content, type Part } from '@google/genai';
import type { ChatMessage, ChatResult, LLMProvider, ToolCall, ToolDefinition } from '@/types';

export interface GeminiProviderConfig {
  apiKey: string;
  model?: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Gemini's content roles are only 'user'/'model' (no 'system' or 'tool'), so the
 * system message is pulled out into systemInstruction and tool results are sent
 * back as a 'user'-role functionResponse part. FunctionResponse also needs the
 * original function *name*, which ChatMessage's 'tool' role doesn't carry — it's
 * recovered here from the preceding assistant message's toolCalls.
 */
export class GeminiProvider implements LLMProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(config: GeminiProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult> {
    const systemInstruction = messages.find((m) => m.role === 'system')?.content;
    const contents = toGeminiContents(messages.filter((m) => m.role !== 'system'));

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction,
        tools: tools.length > 0 ? [{ functionDeclarations: tools.map(toFunctionDeclaration) }] : undefined,
      },
    });

    const toolCalls: ToolCall[] = (response.functionCalls ?? []).map((fc) => ({
      id: fc.id ?? randomUUID(),
      name: fc.name ?? '',
      arguments: (fc.args as Record<string, any>) ?? {},
    }));

    return {
      text: response.text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

function toFunctionDeclaration(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description ?? '',
    parametersJsonSchema: tool.inputSchema,
  };
}

function toGeminiContents(messages: ChatMessage[]): Content[] {
  const callNameById = new Map<string, string>();
  const contents: Content[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      const parts: Part[] = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const tc of msg.toolCalls ?? []) {
        callNameById.set(tc.id, tc.name);
        parts.push({ functionCall: { id: tc.id, name: tc.name, args: tc.arguments } });
      }
      contents.push({ role: 'model', parts });
    } else if (msg.role === 'tool') {
      const name = callNameById.get(msg.toolCallId ?? '') ?? '';
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { id: msg.toolCallId, name, response: { output: msg.content } } }],
      });
    }
  }

  return contents;
}
