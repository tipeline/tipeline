import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolDefinition } from '@/types';
import { explainCoreError } from '@/errors';

export interface McpConnectionConfig {
  url: string;
  token: string;
}

export class McpClient {
  private client: Client;
  private connected: Promise<void> | null = null;

  constructor(private config: McpConnectionConfig) {
    this.client = new Client({ name: 'tipeline-agent', version: '1.0.0' });
  }

  private ensureConnected(): Promise<void> {
    if (!this.connected) {
      const transport = new StreamableHTTPClientTransport(new URL(this.config.url), {
        requestInit: { headers: { Authorization: `Bearer ${this.config.token}` } },
      });
      // A failed connection is forgotten, so the next request tries again.
      this.connected = this.client.connect(transport).catch((error) => {
        this.connected = null;
        throw explainCoreError(error, this.config.url);
      });
    }
    return this.connected;
  }

  async listTools(): Promise<ToolDefinition[]> {
    await this.ensureConnected();
    const { tools } = await this.client.listTools().catch((error) => {
      throw explainCoreError(error, this.config.url);
    });
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, any>,
    }));
  }

  async callTool(name: string, args: Record<string, any>): Promise<string> {
    const { text, isError } = await this.callToolRaw(name, args);
    if (isError) {
      throw new Error(text || `Tool "${name}" failed`);
    }
    return text;
  }

  /** Like callTool, but hands back a failed call's text instead of throwing, for tools whose errors carry data. */
  async callToolRaw(name: string, args: Record<string, any>): Promise<{ text: string; isError: boolean }> {
    await this.ensureConnected();
    const result = await this.client.callTool({ name, arguments: args }).catch((error) => {
      throw explainCoreError(error, this.config.url);
    });
    const content = result.content as Array<{ type: string; text?: string }> | undefined;
    const text = content?.filter((c) => c.type === 'text').map((c) => c.text).join('\n') ?? '';
    return { text, isError: !!result.isError };
  }
}
