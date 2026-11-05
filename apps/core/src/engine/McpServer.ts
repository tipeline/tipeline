import http from 'http';
import { timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import Core from '@engine/Core';
import { TaskStreamListener } from '@engine/TaskStreamListener';
import IPCMessage from '@engine/IPCMessage';
import { coreEvents } from '@engine/CoreEvents';
import { outputDetails, reportedOutputNames, searchWorkflows, toWorkflowSummary } from '@engine/WorkflowCatalog';
import { TaskService } from '@database/services/TaskService';
import { readableValidationError } from '@utils/readableError';
import { isDraft } from '@task/Draft';
import { checkWorkflowYaml, describeActions, listActionGroups } from '@engine/WorkflowAuthoring';
import { capabilitySummary } from '@engine/WorkflowCapabilities';
import { Parser } from '@utils/Parser';
import { AUTHORING_GUIDE } from '@engine/AuthoringGuide';
import { HubWorkflowCatalog } from '@/hub/HubWorkflowCatalog';

// How much of a workflow's description goes back with its run, for writing the answer.
const DESCRIPTION_LIMIT = 1500;

type BroadcastFn = (event: string, data: any) => void;

/**
 * Embeds an MCP tool server inside Core, alongside the existing IPC/WebSocket
 * transports. Each HTTP request gets its own McpServer + transport pair (stateless
 * mode) so concurrent requests can't race over shared connection state.
 */
export class TipelineMcpServer {
  private httpServer: http.Server;
  private token: string;
  private broadcast: BroadcastFn;

  constructor(port: number, token: string, broadcast: BroadcastFn, host = '127.0.0.1') {
    this.token = token;
    this.broadcast = broadcast;

    this.httpServer = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[MCP] Port ${port} already in use — MCP tool server disabled.`);
      } else {
        console.error('[MCP] Server error:', err);
      }
    });

    this.httpServer.listen(port, host, () => {
      console.log(`[MCP] Listening on ${host}:${port}`);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.isAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const server = this.createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('[MCP] Request handling error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Internal error' }));
      }
    }
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    const auth = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return false;

    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(this.token);
    return tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer);
  }

  private createServer(): McpServer {
    const server = new McpServer({ name: 'tipeline-core', version: '1.0.0' });

    server.registerTool(
      'list_tasks',
      {
        description:
          'List all installed Tipeline workflows (also called tasks): identifier, name, one-line description, tags and inputs (public and protected variables a caller can set). Drafts are marked draft: true and cannot be run with exec_task. Prefer search_workflows when you have keywords.',
      },
      async () => {
        const workflows = (await TaskService.getAllWithSource()).map((task) => ({
          ...toWorkflowSummary(task),
          ...(isDraft(task) ? { draft: true } : {}),
        }));
        return { content: [{ type: 'text' as const, text: JSON.stringify(workflows) }] };
      }
    );

    const searchInputSchema: z.ZodRawShape = {
      query: z.string().optional().describe('A few keywords from the request, e.g. "monthly sales report"'),
      limit: z.number().int().min(1).max(25).optional().describe('How many workflows to return (default 10)'),
    };

    // Cast around registerTool's overload — see exec_task below.
    (server.registerTool as any)(
      'search_workflows',
      {
        description:
          'Find workflows that could handle a request: installed ones, and ones on the enabled hubs that are not installed yet. Returns { matched, total, workflows, unreachableHubs? }, each workflow with its identifier, name, description, tags, inputs (public and protected; name, type, label, description, required, default) and, when it declares them, its outputs (name, type, label, description): what a run returns. A workflow with a `hub` field is not installed; the user is asked to install it before it runs. A workflow with `helper: true` only feeds other workflows (it fetches data or looks something up): reuse it as a sub-workflow step, but never offer it as the answer to a request. When matched is false no keyword matched and the list is the start of the whole library: judge by meaning.',
        inputSchema: searchInputSchema,
      },
      async ({ query, limit }: { query?: string; limit?: number }) => {
        // Drafts aren't offered: nobody has checked them yet, and they won't run from here anyway.
        const installed = (await TaskService.getAllWithSource()).filter((task) => !isDraft(task)).map(toWorkflowSummary);
        const fromHubs = await HubWorkflowCatalog.uninstalledWorkflows().catch(() => ({
          workflows: [],
          unreachableHubs: [] as string[],
        }));
        const result = searchWorkflows([...installed, ...fromHubs.workflows], query, limit);
        const workflows = await HubWorkflowCatalog.withInputs(result.workflows);
        const reply = {
          ...result,
          workflows,
          ...(fromHubs.unreachableHubs.length > 0 ? { unreachableHubs: fromHubs.unreachableHubs } : {}),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(reply) }] };
      }
    );

    // ---- Writing workflows: what the assistant drafts with -----------------

    server.registerTool(
      'authoring_guide',
      {
        description:
          'How to write a Tipeline workflow in YAML: structure, variables, templates, loops and conditions, credentials, and two complete examples. Read it before writing one.',
      },
      async () => ({ content: [{ type: 'text' as const, text: AUTHORING_GUIDE }] })
    );

    server.registerTool(
      'list_actions',
      {
        description:
          'Every action group (built-in and plugin) with its actions and what each one does, e.g. { group: "string", actions: [{ name: "toUpperCase", description: "Convert string to upper case." }] }. Pick by what an action does, then use describe_actions for the fields of the ones you need.',
      },
      async () => ({ content: [{ type: 'text' as const, text: JSON.stringify(listActionGroups()) }] })
    );

    const describeInputSchema: z.ZodRawShape = {
      actions: z.array(z.string()).min(1).max(40).describe('Actions as group.name, e.g. ["math.multiply", "http.request"]'),
    };
    (server.registerTool as any)(
      'describe_actions',
      {
        description:
          'The fields (name, type, required, default, description), return type, description and an example step of each named action. The example is an illustration: copy its shape, not its values or variable names.',
        inputSchema: describeInputSchema,
      },
      async ({ actions }: { actions: string[] }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(describeActions(actions)) }],
      })
    );

    const yamlInputSchema: z.ZodRawShape = {
      yaml: z.string().min(1).describe('The whole workflow as YAML'),
    };
    (server.registerTool as any)(
      'check_workflow',
      {
        description:
          'Checks workflow YAML without saving it, the way installing and running it would: format, variables, known actions, every step\'s fields, condition order. Returns { valid, errors, warnings, canAccess }. canAccess is what the workflow can do outside the run (programs, servers and databases, changing or deleting files, plugin code, sending data online, reading files, scripts) with the steps that do it; review: true marks the ones the person should know about before using it.',
        inputSchema: yamlInputSchema,
      },
      async ({ yaml }: { yaml: string }) => {
        const check = await checkWorkflowYaml(yaml);
        let canAccess: Awaited<ReturnType<typeof capabilitySummary>> = [];
        try {
          canAccess = await capabilitySummary(Parser.importFromString(yaml));
        } catch {
          // YAML that doesn't parse is already in errors.
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ...check, canAccess }) }] };
      }
    );

    (server.registerTool as any)(
      'create_draft_workflow',
      {
        description:
          'Saves workflow YAML as a draft: checked first, nothing saved on errors. A draft opens in the builder for testing; it cannot be run with exec_task, scheduled or used by an app until someone marks it ready. With schedule, the draft also carries a proposed schedule that the person can turn on when they mark it ready. Returns { created, identifier, name, warnings, schedule? } or { created: false, errors, warnings }.',
        inputSchema: {
          ...yamlInputSchema,
          schedule: z
            .string()
            .optional()
            .describe(
              'When it should run on its own, in plain English or as a cron expression: "every day at 9am", "every weekday at 8:30", "every 15 minutes", "tomorrow at 8am", "0 9 * * 1-5". Leave out when the request does not say.'
            ),
        },
      },
      async ({ yaml, schedule }: { yaml: string; schedule?: string }) => {
        const result = await Core.draftCreate(yaml, schedule);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      }
    );

    const execTaskInputSchema: z.ZodRawShape = {
      identifier: z.string().describe('The installed workflow identifier, as returned by list_tasks or search_workflows'),
      variables: z.record(z.any()).optional().describe('Optional variable overrides for this run'),
    };

    // Cast around registerTool's overload: TS hits "excessively deep" (TS2589) resolving
    // its generic signature against zod 3.25's types for this shape — a known interaction
    // between @modelcontextprotocol/sdk's compat types and zod 3.x, not a runtime issue.
    (server.registerTool as any)(
      'exec_task',
      {
        description:
          'Execute an already-installed Tipeline workflow by its identifier and wait for it to finish. Returns JSON { status, pipelineIdentifier, durationMs, outputs, outputDetails?, description?, error? }: outputs are the final values of its outputs (or, when it declares none, of its public variables), outputDetails gives the label and description of each output that has one (what the value means, e.g. its unit), and description is the workflow\'s description. Does not create or modify workflows.',
        inputSchema: execTaskInputSchema,
      },
      async ({ identifier, variables }: { identifier: string; variables?: Record<string, any> }) =>
        this.execTask(identifier, variables ?? {})
    );

    return server;
  }

  private async execTask(identifier: string, variables: Record<string, any>) {
    const reply = (result: Record<string, unknown>, isError = false) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      ...(isError ? { isError: true } : {}),
    });

    const task = await TaskService.getByIdentifier(identifier);
    const source = task?.source ? JSON.parse(task.source) : null;
    if (!source) {
      return reply({ status: 'failed', pipelineIdentifier: '', durationMs: 0, outputs: {}, error: `Workflow not found: ${identifier}` }, true);
    }

    const correlationId = `mcp-${randomUUID()}`;
    // Core.exec() only submits the job — it doesn't broadcast progress on its own
    // (that only happens automatically for cron jobs). Wire the same
    // TaskStreamListener the IPC 'exec' handler uses so this run shows up live in
    // any connected desktop/CLI client, same as a manually-triggered run.
    const listener = new TaskStreamListener(correlationId, this.broadcast);
    listener.bind();

    // Asking for the reported variables makes the top-level run report them on its
    // taskEnd; a sub-workflow's taskEnd on the same correlationId carries no outputs.
    let pipelineIdentifier = '';
    let outputs: Record<string, unknown> | null = null;
    let endStatus: string | undefined;
    const onTaskStart = (data: any) => {
      if (!pipelineIdentifier) pipelineIdentifier = data?.pipelineIdentifier ?? '';
    };
    const onTaskEnd = (data: any) => {
      if (outputs !== null || data?.outputs === undefined) return;
      outputs = data.outputs;
      endStatus = data.status;
      if (data.pipelineIdentifier) pipelineIdentifier = data.pipelineIdentifier;
    };
    coreEvents.on(`taskStart:${correlationId}`, onTaskStart);
    coreEvents.on(`taskEnd:${correlationId}`, onTaskEnd);

    // What the outputs mean, for whoever writes the answer: the description (notes on units or
    // limits often sit past its first paragraph) and each output's label and description.
    const details = outputDetails(source);
    const description = String(source.description ?? '').trim().slice(0, DESCRIPTION_LIMIT);
    const about = {
      ...(Object.keys(details).length > 0 ? { outputDetails: details } : {}),
      ...(description ? { description } : {}),
    };

    const startedAt = Date.now();
    try {
      await Core.exec(identifier, correlationId, variables, false, false, { outputs: reportedOutputNames(source) });
      this.broadcast('onTaskEndAll', IPCMessage.success('Workflow finished successfully', correlationId));
      // 'paused' means the run is waiting on an approval step; a rejected approval ends as 'canceled'.
      const status = endStatus === 'canceled' || endStatus === 'paused' ? endStatus : 'completed';
      return reply({ status, pipelineIdentifier, durationMs: Date.now() - startedAt, outputs: outputs ?? {}, ...about });
    } catch (error: any) {
      const message = error.message ?? String(error);
      this.broadcast('onTaskError', IPCMessage.failure(message, correlationId));
      const readable = readableValidationError(message);
      return reply(
        { status: 'failed', pipelineIdentifier, durationMs: Date.now() - startedAt, outputs: outputs ?? {}, ...about, error: readable },
        true
      );
    } finally {
      coreEvents.off(`taskStart:${correlationId}`, onTaskStart);
      coreEvents.off(`taskEnd:${correlationId}`, onTaskEnd);
      listener.unbind();
    }
  }

  stop(): void {
    this.httpServer.close();
  }
}
