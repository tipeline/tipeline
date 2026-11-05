import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: {
    getByName: vi.fn(),
  },
}));

vi.mock('@action/ActionFactory', () => ({
  ActionFactory: {
    create: vi.fn(),
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});

vi.mock('dotenv', () => ({
  default: {
    parse: vi.fn(),
  },
}));

import { Task } from '@task/Task';
import { Variable } from '@variable/Variable';
import { GlobalVariableService } from '@database/services/GlobalVariableService';
import { ActionFactory } from '@action/ActionFactory';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import dotenv from 'dotenv';

function makeTaskWithVariables(variables: Variable[]): Task {
  const task = new Task();
  task.getPipeline().setVariables(variables);
  return task;
}

describe('Task', () => {
  beforeEach(() => {
    vi.mocked(GlobalVariableService.getByName).mockReset();
    vi.mocked(ActionFactory.create).mockReset();
    delete process.env.TIPELINE_TEST_ENV_KEY;
    delete process.env.TIPELINE_TEST_ENV_KEY_MISSING;
  });

  afterEach(() => {
    delete process.env.TIPELINE_TEST_ENV_KEY;
    delete process.env.TIPELINE_TEST_ENV_KEY_MISSING;
    vi.restoreAllMocks();
  });

  describe('loadVariables / createVariables', () => {
    describe('valueFromEnv', () => {
      it('sets scope to "env" and reads process.env[key]', async () => {
        process.env.TIPELINE_TEST_ENV_KEY = 'from-process-env';
        const task = new Task();

        const variables = await task.createVariables([
          { type: 'string', name: 'myVar', valueFromEnv: 'TIPELINE_TEST_ENV_KEY' },
        ]);

        expect(variables).toHaveLength(1);
        expect(variables[0].getScope()).toBe('env');
        expect(variables[0].getValue()).toBe('from-process-env');
      });

      it('a preset value takes precedence over the environment value (no overwrite when value is already set)', async () => {
        process.env.TIPELINE_TEST_ENV_KEY = 'from-process-env';
        const task = new Task();

        const variables = await task.createVariables([
          {
            type: 'string',
            name: 'myVar',
            value: 'explicit-value',
            valueFromEnv: 'TIPELINE_TEST_ENV_KEY',
          },
        ]);

        expect(variables[0].getScope()).toBe('env');
        expect(variables[0].getValue()).toBe('explicit-value');
      });

      it('falls back to null (not empty string) when process.env has no value for the key', async () => {
        const task = new Task();

        // Uses a complex type (no built-in default value) so Variable's own
        // default-value substitution doesn't mask Task's null fallback behind
        // an empty string the way it would for a plain 'string' type.
        const variables = await task.createVariables([
          { type: 'dbConnection', name: 'myVar', required: false, valueFromEnv: 'TIPELINE_TEST_ENV_KEY_MISSING' },
        ]);

        expect(variables[0].getScope()).toBe('env');
        expect(variables[0].getValue()).toBeNull();
      });

      it('throws for a required variable when the env value is missing (null fallback correctly fails required checks)', async () => {
        const task = new Task();

        await expect(
          task.createVariables([
            {
              type: 'string',
              name: 'myVar',
              required: true,
              valueFromEnv: 'TIPELINE_TEST_ENV_KEY_MISSING',
            },
          ])
        ).rejects.toThrow(/is required but has no value/);
      });
    });

    describe('valueFromEnvFile', () => {
      it("prefers the env file's value over process.env when both are present", async () => {
        process.env.TIPELINE_TEST_ENV_KEY = 'from-process-env';
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('TIPELINE_TEST_ENV_KEY=from-file'));
        vi.mocked(dotenv.parse).mockReturnValue({ TIPELINE_TEST_ENV_KEY: 'from-file' });
        const task = new Task();

        const variables = await task.createVariables([
          {
            type: 'string',
            name: 'myVar',
            valueFromEnv: 'TIPELINE_TEST_ENV_KEY',
            valueFromEnvFile: './task.env',
          },
        ]);

        expect(variables[0].getValue()).toBe('from-file');
      });

      it('resolves a `~`-prefixed path against the home directory', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(''));
        vi.mocked(dotenv.parse).mockReturnValue({ TIPELINE_TEST_ENV_KEY: 'from-home-file' });
        const task = new Task();

        const variables = await task.createVariables([
          {
            type: 'string',
            name: 'myVar',
            valueFromEnv: 'TIPELINE_TEST_ENV_KEY',
            valueFromEnvFile: '~/custom.env',
          },
        ]);

        expect(fs.existsSync).toHaveBeenCalledWith(path.join(os.homedir(), 'custom.env'));
        expect(variables[0].getValue()).toBe('from-home-file');
      });

      it('falls back to process.env when the env file does not exist', async () => {
        process.env.TIPELINE_TEST_ENV_KEY = 'from-process-env';
        vi.mocked(fs.existsSync).mockReturnValue(false);
        const task = new Task();

        const variables = await task.createVariables([
          {
            type: 'string',
            name: 'myVar',
            valueFromEnv: 'TIPELINE_TEST_ENV_KEY',
            valueFromEnvFile: './missing.env',
          },
        ]);

        expect(variables[0].getValue()).toBe('from-process-env');
      });

      it('falls back to process.env when the key is absent from the parsed env file', async () => {
        process.env.TIPELINE_TEST_ENV_KEY = 'from-process-env';
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(''));
        vi.mocked(dotenv.parse).mockReturnValue({ SOME_OTHER_KEY: 'irrelevant' });
        const task = new Task();

        const variables = await task.createVariables([
          {
            type: 'string',
            name: 'myVar',
            valueFromEnv: 'TIPELINE_TEST_ENV_KEY',
            valueFromEnvFile: './task.env',
          },
        ]);

        expect(variables[0].getValue()).toBe('from-process-env');
      });

      it('falls back to process.env and does not throw when reading the env file errors', async () => {
        process.env.TIPELINE_TEST_ENV_KEY = 'from-process-env';
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation(() => {
          throw new Error('EACCES');
        });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const task = new Task();

        const variables = await task.createVariables([
          {
            type: 'string',
            name: 'myVar',
            valueFromEnv: 'TIPELINE_TEST_ENV_KEY',
            valueFromEnvFile: './task.env',
          },
        ]);

        expect(variables[0].getValue()).toBe('from-process-env');
        expect(console.warn).toHaveBeenCalled();
      });
    });

    describe('valueFromGlobal', () => {
      it('sets scope to "global" and calls GlobalVariableService.getByName', async () => {
        vi.mocked(GlobalVariableService.getByName).mockResolvedValue({ value: 'from-global' } as any);

        const task = new Task();
        const variables = await task.createVariables([
          { type: 'string', name: 'myVar', valueFromGlobal: 'someGlobalName' },
        ]);

        expect(GlobalVariableService.getByName).toHaveBeenCalledWith('someGlobalName');
        expect(variables[0].getScope()).toBe('global');
        expect(variables[0].getValue()).toBe('from-global');
      });

      it('a preset value takes precedence over the global record', async () => {
        const task = new Task();
        const variables = await task.createVariables([
          {
            type: 'string',
            name: 'myVar',
            value: 'explicit-value',
            valueFromGlobal: 'someGlobalName',
          },
        ]);

        expect(variables[0].getScope()).toBe('global');
        expect(variables[0].getValue()).toBe('explicit-value');
      });

      it('falls back to null when there is no global record', async () => {
        vi.mocked(GlobalVariableService.getByName).mockResolvedValue(null as any);

        const task = new Task();
        const variables = await task.createVariables([
          { type: 'dbConnection', name: 'myVar', required: false, valueFromGlobal: 'missingGlobal' },
        ]);

        expect(variables[0].getValue()).toBeNull();
      });

      it('propagates the Variable constructor error for a required variable when the global record is missing (null fallback correctly fails required checks)', async () => {
        vi.mocked(GlobalVariableService.getByName).mockResolvedValue(null as any);

        const task = new Task();

        await expect(
          task.createVariables([
            { type: 'string', name: 'myVar', required: true, valueFromGlobal: 'missingGlobal' },
          ])
        ).rejects.toThrow(/is required but has no value/);
      });
    });

    it('loadVariables assigns the created variables onto the pipeline', async () => {
      const task = new Task();
      await task.loadVariables([{ type: 'string', name: 'v1', value: 'a' }]);

      expect(task.getPipeline().getVariableByName('v1')?.getValue()).toBe('a');
    });
  });

  describe('updateVariablesFromProps', () => {
    it('updates an existing public variable via setValue', async () => {
      const variable = new Variable({ type: 'string', name: 'x', value: 'a', visibility: 'public' } as any);
      const task = makeTaskWithVariables([variable]);

      await task.updateVariablesFromProps({ x: 'b' });

      expect(variable.getValue()).toBe('b');
    });

    it('throws when the target variable is private', async () => {
      const variable = new Variable({
        type: 'string',
        name: 'x',
        value: 'a',
        visibility: 'private',
      } as any);
      const task = makeTaskWithVariables([variable]);

      await expect(task.updateVariablesFromProps({ x: 'b' })).rejects.toThrow(
        'Variable "x" is private and cannot be overridden by a parent workflow.'
      );
    });

    it('throws when the target variable is an output of the workflow', async () => {
      const variable = new Variable({
        type: 'string',
        name: 'summary',
        value: '',
        visibility: 'public',
        output: true,
      } as any);
      const task = makeTaskWithVariables([variable]);

      await expect(task.updateVariablesFromProps({ summary: 'b' })).rejects.toThrow(
        'Variable "summary" is an output of the workflow and cannot be set by a parent workflow.'
      );
    });

    it('no-ops for unknown variable names', async () => {
      const task = makeTaskWithVariables([]);

      await expect(task.updateVariablesFromProps({ unknown: 'z' })).resolves.toBeUndefined();
      expect(task.getPipeline().getVariables()).toHaveLength(0);
    });
  });

  describe('updateVariablesFromRecords', () => {
    it('JSON.parses record.value and updates an existing variable found by name', async () => {
      const variable = new Variable({ type: 'object', name: 'cfg', value: { a: 0 } } as any);
      const task = makeTaskWithVariables([variable]);

      await task.updateVariablesFromRecords([{ name: 'cfg', value: JSON.stringify({ a: 5 }) }]);

      expect(variable.getValue()).toEqual({ a: 5 });
    });

    it('falls back to the raw string when JSON.parse fails', async () => {
      const variable = new Variable({ type: 'string', name: 'note', value: 'old' } as any);
      const task = makeTaskWithVariables([variable]);

      await task.updateVariablesFromRecords([{ name: 'note', value: 'not-json-{' }]);

      expect(variable.getValue()).toBe('not-json-{');
    });

    it('constructs and appends a brand-new required Variable when no existing variable matches', async () => {
      const existing = new Variable({ type: 'string', name: 'existing', value: 'keep-me' } as any);
      const task = makeTaskWithVariables([existing]);

      await task.updateVariablesFromRecords([
        { name: 'newVar', value: JSON.stringify(42), type: 'number', scope: 'task' },
      ]);

      const variables = task.getPipeline().getVariables();
      expect(variables).toHaveLength(2);
      expect(variables[0]).toBe(existing);
      const created = task.getPipeline().getVariableByName('newVar')!;
      expect(created.getValue()).toBe(42);
      expect(created.isRequired()).toBe(true);
    });
  });

  describe('createActions', () => {
    beforeEach(() => {
      vi.mocked(ActionFactory.create).mockImplementation(async (raw: any) => ({ identifier: raw.name } as any));
    });

    it('allows elseIfConditional immediately after ifConditional', async () => {
      const task = new Task();
      const raw = [
        { name: 'ifConditional', group: 'flow' },
        { name: 'elseIfConditional', group: 'flow' },
      ];

      const actions = await task.createActions(raw);

      expect(actions).toHaveLength(2);
      expect(ActionFactory.create).toHaveBeenCalledTimes(2);
    });

    it('allows elseIfConditional immediately after another elseIfConditional', async () => {
      const task = new Task();
      const raw = [
        { name: 'ifConditional', group: 'flow' },
        { name: 'elseIfConditional', group: 'flow' },
        { name: 'elseIfConditional', group: 'flow' },
      ];

      await expect(task.createActions(raw)).resolves.toHaveLength(3);
    });

    it('throws when elseIfConditional is the very first action', async () => {
      const task = new Task();
      const raw = [{ name: 'elseIfConditional', group: 'flow' }];

      await expect(task.createActions(raw)).rejects.toThrow(
        'elseIfConditional needs to be after ifConditional or elseIfConditional'
      );
      expect(ActionFactory.create).not.toHaveBeenCalled();
    });

    it('throws when elseConditional does not immediately follow ifConditional/elseIfConditional', async () => {
      const task = new Task();
      const raw = [
        { name: 'somethingElse', group: 'flow' },
        { name: 'elseConditional', group: 'flow' },
      ];

      await expect(task.createActions(raw)).rejects.toThrow(
        'elseConditional needs to be after ifConditional or elseIfConditional'
      );
    });

    it('allows elseConditional immediately after ifConditional', async () => {
      const task = new Task();
      const raw = [
        { name: 'ifConditional', group: 'flow' },
        { name: 'elseConditional', group: 'flow' },
      ];

      await expect(task.createActions(raw)).resolves.toHaveLength(2);
    });

    it('throws when caseConditional does not immediately follow switchConditional/caseConditional', async () => {
      const task = new Task();
      const raw = [{ name: 'caseConditional', group: 'flow' }];

      await expect(task.createActions(raw)).rejects.toThrow(
        'caseConditional needs to be after switchConditional or caseConditional'
      );
    });

    it('allows caseConditional immediately after switchConditional', async () => {
      const task = new Task();
      const raw = [
        { name: 'switchConditional', group: 'flow' },
        { name: 'caseConditional', group: 'flow' },
      ];

      await expect(task.createActions(raw)).resolves.toHaveLength(2);
    });

    it('throws when defaultConditional does not immediately follow switchConditional/caseConditional', async () => {
      const task = new Task();
      const raw = [
        { name: 'somethingElse', group: 'flow' },
        { name: 'defaultConditional', group: 'flow' },
      ];

      await expect(task.createActions(raw)).rejects.toThrow(
        'defaultConditional needs to be after switchConditional or caseConditional'
      );
    });

    it('allows defaultConditional immediately after caseConditional', async () => {
      const task = new Task();
      const raw = [
        { name: 'switchConditional', group: 'flow' },
        { name: 'caseConditional', group: 'flow' },
        { name: 'defaultConditional', group: 'flow' },
      ];

      await expect(task.createActions(raw)).resolves.toHaveLength(3);
    });

    it('calls ActionFactory.create for each raw action in order on the happy path', async () => {
      const task = new Task();
      const raw = [
        { name: 'a', group: 'g' },
        { name: 'b', group: 'g' },
        { name: 'c', group: 'g' },
      ];

      const actions = await task.createActions(raw);

      expect(actions.map((a: any) => a.identifier)).toEqual(['a', 'b', 'c']);
      expect(ActionFactory.create).toHaveBeenNthCalledWith(1, raw[0]);
      expect(ActionFactory.create).toHaveBeenNthCalledWith(2, raw[1]);
      expect(ActionFactory.create).toHaveBeenNthCalledWith(3, raw[2]);
    });

    it('loadActions assigns the created actions onto the pipeline', async () => {
      const task = new Task();
      await task.loadActions([{ name: 'a', group: 'g' }]);

      expect((task.getPipeline() as any).actions).toHaveLength(1);
    });
  });

  describe('run / runClean / resume delegation', () => {
    it('run delegates to pipeline.run()', async () => {
      const task = new Task();
      const runSpy = vi.spyOn(task.getPipeline(), 'run').mockResolvedValue(undefined as any);

      await task.run();

      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it('runClean delegates to pipeline.runClean()', async () => {
      const task = new Task();
      const runCleanSpy = vi.spyOn(task.getPipeline(), 'runClean').mockResolvedValue(undefined as any);

      await task.runClean();

      expect(runCleanSpy).toHaveBeenCalledTimes(1);
    });

    it('resume delegates to pipeline.resume(id, identifier)', async () => {
      const task = new Task();
      const resumeSpy = vi.spyOn(task.getPipeline(), 'resume').mockResolvedValue(undefined as any);

      await task.resume(42, 'pipeline-identifier');

      expect(resumeSpy).toHaveBeenCalledWith(42, 'pipeline-identifier');
    });
  });
});
