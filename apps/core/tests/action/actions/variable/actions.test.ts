import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/database/services/GlobalVariableService', () => ({
  GlobalVariableService: {
    getByName: vi.fn(),
    update: vi.fn(),
  },
}));

import { GroupVariable } from '@/action/actions/variable/actions';
import { Task } from '@task/Task';
import { Variable } from '@variable/Variable';
import { GlobalVariableService } from '@/database/services/GlobalVariableService';

function makeTaskWithVariables(variables: Variable[]): Task {
  const task = new Task();
  task.getPipeline().setVariables(variables);
  return task;
}

describe('GroupVariable', () => {
  describe('set (local pipeline variable)', () => {
    it('updates the value of an existing pipeline variable', async () => {
      const variable = new Variable({ type: 'string', name: 'greeting', value: 'Hi' } as any);
      const task = makeTaskWithVariables([variable]);

      const result = await GroupVariable.set({ name: 'greeting', value: 'Hello Tipeline' }, task);

      expect(result).toBe(true);
      expect(variable.getValue()).toBe('Hello Tipeline');
    });

    it('coerces the new value to the variable type', async () => {
      const variable = new Variable({ type: 'number', name: 'count', value: 1 } as any);
      const task = makeTaskWithVariables([variable]);

      await GroupVariable.set({ name: 'count', value: '42' as any }, task);

      expect(variable.getValue()).toBe(42);
    });

    it('throws when the named variable does not exist', async () => {
      const task = makeTaskWithVariables([]);

      await expect(GroupVariable.set({ name: 'missing', value: 'x' }, task)).rejects.toThrow(
        'Pipeline variable "missing" does not exist.'
      );
    });

    it('propagates the error when the variable is readonly', async () => {
      const variable = new Variable({
        type: 'string',
        name: 'locked',
        value: 'x',
        readonly: true,
      } as any);
      const task = makeTaskWithVariables([variable]);

      await expect(GroupVariable.set({ name: 'locked', value: 'y' }, task)).rejects.toThrow(
        'Variable "locked" is readonly and cannot be modified.'
      );
    });

    it('throws (validation) when name is missing', async () => {
      const task = makeTaskWithVariables([]);
      await expect(GroupVariable.set({ value: 'x' } as any, task)).rejects.toThrow();
    });

    it('throws (validation) when name contains invalid characters', async () => {
      const task = makeTaskWithVariables([]);
      await expect(
        GroupVariable.set({ name: 'not a valid name!', value: 'x' } as any, task)
      ).rejects.toThrow();
    });
  });

  describe('set (global variable)', () => {
    beforeEach(() => {
      vi.mocked(GlobalVariableService.getByName).mockReset();
      vi.mocked(GlobalVariableService.update).mockReset();
    });

    it('updates an existing writable global variable', async () => {
      vi.mocked(GlobalVariableService.getByName).mockResolvedValue({
        identifier: 'gv-1',
        name: 'apiKey',
        readonly: false,
      } as any);
      vi.mocked(GlobalVariableService.update).mockResolvedValue({} as any);

      const task = makeTaskWithVariables([]);
      const result = await GroupVariable.set({ name: '_global.apiKey', value: 'new-key' }, task);

      expect(result).toBe(true);
      expect(GlobalVariableService.getByName).toHaveBeenCalledWith('apiKey');
      expect(GlobalVariableService.update).toHaveBeenCalledWith({
        identifier: 'gv-1',
        value: 'new-key',
      });
    });

    it('throws when the global variable does not exist', async () => {
      vi.mocked(GlobalVariableService.getByName).mockResolvedValue(null as any);

      const task = makeTaskWithVariables([]);
      await expect(
        GroupVariable.set({ name: '_global.missing', value: 'x' }, task)
      ).rejects.toThrow('Global variable "missing" does not exist.');
      expect(GlobalVariableService.update).not.toHaveBeenCalled();
    });

    it('throws when the global variable is readonly', async () => {
      vi.mocked(GlobalVariableService.getByName).mockResolvedValue({
        identifier: 'gv-2',
        name: 'locked',
        readonly: true,
      } as any);

      const task = makeTaskWithVariables([]);
      await expect(
        GroupVariable.set({ name: '_global.locked', value: 'x' }, task)
      ).rejects.toThrow('Global variable "locked" is readonly and cannot be modified.');
      expect(GlobalVariableService.update).not.toHaveBeenCalled();
    });
  });
});
