import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/TaskService', () => ({
  TaskService: { getByIdentifier: vi.fn() },
}));

vi.mock('@database/services/PipelineService', () => ({
  PipelineService: { getFilteredByTask: vi.fn() },
}));

vi.mock('@database/services/PipelineVariableService', () => ({
  PipelineVariableService: { getByPipelineIds: vi.fn() },
}));

vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: { getAll: vi.fn() },
}));

import Core from '@engine/Core';
import { TaskService } from '@database/services/TaskService';
import { PipelineService } from '@database/services/PipelineService';
import { PipelineVariableService } from '@database/services/PipelineVariableService';
import { GlobalVariableService } from '@database/services/GlobalVariableService';

function pipeline(id: number, variables: any[]) {
  return {
    id,
    identifier: `pipe-${id}`,
    started_at: '2026-10-01T00:00:00.000Z',
    source: JSON.stringify({ pipeline: { variables, actions: [] } }),
  };
}

function row(pipelineId: number, name: string, value: any, scope = 'task') {
  return { pipeline_id: pipelineId, name, value: JSON.stringify(value), type: 'string', scope };
}

const fetchVariables = () =>
  Core.tableDataFetch({ taskIdentifier: 'task-1', sourceType: 'variables', filterMode: 'latest' });

describe('Core.tableDataFetch — variables source', () => {
  beforeEach(() => {
    vi.mocked(TaskService.getByIdentifier).mockResolvedValue({ id: 1 } as any);
    vi.mocked(GlobalVariableService.getAll).mockResolvedValue([
      { name: 'apiToken', secret: true },
      { name: 'companyName', secret: false },
    ] as any);
  });

  it('never returns variables declared secret in the workflow', async () => {
    vi.mocked(PipelineService.getFilteredByTask).mockResolvedValue([
      pipeline(1, [
        { name: 'password', type: 'string', secret: true },
        { name: 'total', type: 'number' },
      ]),
    ] as any);
    vi.mocked(PipelineVariableService.getByPipelineIds).mockResolvedValue([
      row(1, 'password', 'hunter2'),
      row(1, 'total', 42),
    ] as any);

    const result = await fetchVariables();

    expect(result.map((r: any) => r.name)).toEqual(['total']);
  });

  it('never returns env-sourced variables', async () => {
    vi.mocked(PipelineService.getFilteredByTask).mockResolvedValue([
      pipeline(1, [{ name: 'dbUrl', type: 'string', valueFromEnv: 'DB_URL' }]),
    ] as any);
    vi.mocked(PipelineVariableService.getByPipelineIds).mockResolvedValue([
      row(1, 'dbUrl', 'postgres://u:p@host/db', 'env'),
    ] as any);

    expect(await fetchVariables()).toEqual([]);
  });

  it('hides variables sourced from a secret global but keeps ones from a non-secret global', async () => {
    vi.mocked(PipelineService.getFilteredByTask).mockResolvedValue([
      pipeline(1, [
        { name: 'token', type: 'string', valueFromGlobal: 'apiToken' },
        { name: 'company', type: 'string', valueFromGlobal: 'companyName' },
      ]),
    ] as any);
    vi.mocked(PipelineVariableService.getByPipelineIds).mockResolvedValue([
      row(1, 'token', 'sk-live-123', 'global'),
      row(1, 'company', 'Acme', 'global'),
    ] as any);

    const result = await fetchVariables();

    expect(result.map((r: any) => r.name)).toEqual(['company']);
  });

  it('judges each pipeline by its own source snapshot', async () => {
    // `note` was made secret only in the later run's version of the workflow.
    vi.mocked(PipelineService.getFilteredByTask).mockResolvedValue([
      pipeline(2, [{ name: 'note', type: 'string', secret: true }]),
      pipeline(1, [{ name: 'note', type: 'string' }]),
    ] as any);
    vi.mocked(PipelineVariableService.getByPipelineIds).mockResolvedValue([
      row(2, 'note', 'secret now'),
      row(1, 'note', 'public then'),
    ] as any);

    const result = await Core.tableDataFetch({
      taskIdentifier: 'task-1',
      sourceType: 'variables',
      filterMode: 'range',
      count: 2,
    });

    expect(result).toEqual([
      expect.objectContaining({ pipeline_identifier: 'pipe-1', value: 'public then' }),
    ]);
  });
});
