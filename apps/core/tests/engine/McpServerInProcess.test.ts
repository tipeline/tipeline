import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = (name: string) =>
  JSON.stringify({ name, description: `${name} report`, pipeline: { variables: [], actions: [] } });

const tasks = [
  { identifier: 'sales-report', name: 'Sales report', source: source('Sales report') },
  { identifier: 'secret-sales', name: 'Secret sales report', source: source('Secret sales report') },
];

vi.mock('@database/services/TaskService', () => ({
  TaskService: {
    getAllWithSource: vi.fn(async () => tasks),
    getByIdentifier: vi.fn(async (id: string) => tasks.find((t) => t.identifier === id) ?? null),
  },
}));
vi.mock('@/hub/HubWorkflowCatalog', () => ({
  HubWorkflowCatalog: {
    uninstalledWorkflows: async () => ({ workflows: [], unreachableHubs: [] }),
    withInputs: async (workflows: unknown[]) => workflows,
  },
}));
vi.mock('@engine/Core', () => ({ default: { exec: vi.fn(async () => {}), draftCreate: vi.fn() } }));

import { TipelineMcpServer } from '@engine/McpServer';

let tools: TipelineMcpServer;

beforeEach(() => {
  // Port 0: the HTTP endpoint isn't what's tested here.
  tools = new TipelineMcpServer(0, 'token', () => {});
});
afterEach(() => tools.stop());

const identifiers = (text: string) => {
  const parsed = JSON.parse(text);
  return (Array.isArray(parsed) ? parsed : parsed.workflows).map((w: { identifier: string }) => w.identifier);
};

describe('Core tools called in process (for the Tipeline Server)', () => {
  it('lists the same tools as the MCP endpoint', async () => {
    const names = (await tools.listToolsInProcess()).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['search_workflows', 'list_tasks', 'exec_task', 'check_workflow']));
    const search = (await tools.listToolsInProcess()).find((t) => t.name === 'search_workflows');
    expect(search?.inputSchema).toMatchObject({ type: 'object', properties: { query: expect.anything() } });
  });

  it('search_workflows leaves out the workflows the caller may not see', async () => {
    const all = await tools.callToolInProcess('search_workflows', { query: 'sales' });
    expect(identifiers(all.text).sort()).toEqual(['sales-report', 'secret-sales']);

    const filtered = await tools.callToolInProcess('search_workflows', { query: 'sales' }, { exclude: new Set(['secret-sales']) });
    expect(filtered.isError).toBe(false);
    expect(identifiers(filtered.text)).toEqual(['sales-report']);
  });

  it('list_tasks leaves them out too', async () => {
    const result = await tools.callToolInProcess('list_tasks', {}, { exclude: new Set(['secret-sales']) });
    expect(identifiers(result.text)).toEqual(['sales-report']);
  });

  it('exec_task will not run a left-out workflow, and says it is not found', async () => {
    const result = await tools.callToolInProcess(
      'exec_task',
      { identifier: 'secret-sales', variables: {} },
      { exclude: new Set(['secret-sales']) }
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.text)).toMatchObject({ status: 'failed', error: 'Workflow not found: secret-sales' });
  });

  it('exec_task streams on the caller’s correlationId', async () => {
    const Core = (await import('@engine/Core')).default;
    await tools.callToolInProcess('exec_task', { identifier: 'sales-report' }, { runCorrelationId: 'assistant-run-1' });
    expect(vi.mocked(Core.exec).mock.calls[0][1]).toBe('assistant-run-1');
  });
});
