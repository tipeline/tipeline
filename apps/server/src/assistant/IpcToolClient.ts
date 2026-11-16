import type { ToolClient, ToolDefinition } from '@tipeline/agent';

/** The Core lookups the assistant needs: CoreIpcClient in production, a fake in tests. */
export interface CoreRequester {
  request<T = any>(event: string, payload: unknown, timeoutMs?: number): Promise<T>;
}

/**
 * The tools the Server's assistant may call: reading and checking only. A run goes through
 * IpcToolClient.runWorkflow after the user's own checks, and drafts aren't offered yet.
 */
export const SERVER_ASSISTANT_TOOLS = new Set([
  'search_workflows', 'list_tasks', 'authoring_guide', 'list_actions', 'describe_actions', 'check_workflow',
]);

const TOOL_TIMEOUT_MS = 60_000;
// exec_task answers when the run ends; an approval step ends it early as 'paused'.
const RUN_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Core's assistant tools over the Server's IPC link (Core's `agentToolCall`), for one user:
 * the workflows they may not see are sent along, and Core leaves them out of every answer.
 * The MCP endpoint isn't used here: its one token gets past every role, and Core only
 * listens for it on its own machine.
 */
export class IpcToolClient implements ToolClient {
  constructor(
    private readonly core: CoreRequester,
    private readonly exclude: string[]
  ) {}

  async listTools(): Promise<ToolDefinition[]> {
    const tools = await this.core.request<ToolDefinition[]>('agentToolList', {}, TOOL_TIMEOUT_MS);
    return (tools ?? []).filter((tool) => SERVER_ASSISTANT_TOOLS.has(tool.name));
  }

  async callTool(name: string, args: Record<string, any>): Promise<string> {
    const { text, isError } = await this.callToolRaw(name, args);
    if (isError) throw new Error(text || `Tool "${name}" failed`);
    return text;
  }

  async callToolRaw(name: string, args: Record<string, any>): Promise<{ text: string; isError: boolean }> {
    if (!SERVER_ASSISTANT_TOOLS.has(name)) throw new Error(`The tool "${name}" isn't available on the Server`);
    return this.call(name, args, TOOL_TIMEOUT_MS);
  }

  /** Runs a workflow and waits for it; its events stream on runCorrelationId like any run's. */
  runWorkflow(identifier: string, variables: Record<string, unknown>, runCorrelationId: string) {
    return this.call('exec_task', { identifier, variables }, RUN_TIMEOUT_MS, runCorrelationId);
  }

  private async call(name: string, args: Record<string, any>, timeoutMs: number, runCorrelationId?: string) {
    const result = await this.core.request<{ text?: string; isError?: boolean }>(
      'agentToolCall',
      { name, arguments: args, exclude: this.exclude, ...(runCorrelationId ? { runCorrelationId } : {}) },
      timeoutMs
    );
    return { text: result?.text ?? '', isError: !!result?.isError };
  }
}
