import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/PipelineService', () => ({
  PipelineService: { getByIdentifier: vi.fn(), cancelIdle: vi.fn() },
}));
vi.mock('@engine/runner/JobRunnerFactory', () => ({ getJobRunner: vi.fn() }));
vi.mock('@database/services/TaskService', () => ({
  TaskService: { getById: vi.fn(async () => ({ identifier: 'wf-pay' })) },
}));

import Core from '@engine/Core';
import { PipelineService } from '@database/services/PipelineService';
import { getJobRunner } from '@engine/runner/JobRunnerFactory';

const runner = {
  cancel: vi.fn(),
  findJob: vi.fn(),
};

describe('Core.pipelineCancel', () => {
  beforeEach(() => {
    runner.cancel.mockReset().mockReturnValue(false);
    runner.findJob.mockReset().mockReturnValue(null);
    vi.mocked(getJobRunner).mockReturnValue(runner as any);
    vi.mocked(PipelineService.getByIdentifier).mockReset();
    vi.mocked(PipelineService.cancelIdle).mockReset();
  });

  it('asks the job running a run to stop, found by its pipelineIdentifier', async () => {
    runner.findJob.mockReturnValue('corr-1');
    runner.cancel.mockReturnValue(true);

    const result = await Core.pipelineCancel({ pipelineIdentifier: 'p-1', canceledBy: 'ana' });

    expect(result).toEqual({ status: 'canceling' });
    expect(runner.findJob).toHaveBeenCalledWith('p-1');
    expect(runner.cancel).toHaveBeenCalledWith('corr-1', 'ana');
    expect(PipelineService.getByIdentifier).not.toHaveBeenCalled();
  });

  it('cancels a run that does not persist by the correlationId of its request', async () => {
    runner.cancel.mockReturnValue(true);
    expect(await Core.pipelineCancel({ correlationId: 'corr-app' })).toEqual({
      status: 'canceling',
    });
    expect(runner.cancel).toHaveBeenCalledWith('corr-app', '');
  });

  it('ends a run waiting for an approval right away', async () => {
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue({
      id: 9,
      identifier: 'p-9',
      task_id: 4,
      status: 'paused',
    } as any);
    vi.mocked(PipelineService.cancelIdle).mockResolvedValue(true);

    expect(await Core.pipelineCancel({ pipelineIdentifier: 'p-9', canceledBy: 'ana' })).toEqual({
      status: 'canceled',
      pipelineIdentifier: 'p-9',
      taskIdentifier: 'wf-pay',
    });
    expect(PipelineService.cancelIdle).toHaveBeenCalledWith(9, ['paused'], {
      reason: 'user_canceled',
      message: 'Canceled by ana',
      canceledBy: 'ana',
    });
  });

  it('says not_running for a run that already ended, or lost a race with a decision', async () => {
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue({
      id: 9,
      status: 'completed',
    } as any);
    expect(await Core.pipelineCancel({ pipelineIdentifier: 'p-9' })).toEqual({
      status: 'not_running',
    });
    expect(PipelineService.cancelIdle).not.toHaveBeenCalled();

    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue({ id: 9, status: 'paused' } as any);
    vi.mocked(PipelineService.cancelIdle).mockResolvedValue(false);
    expect(await Core.pipelineCancel({ pipelineIdentifier: 'p-9' })).toEqual({
      status: 'not_running',
    });

    expect(await Core.pipelineCancel({ correlationId: 'gone' })).toEqual({
      status: 'not_running',
    });
  });

  it('fails for an unknown run, and on a runner that cannot cancel', async () => {
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue(undefined as any);
    await expect(Core.pipelineCancel({ pipelineIdentifier: 'nope' })).rejects.toThrow(
      'Run not found'
    );

    vi.mocked(getJobRunner).mockReturnValue({} as any);
    await expect(Core.pipelineCancel({ pipelineIdentifier: 'p-1' })).rejects.toThrow(
      'not supported'
    );
  });
});
