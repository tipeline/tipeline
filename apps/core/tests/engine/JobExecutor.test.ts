import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@task/TaskFactory.js', () => ({ TaskFactory: { fromSource: vi.fn() } }));
vi.mock('@database/services/TaskService.js', () => ({ TaskService: { getByIdentifier: vi.fn() } }));
vi.mock('@database/services/PipelineService.js', () => ({ PipelineService: {} }));
vi.mock('@database/services/PipelineVariableService.js', () => ({ PipelineVariableService: {} }));

import { executeJob } from '@engine/worker/JobExecutor';
import { TaskFactory } from '@task/TaskFactory.js';
import { TaskService } from '@database/services/TaskService.js';

function fakeTask() {
  return {
    setId: vi.fn(),
    setShouldSave: vi.fn(),
    setCallStack: vi.fn(),
    setRequestedOutputs: vi.fn(),
    setTrigger: vi.fn(),
    setParentRun: vi.fn(),
    setCacheMode: vi.fn(),
    run: vi.fn(),
    runClean: vi.fn(),
  };
}

describe('executeJob — exec', () => {
  let task: ReturnType<typeof fakeTask>;

  beforeEach(() => {
    task = fakeTask();
    vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
      id: 3,
      source: '{"pipeline":{"variables":[]}}',
    } as any);
    vi.mocked(TaskFactory.fromSource).mockResolvedValue(task as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('persists by default and requests no outputs', async () => {
    await executeJob({ type: 'exec', correlationId: 'c', identifier: 't' });

    expect(task.setShouldSave).toHaveBeenCalledWith(true);
    expect(task.setRequestedOutputs).toHaveBeenCalledWith(null);
    expect(task.run).toHaveBeenCalled();
    expect(task.runClean).not.toHaveBeenCalled();
  });

  it('ephemeral jobs run clean (no pipeline record) and pass the requested outputs', async () => {
    await executeJob({
      type: 'exec',
      correlationId: 'c',
      identifier: 't',
      ephemeral: true,
      outputs: ['rows'],
    });

    expect(task.setShouldSave).toHaveBeenCalledWith(false);
    expect(task.setRequestedOutputs).toHaveBeenCalledWith(['rows']);
    expect(task.runClean).toHaveBeenCalled();
    expect(task.run).not.toHaveBeenCalled();
  });

  it('passes the trigger on to the task', async () => {
    const trigger = {
      type: 'app' as const,
      appIdentifier: 'a',
      appName: 'A',
      pageId: 'p',
      runnable: 'r',
    };
    await executeJob({ type: 'exec', correlationId: 'c', identifier: 't', trigger });
    expect(task.setTrigger).toHaveBeenCalledWith(trigger);
  });

  it('passes the calling run and step on to the task (an async sub-workflow)', async () => {
    const parent = {
      pipelineIdentifier: 'parent-run',
      taskIdentifier: 'sync',
      taskName: 'Nightly sync',
      stepIdentifier: 'step-3',
    };
    await executeJob({ type: 'exec', correlationId: 'c', identifier: 't', parent });
    expect(task.setParentRun).toHaveBeenCalledWith(parent);
  });

  it('shouldSave: false alone keeps the existing run() path', async () => {
    await executeJob({ type: 'exec', correlationId: 'c', identifier: 't', shouldSave: false });

    expect(task.setShouldSave).toHaveBeenCalledWith(false);
    expect(task.run).toHaveBeenCalled();
  });
});
