import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('@database/services/ScheduleService', () => ({ ScheduleService: {} }));
vi.mock('@database/services/PipelineService', () => ({
  PipelineService: { failAbandoned: vi.fn(async () => []) },
}));

import { BreeRunner } from '@engine/runner/BreeRunner';
import { PipelineService } from '@database/services/PipelineService';

/** A runner with one worker thread "created" for job `job-<correlationId>`. */
function withWorker(correlationId: string) {
  const runner = new BreeRunner();
  const bree = (runner as any).bree;
  const worker = Object.assign(new EventEmitter(), {
    postMessage: vi.fn(),
    terminate: vi.fn(),
  });
  bree.workers.set(`job-${correlationId}`, worker);
  bree.emit('worker created', `job-${correlationId}`);
  return { runner, bree, worker };
}

describe('BreeRunner cancel', () => {
  it('forwards a cancel (with who asked) to the job worker thread', () => {
    const { runner, worker } = withWorker('c-1');

    expect(runner.cancel('c-1', 'ana')).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'run:cancel',
      data: { canceledBy: 'ana' },
    });
  });

  it('finds the job running a run, or one of its sync sub-workflows', () => {
    const { runner, worker } = withWorker('c-1');
    worker.emit('message', { type: 'taskStart', data: { pipelineIdentifier: 'p-parent' } });
    worker.emit('message', { type: 'taskStart', data: { pipelineIdentifier: 'p-child' } });

    expect(runner.findJob('p-parent')).toBe('c-1');
    expect(runner.findJob('p-child')).toBe('c-1');
    expect(runner.findJob('p-other')).toBeNull();
  });

  it('forgets a job once its worker is gone', () => {
    const { runner, bree, worker } = withWorker('c-1');
    worker.emit('message', { type: 'taskStart', data: { pipelineIdentifier: 'p-1' } });
    bree.emit('worker deleted', 'job-c-1');

    expect(runner.findJob('p-1')).toBeNull();
    expect(runner.cancel('c-1', '')).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('ends runs its crashed worker left running, and the job fails', async () => {
    const { runner, bree, worker } = withWorker('c-2');
    vi.mocked(PipelineService.failAbandoned).mockResolvedValueOnce(['p-1']);
    const settled = new Promise((resolve, reject) =>
      (runner as any).pending.set('job-c-2', { resolve, reject })
    );
    worker.emit('message', { type: 'taskStart', data: { pipelineIdentifier: 'p-1' } });
    // An uncaught error in a step: the thread dies without an 'error' message.
    worker.emit('error', new Error('listen EADDRINUSE: address already in use :::3000'));
    bree.emit('worker deleted', 'job-c-2');

    await expect(settled).rejects.toThrow('EADDRINUSE');
    expect(PipelineService.failAbandoned).toHaveBeenCalledWith(
      ['p-1'],
      'The run stopped unexpectedly: listen EADDRINUSE: address already in use :::3000'
    );
  });

  it('a job whose runs all ended still finishes normally', async () => {
    const { runner, bree, worker } = withWorker('c-3');
    const settled = new Promise((resolve, reject) =>
      (runner as any).pending.set('job-c-3', { resolve, reject })
    );
    worker.emit('message', { type: 'taskStart', data: { pipelineIdentifier: 'p-2' } });
    bree.emit('worker deleted', 'job-c-3');

    await expect(settled).resolves.toBeUndefined();
  });

  describe('stop', () => {
    const endsOnTerminate = (bree: any, worker: any, name: string) =>
      worker.terminate.mockImplementation(() => bree.workers.delete(name));

    it('waits for a running job by default, without canceling it', async () => {
      const { runner, bree, worker } = withWorker('c-1');
      let stopped = false;
      const stop = runner.stop().then(() => (stopped = true));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(stopped).toBe(false);
      expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'run:cancel' }));

      bree.workers.delete('job-c-1');
      await stop;
    });

    it('when interrupting, cancels the job and ends it if it ignores that', async () => {
      vi.useFakeTimers();
      const { runner, bree, worker } = withWorker('c-1');
      endsOnTerminate(bree, worker, 'job-c-1');

      const stop = runner.stop({ interrupt: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'run:cancel', data: { canceledBy: 'Tipeline' } });
      expect(worker.terminate).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);
      expect(worker.terminate).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(100);
      await stop;
      vi.useRealTimers();
    });

    it('when interrupting, does not end a job that stopped once canceled', async () => {
      const { runner, bree, worker } = withWorker('c-1');
      worker.postMessage.mockImplementation((msg: any) => {
        if (msg.type === 'run:cancel') bree.workers.delete('job-c-1');
      });

      await runner.stop({ interrupt: true });

      expect(worker.terminate).not.toHaveBeenCalled();
    });
  });

  it('counts running jobs, including ones with no run record', () => {
    const { runner } = withWorker('c-1');
    expect(runner.activeJobs()).toBe(1);
  });
});
