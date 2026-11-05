import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/PipelineService', () => ({
  PipelineService: { getByIdentifierWithActions: vi.fn(), getChildRuns: vi.fn(async () => []) },
}));

vi.mock('@database/services/PipelineVariableService', () => ({
  PipelineVariableService: { getByPipelineId: vi.fn() },
}));

vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: { getAll: vi.fn() },
}));

import Core from '@engine/Core';
import { PipelineService } from '@database/services/PipelineService';
import { PipelineVariableService } from '@database/services/PipelineVariableService';
import { GlobalVariableService } from '@database/services/GlobalVariableService';

function pipeline(variables: any[]) {
  return {
    id: 7,
    identifier: 'pipe-7',
    status: 'completed',
    actions: [{ identifier: 'a1' }],
    source: JSON.stringify({ pipeline: { variables, actions: [] } }),
  };
}

function row(name: string, value: any, scope = 'task', type: string | null = 'string') {
  return { pipeline_id: 7, name, value: JSON.stringify(value), type, scope };
}

describe('Core.pipelineDetail — variables', () => {
  beforeEach(() => {
    vi.mocked(GlobalVariableService.getAll).mockResolvedValue([
      { name: 'apiToken', secret: true },
      { name: 'companyName', secret: false },
    ] as any);
  });

  it('returns null for an unknown run without reading variables', async () => {
    vi.mocked(PipelineService.getByIdentifierWithActions).mockResolvedValue(null as any);
    vi.mocked(PipelineVariableService.getByPipelineId).mockReset();

    expect(await Core.pipelineDetail('missing')).toBeNull();
    expect(PipelineVariableService.getByPipelineId).not.toHaveBeenCalled();
  });

  it('adds each variable with its parsed final value next to the steps', async () => {
    vi.mocked(PipelineService.getByIdentifierWithActions).mockResolvedValue(
      pipeline([
        { name: 'total', type: 'number' },
        { name: 'items', type: 'array' },
      ]) as any
    );
    vi.mocked(PipelineVariableService.getByPipelineId).mockResolvedValue([
      row('total', 42, 'task', 'number'),
      row('items', [{ id: 1 }], 'task', 'array'),
    ] as any);

    const result: any = await Core.pipelineDetail('pipe-7');

    expect(PipelineVariableService.getByPipelineId).toHaveBeenCalledWith(7);
    expect(result.actions).toEqual([{ identifier: 'a1' }]);
    expect(result.variables).toEqual([
      { name: 'total', value: 42, type: 'number', scope: 'task', hidden: false },
      { name: 'items', value: [{ id: 1 }], type: 'array', scope: 'task', hidden: false },
    ]);
  });

  it('lists the runs its sub-workflow steps started', async () => {
    vi.mocked(PipelineService.getByIdentifierWithActions).mockResolvedValue(pipeline([]) as any);
    vi.mocked(PipelineVariableService.getByPipelineId).mockResolvedValue([]);
    const child = { identifier: 'child-1', status: 'failed', stepIdentifier: 'a1' };
    vi.mocked(PipelineService.getChildRuns).mockResolvedValueOnce([child] as any);

    const result: any = await Core.pipelineDetail('pipe-7');

    expect(PipelineService.getChildRuns).toHaveBeenCalledWith('pipe-7');
    expect(result.children).toEqual([child]);
  });

  it('keeps the name but never the value of secret, secret-global and env variables', async () => {
    vi.mocked(PipelineService.getByIdentifierWithActions).mockResolvedValue(
      pipeline([
        { name: 'password', type: 'string', secret: true },
        { name: 'token', type: 'string', valueFromGlobal: 'apiToken' },
        { name: 'company', type: 'string', valueFromGlobal: 'companyName' },
        { name: 'dbUrl', type: 'string', valueFromEnv: 'DB_URL' },
      ]) as any
    );
    vi.mocked(PipelineVariableService.getByPipelineId).mockResolvedValue([
      row('password', 'hunter2'),
      row('token', 'sk-live-123', 'global'),
      row('company', 'Acme', 'global'),
      row('dbUrl', 'postgres://u:p@host/db', 'env'),
    ] as any);

    const result: any = await Core.pipelineDetail('pipe-7');
    const byName = Object.fromEntries(result.variables.map((v: any) => [v.name, v]));

    expect(byName.password).toMatchObject({ value: null, hidden: true });
    expect(byName.token).toMatchObject({ value: null, hidden: true });
    expect(byName.dbUrl).toMatchObject({ value: null, hidden: true });
    expect(byName.company).toMatchObject({ value: 'Acme', hidden: false });
    expect(JSON.stringify(result.variables)).not.toMatch(/hunter2|sk-live|postgres/);
  });

  it('falls back to the raw text when a stored value is not JSON', async () => {
    vi.mocked(PipelineService.getByIdentifierWithActions).mockResolvedValue(pipeline([]) as any);
    vi.mocked(PipelineVariableService.getByPipelineId).mockResolvedValue([
      { pipeline_id: 7, name: 'legacy', value: 'not json', type: null, scope: 'task' },
    ] as any);

    const result: any = await Core.pipelineDetail('pipe-7');

    expect(result.variables).toEqual([
      { name: 'legacy', value: 'not json', type: null, scope: 'task', hidden: false },
    ]);
  });
});
