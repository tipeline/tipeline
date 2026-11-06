import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// GroupSubtask.exec's identifier-path calls TaskService.getByIdentifier (real DB lookup)
// and then Task.run() (which unconditionally persists a pipeline record via more DB
// services). The file-path branch resolves a child task through TaskFactory.fromFile.
// Both are mocked at the module boundary so this suite never touches the real
// ~/.tipeline/.database/tipeline.db or the real filesystem — we're testing GroupSubtask's
// own orchestration logic (circular-call detection, props/outputs propagation, error
// handling), not the full nested Task/Pipeline execution engine.
vi.mock('@database/services/TaskService', () => ({
  TaskService: {
    getByIdentifier: vi.fn(),
  },
}));

vi.mock('@task/TaskFactory', () => ({
  TaskFactory: {
    fromSource: vi.fn(),
    fromFile: vi.fn(),
  },
}));

import { GroupSubtask } from '@/action/actions/subtask/actions';
import { TaskService } from '@database/services/TaskService';
import { TaskFactory } from '@task/TaskFactory';
import { Task } from '@task/Task';
import { Variable } from '@variable/Variable';

/** Builds a lightweight fake child Task exposing only what GroupSubtask.exec invokes on it. */
function createFakeChildTask(options: { variables?: Variable[] } = {}) {
  const variables = options.variables ?? [];
  const pipeline = {
    getIdentifier: () => 'child-pipeline-identifier',
    getVariableByName: (name: string) => variables.find((v) => v.getName() === name),
  };

  return {
    setId: vi.fn(),
    setShouldSave: vi.fn(),
    setCallStack: vi.fn(),
    setAwaitedByParent: vi.fn(),
    setCacheMode: vi.fn(),
    setParentRun: vi.fn(),
    updateVariablesFromProps: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    runClean: vi.fn(async () => {}),
    getPipeline: () => pipeline,
  };
}

/** Builds a real, lightweight parent Task instance (construction alone touches no DB/FS). */
function createParentTask(options: { variables?: Variable[]; callStack?: string[] } = {}) {
  const task = new Task();
  task.setCorrelationId('corr-1');
  task.setIdentifier('parent-task');
  task.setShouldSave(false);
  task.setCallStack(options.callStack ?? []);
  if (options.variables) {
    task.getPipeline().setVariables(options.variables);
  }
  return task;
}

describe('GroupSubtask', () => {
  beforeEach(() => {
    vi.mocked(TaskService.getByIdentifier).mockReset();
    vi.mocked(TaskFactory.fromSource).mockReset();
    vi.mocked(TaskFactory.fromFile).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exec — identifier-based subtasks', () => {
    it('runs the child task and returns identifier info on success', async () => {
      const childTask = createFakeChildTask();
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
        id: 7,
        source: JSON.stringify({ name: 'child', pipeline: { actions: [] } }),
      } as any);
      vi.mocked(TaskFactory.fromSource).mockResolvedValue(childTask as any);

      const parent = createParentTask();
      const result = await GroupSubtask.exec({ identifier: 'generate-report' } as any, parent);

      expect(result).toEqual({
        taskIdentifier: 'generate-report',
        pipelineIdentifier: 'child-pipeline-identifier',
      });
      expect(childTask.setId).toHaveBeenCalledWith(7);
      expect(childTask.setCallStack).toHaveBeenCalledWith(['generate-report']);
      // its parent waits for it, so it may not stop for an approval
      expect(childTask.setAwaitedByParent).toHaveBeenCalledWith(true);
      expect(childTask.run).toHaveBeenCalledTimes(1);
      expect(childTask.runClean).not.toHaveBeenCalled();
    });

    it('links the child run to the run and step that started it', async () => {
      const childTask = createFakeChildTask();
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
        id: 7,
        source: JSON.stringify({ name: 'child', pipeline: { actions: [] } }),
      } as any);
      vi.mocked(TaskFactory.fromSource).mockResolvedValue(childTask as any);

      const parent = createParentTask();
      parent.setName('Nightly sync');
      // A saved run has an identifier once Pipeline.run has started it.
      (parent.getPipeline() as any).identifier = 'parent-run';
      await GroupSubtask.exec({ identifier: 'generate-report' } as any, parent, null, {
        identifier: 'step-3',
      });

      expect(childTask.setParentRun).toHaveBeenCalledWith({
        pipelineIdentifier: 'parent-run',
        taskIdentifier: 'parent-task',
        taskName: 'Nightly sync',
        stepIdentifier: 'step-3',
      });
    });

    it('sets no parent link when the parent run is not saved', async () => {
      const childTask = createFakeChildTask();
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
        id: 7,
        source: JSON.stringify({ name: 'child', pipeline: { actions: [] } }),
      } as any);
      vi.mocked(TaskFactory.fromSource).mockResolvedValue(childTask as any);

      await GroupSubtask.exec({ identifier: 'generate-report' } as any, createParentTask(), null, {
        identifier: 'step-3',
      });

      expect(childTask.setParentRun).toHaveBeenCalledWith(null);
    });

    it('throws when the identifier is not found in the database', async () => {
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue(undefined);

      const parent = createParentTask();
      await expect(
        GroupSubtask.exec({ identifier: 'missing-task' } as any, parent)
      ).rejects.toThrow('Sub-workflow not found: identifier "missing-task"');
    });

    it('throws a circular-subtask error without querying the database when the identifier is already in the call stack', async () => {
      const parent = createParentTask({ callStack: ['outer', 'generate-report'] });

      await expect(
        GroupSubtask.exec({ identifier: 'generate-report' } as any, parent)
      ).rejects.toThrow(/Circular sub-workflow detected/);
      expect(TaskService.getByIdentifier).not.toHaveBeenCalled();
    });

    it('injects resolved props into the child task before running it', async () => {
      const childTask = createFakeChildTask();
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
        id: 1,
        source: JSON.stringify({ name: 'child', pipeline: { actions: [] } }),
      } as any);
      vi.mocked(TaskFactory.fromSource).mockResolvedValue(childTask as any);

      const invoiceIdVar = new Variable({
        type: 'string',
        name: 'invoiceId',
        value: 'INV-42',
        scope: 'task',
      });
      const parent = createParentTask({ variables: [invoiceIdVar] });

      await GroupSubtask.exec(
        { identifier: 'generate-report', props: { invoiceId: '{= invoiceId =}' } } as any,
        parent
      );

      expect(childTask.updateVariablesFromProps).toHaveBeenCalledWith({ invoiceId: 'INV-42' });
    });

    it('propagates named outputs from the child pipeline back to the parent', async () => {
      const childReportVar = new Variable({
        type: 'string',
        name: 'reportPath',
        value: '/tmp/report.pdf',
        scope: 'task',
        visibility: 'public',
      });
      const childTask = createFakeChildTask({ variables: [childReportVar] });
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
        id: 1,
        source: JSON.stringify({ name: 'child', pipeline: { actions: [] } }),
      } as any);
      vi.mocked(TaskFactory.fromSource).mockResolvedValue(childTask as any);

      const parentReportVar = new Variable({
        type: 'string',
        name: 'parentReportPath',
        value: '',
        scope: 'task',
      });
      const parent = createParentTask({ variables: [parentReportVar] });

      await GroupSubtask.exec(
        {
          identifier: 'generate-report',
          outputs: { parentReportPath: 'reportPath' },
        } as any,
        parent
      );

      expect(parentReportVar.getValue()).toBe('/tmp/report.pdf');
    });

    it('throws when propagating an output that is marked private on the child', async () => {
      const privateVar = new Variable({
        type: 'string',
        name: 'secretValue',
        value: 'shh',
        scope: 'task',
        visibility: 'private',
      } as any);
      const childTask = createFakeChildTask({ variables: [privateVar] });
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
        id: 1,
        source: JSON.stringify({ name: 'child', pipeline: { actions: [] } }),
      } as any);
      vi.mocked(TaskFactory.fromSource).mockResolvedValue(childTask as any);

      const parentVar = new Variable({ type: 'string', name: 'localValue', value: '', scope: 'task' });
      const parent = createParentTask({ variables: [parentVar] });

      await expect(
        GroupSubtask.exec(
          { identifier: 'generate-report', outputs: { localValue: 'secretValue' } } as any,
          parent
        )
      ).rejects.toThrow('Variable "secretValue" is private and cannot be read by a parent workflow.');
    });
  });

  describe('exec — outputs with nowhere to go', () => {
    it('stops before running the child when the parent variable does not exist', async () => {
      const parent = createParentTask();

      await expect(
        GroupSubtask.exec(
          { identifier: 'generate-report', outputs: { missing: 'reportPath' } } as any,
          parent
        )
      ).rejects.toThrow('outputs variable "missing" does not exist');
      expect(TaskService.getByIdentifier).not.toHaveBeenCalled();
    });

    it('throws when the child has no variable with that name', async () => {
      const childTask = createFakeChildTask({ variables: [] });
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue({
        id: 1,
        source: JSON.stringify({ name: 'child', pipeline: { actions: [] } }),
      } as any);
      vi.mocked(TaskFactory.fromSource).mockResolvedValue(childTask as any);
      const parentVar = new Variable({ type: 'string', name: 'local', value: '', scope: 'task' });
      const parent = createParentTask({ variables: [parentVar] });

      await expect(
        GroupSubtask.exec(
          { identifier: 'generate-report', outputs: { local: 'reportPath' } } as any,
          parent
        )
      ).rejects.toThrow('has no variable "reportPath"');
    });
  });

  describe('exec — file-based subtasks', () => {
    it('runs the child task via runClean and returns true on success', async () => {
      const childTask = createFakeChildTask();
      vi.mocked(TaskFactory.fromFile).mockResolvedValue(childTask as any);

      const parent = createParentTask();
      parent.setFilePath('/workdir/parent.yml');

      const result = await GroupSubtask.exec({ path: './helpers/normalize.yml' } as any, parent);

      expect(result).toBe(true);
      expect(childTask.runClean).toHaveBeenCalledTimes(1);
      expect(childTask.run).not.toHaveBeenCalled();
      expect(TaskFactory.fromFile).toHaveBeenCalledWith(
        '/workdir/helpers/normalize.yml',
        expect.any(String),
        'corr-1'
      );
    });

    it('resolves an absolute path as-is', async () => {
      const childTask = createFakeChildTask();
      vi.mocked(TaskFactory.fromFile).mockResolvedValue(childTask as any);

      const parent = createParentTask();
      await GroupSubtask.exec({ path: '/absolute/subtask.yml' } as any, parent);

      expect(TaskFactory.fromFile).toHaveBeenCalledWith(
        '/absolute/subtask.yml',
        expect.any(String),
        'corr-1'
      );
    });

    it('throws a circular-subtask error when the resolved path is already in the call stack', async () => {
      const parent = createParentTask({ callStack: ['/absolute/subtask.yml'] });

      await expect(
        GroupSubtask.exec({ path: '/absolute/subtask.yml' } as any, parent)
      ).rejects.toThrow(/Circular sub-workflow detected/);
      expect(TaskFactory.fromFile).not.toHaveBeenCalled();
    });
  });

  describe('exec — neither identifier nor path provided', () => {
    it('resolves to false and calls neither TaskService nor TaskFactory', async () => {
      const parent = createParentTask();
      const result = await GroupSubtask.exec({} as any, parent);

      expect(result).toBe(false);
      expect(TaskService.getByIdentifier).not.toHaveBeenCalled();
      expect(TaskFactory.fromSource).not.toHaveBeenCalled();
      expect(TaskFactory.fromFile).not.toHaveBeenCalled();
    });
  });

  describe('exec — validation errors', () => {
    it('throws when props is not an object', async () => {
      const parent = createParentTask();
      await expect(
        GroupSubtask.exec({ identifier: 'x', props: 'not-an-object' } as any, parent)
      ).rejects.toThrow();
    });

    it('throws when an outputs value is not a string', async () => {
      const parent = createParentTask();
      await expect(
        GroupSubtask.exec({ identifier: 'x', outputs: { local: 123 } } as any, parent)
      ).rejects.toThrow();
    });
  });
});
