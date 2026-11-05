import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

vi.mock('@utils/Parser', () => ({
  Parser: {
    importFromFile: vi.fn(),
  },
}));

vi.mock('@validation/TaskValidation', () => ({
  TaskValidator: {
    validateFormat: vi.fn(),
  },
}));

import { TaskFactory } from '@task/TaskFactory';
import dotenv from 'dotenv';
import { Parser } from '@utils/Parser';
import { TaskValidator } from '@validation/TaskValidation';
import * as path from 'path';
import * as os from 'os';

function makeFixture(overrides: any = {}) {
  return {
    name: 'Task Name',
    description: 'Task Description',
    pipeline: {
      variables: [],
      actions: [],
      ...overrides.pipeline,
    },
    ...overrides,
  };
}

describe('TaskFactory', () => {
  beforeEach(() => {
    vi.mocked(dotenv.config).mockReset();
    vi.mocked(Parser.importFromFile).mockReset();
    vi.mocked(TaskValidator.validateFormat).mockReset();
    // Identity by default — passes the parsed task straight through so tests can
    // assert on TaskFactory's own logic without depending on the real Zod schema.
    vi.mocked(TaskValidator.validateFormat).mockImplementation((t: any) => t);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fromFile', () => {
    it('resolves the given path, parses it, and sets filePath on the returned task', async () => {
      const fixture = makeFixture();
      vi.mocked(Parser.importFromFile).mockReturnValue(fixture);

      const task = await TaskFactory.fromFile('./tasks/example.yml', 'task-id-1', 'corr-1');

      const expectedAbsolute = path.resolve('./tasks/example.yml');
      expect(Parser.importFromFile).toHaveBeenCalledWith(expectedAbsolute);
      expect(task.getFilePath()).toBe(expectedAbsolute);
      expect(task.getName()).toBe('Task Name');
      expect(task.getIdentifier()).toBe('task-id-1');
      expect(task.getCorrelationId()).toBe('corr-1');
    });

    it('applies variableOverrides onto matching-by-name entries in pipeline.variables', async () => {
      const fixture = makeFixture({
        pipeline: {
          variables: [
            { name: 'foo', type: 'string', value: 'orig-foo' },
            { name: 'bar', type: 'string', value: 'orig-bar' },
          ],
          actions: [],
        },
      });
      vi.mocked(Parser.importFromFile).mockReturnValue(fixture);

      await TaskFactory.fromFile('./tasks/example.yml', 'id', 'corr', { foo: 'overridden-foo' });

      const passedToValidator = vi.mocked(TaskValidator.validateFormat).mock.calls[0][0] as any;
      expect(passedToValidator.pipeline.variables[0].value).toBe('overridden-foo');
      expect(passedToValidator.pipeline.variables[1].value).toBe('orig-bar');
    });

    it('does not touch pipeline.variables when variableOverrides is empty', async () => {
      const fixture = makeFixture({
        pipeline: {
          variables: [{ name: 'foo', type: 'string', value: 'orig-foo' }],
          actions: [],
        },
      });
      vi.mocked(Parser.importFromFile).mockReturnValue(fixture);

      await TaskFactory.fromFile('./tasks/example.yml', 'id', 'corr');

      const passedToValidator = vi.mocked(TaskValidator.validateFormat).mock.calls[0][0] as any;
      expect(passedToValidator.pipeline.variables[0].value).toBe('orig-foo');
    });

    it('does not throw when variables is not an array and overrides are given', async () => {
      const fixture = makeFixture({ pipeline: { variables: undefined, actions: [] } });
      vi.mocked(Parser.importFromFile).mockReturnValue(fixture);

      await expect(
        TaskFactory.fromFile('./tasks/example.yml', 'id', 'corr', { foo: 'x' })
      ).resolves.toBeDefined();
    });

    it('loads the task-dir .env before the home-dir .env, in order', async () => {
      const fixture = makeFixture();
      vi.mocked(Parser.importFromFile).mockReturnValue(fixture);

      await TaskFactory.fromFile('./tasks/nested/example.yml', 'id', 'corr');

      const expectedTaskDir = path.dirname(path.resolve('./tasks/nested/example.yml'));
      expect(dotenv.config).toHaveBeenNthCalledWith(1, { path: path.join(expectedTaskDir, '.env') });
      expect(dotenv.config).toHaveBeenNthCalledWith(2, {
        path: path.join(os.homedir(), 'Tipeline', '.env'),
      });
      expect(dotenv.config).toHaveBeenCalledTimes(2);
    });
  });

  describe('fromSource', () => {
    it('skips the taskDir-scoped env file and only loads the home-dir one', async () => {
      const fixture = makeFixture();

      await TaskFactory.fromSource(fixture, 'id', 'corr');

      expect(dotenv.config).toHaveBeenCalledTimes(1);
      expect(dotenv.config).toHaveBeenCalledWith({ path: path.join(os.homedir(), 'Tipeline', '.env') });
    });

    it('delegates to the same createTask path as fromFile (validates + builds a Task)', async () => {
      const fixture = makeFixture({ name: 'Source Task' });

      const task = await TaskFactory.fromSource(fixture, 'source-id', 'corr-source');

      expect(TaskValidator.validateFormat).toHaveBeenCalledWith(fixture);
      expect(task.getName()).toBe('Source Task');
      expect(task.getIdentifier()).toBe('source-id');
      expect(task.getCorrelationId()).toBe('corr-source');
      // fromSource never calls Parser.importFromFile — the source is passed directly.
      expect(Parser.importFromFile).not.toHaveBeenCalled();
    });
  });
});
