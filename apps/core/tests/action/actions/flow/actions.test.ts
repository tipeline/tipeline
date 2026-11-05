import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupFlow } from '@/action/actions/flow/actions';
import { Task } from '@task/Task';
import { Action } from '@action/Action';

/**
 * GroupFlow's control-flow methods take a live `Task`, not a plain params object.
 * A real `Task` is safe to use directly here: `Task.getShouldSave()` defaults to
 * `false`, and `Pipeline.createChildBlock()` / `Block.run()` short-circuit around
 * every database call whenever `shouldSave` is false (see
 * apps/core/src/pipeline/Pipeline.ts createChildBlock and
 * apps/core/src/pipeline/Block.ts loadCompletedIdentifiers/executeAction). So a
 * fresh `new Task()` with variables loaded in-memory exercises the real
 * child-block/action-execution path with no DB, browser, or network I/O —
 * nested `math.add` actions are used as an observable side effect to prove a
 * branch/loop body actually ran.
 */
async function createTask(variables: Array<{ name: string; type: string; value: any }>) {
  const task = new Task();
  await task.loadVariables(variables.map((v) => ({ ...v, required: false })));
  return task;
}

function getVar(task: Task, name: string) {
  return task.getPipeline().getVariableByName(name);
}

/** Loops read their body from the step's raw params, so each iteration resolves it again. */
function runLoop(loop: (...args: any[]) => Promise<boolean>, params: any, task: any) {
  return loop(params, task, undefined, { getRawParams: () => params });
}

describe('GroupFlow', () => {
  describe('ifConditional', () => {
    it('runs the branch and returns true when the condition matches', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);

      const matched = await GroupFlow.ifConditional(
        {
          firstOperand: 5,
          compareAs: 'number',
          operator: 'eq',
          secondOperand: 5,
          actions: [
            { group: 'math', name: 'add', params: { augend: 10, addend: 5 }, destination: 'result' },
          ],
        } as any,
        task
      );

      expect(matched).toBe(true);
      expect(getVar(task, 'result')?.getValue()).toBe(15);
    });

    it('does not run the branch and returns false when the condition does not match', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);

      const matched = await GroupFlow.ifConditional(
        {
          firstOperand: 5,
          compareAs: 'number',
          operator: 'eq',
          secondOperand: 6,
          actions: [
            { group: 'math', name: 'add', params: { augend: 10, addend: 5 }, destination: 'result' },
          ],
        } as any,
        task
      );

      expect(matched).toBe(false);
      expect(getVar(task, 'result')?.getValue()).toBe(0);
    });

    it('throws a validation error for an unknown operator', async () => {
      const task = await createTask([]);
      await expect(
        GroupFlow.ifConditional(
          { firstOperand: 1, compareAs: 'number', operator: 'between', secondOperand: 2 } as any,
          task
        )
      ).rejects.toThrow();
    });

    it('throws a validation error when firstOperand is missing', async () => {
      const task = await createTask([]);
      await expect(
        GroupFlow.ifConditional({ compareAs: 'number', operator: 'eq', secondOperand: 2 } as any, task)
      ).rejects.toThrow();
    });

    it('reads a numeric-looking string as a number when compareAs is number', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: '5', compareAs: 'number', operator: 'eq', secondOperand: 5 } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('matches substrings with the contains operator', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: 'hello world', compareAs: 'string', operator: 'contains', secondOperand: 'world' } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('matches with the startsWith operator', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: 'report.pdf', compareAs: 'string', operator: 'startsWith', secondOperand: 'report' } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('matches with the endsWith operator', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: 'report.pdf', compareAs: 'string', operator: 'endsWith', secondOperand: '.pdf' } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('matches with the matchesRegex operator', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: 'invoice-2024', compareAs: 'string', operator: 'matchesRegex', secondOperand: '^invoice-\\d{4}$' } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('does not match with the matchesRegex operator when the pattern does not apply', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: 'invoice-24', compareAs: 'string', operator: 'matchesRegex', secondOperand: '^invoice-\\d{4}$' } as any,
        task
      );
      expect(matched).toBe(false);
    });

    it('throws when matchesRegex is given an invalid regular expression', async () => {
      const task = await createTask([]);
      await expect(
        GroupFlow.ifConditional(
          { firstOperand: 'invoice-2024', compareAs: 'string', operator: 'matchesRegex', secondOperand: '(unclosed' } as any,
          task
        )
      ).rejects.toThrow();
    });

    it('evaluates the unary empty operator without a secondOperand', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: '', compareAs: 'string', operator: 'empty' } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('evaluates the unary notEmpty operator without a secondOperand', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: 'not empty', compareAs: 'string', operator: 'notEmpty' } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('evaluates the unary isValid operator against a resolved boolean value', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: true, compareAs: 'boolean', operator: 'isValid' } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('compares {{ }} text as numbers when compareAs is number ("10" > "9")', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: '10', compareAs: 'number', operator: 'gt', secondOperand: '9' } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('ignores case for text when asked', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: 'Inactive', compareAs: 'string', operator: 'eq', secondOperand: 'inactive', ignoreCase: true } as any,
        task
      );
      expect(matched).toBe(true);
    });

    it('fails the step, naming the value, when it cannot be read as compareAs', async () => {
      const task = await createTask([]);
      await expect(
        GroupFlow.ifConditional(
          { firstOperand: 'abc', compareAs: 'number', operator: 'gt', secondOperand: 1 } as any,
          task
        )
      ).rejects.toThrow(/"abc".*not a number/);
    });

    it('rejects an operator the chosen type does not have', async () => {
      const task = await createTask([]);
      await expect(
        GroupFlow.ifConditional(
          { firstOperand: 'a', compareAs: 'string', operator: 'after', secondOperand: 'b' } as any,
          task
        )
      ).rejects.toThrow(/can't compare text values/);
    });

    it('requires compareAs', async () => {
      const task = await createTask([]);
      await expect(
        GroupFlow.ifConditional({ firstOperand: 1, operator: 'eq', secondOperand: 1 } as any, task)
      ).rejects.toThrow();
    });

    it('requires a secondOperand for operators that compare with something', async () => {
      const task = await createTask([]);
      await expect(
        GroupFlow.ifConditional({ firstOperand: 1, compareAs: 'number', operator: 'eq' } as any, task)
      ).rejects.toThrow();
    });

    it('checks an array of objects by content', async () => {
      const task = await createTask([]);
      const matched = await GroupFlow.ifConditional(
        { firstOperand: [{ id: 3 }], compareAs: 'array', operator: 'contains', secondOperand: { id: 3 } } as any,
        task
      );
      expect(matched).toBe(true);
    });
  });

  describe('elseIfConditional', () => {
    it('evaluates and runs when no prior branch has fired', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);

      const fired = await GroupFlow.elseIfConditional(
        {
          firstOperand: 'pending',
          compareAs: 'string',
          operator: 'eq',
          secondOperand: 'pending',
          actions: [
            { group: 'math', name: 'add', params: { augend: 1, addend: 1 }, destination: 'result' },
          ],
        } as any,
        task,
        false
      );

      expect(fired).toBe(true);
      expect(getVar(task, 'result')?.getValue()).toBe(2);
    });

    it('skips evaluation and propagates true when a prior branch already fired', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);

      const fired = await GroupFlow.elseIfConditional(
        {
          firstOperand: 'pending',
          compareAs: 'string',
          operator: 'eq',
          secondOperand: 'pending',
          actions: [
            { group: 'math', name: 'add', params: { augend: 1, addend: 1 }, destination: 'result' },
          ],
        } as any,
        task,
        true
      );

      expect(fired).toBe(true);
      // Branch body must not have run since a prior branch already matched.
      expect(getVar(task, 'result')?.getValue()).toBe(0);
    });
  });

  describe('elseConditional', () => {
    it('runs the fallback branch when no prior branch fired', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);

      const resolved = await GroupFlow.elseConditional(
        {
          actions: [
            { group: 'math', name: 'add', params: { augend: 3, addend: 4 }, destination: 'result' },
          ],
        } as any,
        task,
        false
      );

      expect(resolved).toBe(true);
      expect(getVar(task, 'result')?.getValue()).toBe(7);
    });

    it('skips the fallback branch when a prior branch already fired', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);

      const resolved = await GroupFlow.elseConditional(
        {
          actions: [
            { group: 'math', name: 'add', params: { augend: 3, addend: 4 }, destination: 'result' },
          ],
        } as any,
        task,
        true
      );

      expect(resolved).toBe(true);
      expect(getVar(task, 'result')?.getValue()).toBe(0);
    });
  });

  describe('switchConditional', () => {
    it('returns a fresh unmatched switch state carrying the resolved expression', async () => {
      const state = await GroupFlow.switchConditional({ expression: 'banana' } as any);
      expect(state).toEqual({ __switch: true, expression: 'banana', matched: false });
    });

    it('throws a validation error when expression is missing', async () => {
      await expect(GroupFlow.switchConditional({} as any)).rejects.toThrow();
    });
  });

  describe('caseConditional', () => {
    it('runs the branch and marks matched when the case matches an unmatched switch', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);
      const lastResult = { __switch: true as const, expression: 'banana', matched: false };

      const state = await GroupFlow.caseConditional(
        {
          match: 'banana',
          actions: [
            {
              group: 'math',
              name: 'add',
              params: { augend: 1, addend: 1 },
              destination: 'result',
            },
          ],
        } as any,
        task,
        lastResult
      );

      expect(state).toEqual({ __switch: true, expression: 'banana', matched: true });
      expect(getVar(task, 'result')?.getValue()).toBe(2);
    });

    it('does not run and leaves state unchanged when the case does not match', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);
      const lastResult = { __switch: true as const, expression: 'banana', matched: false };

      const state = await GroupFlow.caseConditional(
        { match: 'apple', actions: [] } as any,
        task,
        lastResult
      );

      expect(state).toEqual(lastResult);
    });

    it('skips evaluation entirely when a previous case already matched', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);
      const lastResult = { __switch: true as const, expression: 'banana', matched: true };

      const state = await GroupFlow.caseConditional(
        {
          match: 'banana',
          actions: [
            { group: 'math', name: 'add', params: { augend: 1, addend: 1 }, destination: 'result' },
          ],
        } as any,
        task,
        lastResult
      );

      expect(state).toBe(lastResult);
      expect(getVar(task, 'result')?.getValue()).toBe(0);
    });
  });

  describe('defaultConditional', () => {
    it('runs the fallback when the switch is still unmatched', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);
      const lastResult = { __switch: true as const, expression: 'banana', matched: false };

      const resolved = await GroupFlow.defaultConditional(
        {
          actions: [
            { group: 'math', name: 'add', params: { augend: 1, addend: 1 }, destination: 'result' },
          ],
        } as any,
        task,
        lastResult
      );

      expect(resolved).toBe(true);
      expect(getVar(task, 'result')?.getValue()).toBe(2);
    });

    it('does not run the fallback when a case already matched', async () => {
      const task = await createTask([{ name: 'result', type: 'number', value: 0 }]);
      const lastResult = { __switch: true as const, expression: 'banana', matched: true };

      const resolved = await GroupFlow.defaultConditional(
        {
          actions: [
            { group: 'math', name: 'add', params: { augend: 1, addend: 1 }, destination: 'result' },
          ],
        } as any,
        task,
        lastResult
      );

      expect(resolved).toBe(true);
      expect(getVar(task, 'result')?.getValue()).toBe(0);
    });
  });

  describe('simpleLoop', () => {
    it('runs the body once per iteration from indexValue up to (not including) indexEndValue', async () => {
      const task = await createTask([{ name: 'counter', type: 'number', value: 0 }]);

      const result = await runLoop(
        GroupFlow.simpleLoop,
        {
          indexValue: 0,
          indexEndValue: 5,
          incrementBy: 1,
          actions: [
            {
              group: 'math',
              name: 'add',
              params: { augend: '{= counter =}', addend: 1 },
              destination: 'counter',
            },
          ],
        } as any,
        task
      );

      expect(result).toBe(true);
      expect(getVar(task, 'counter')?.getValue()).toBe(5);
    });

    it('never runs the body when indexValue is already past indexEndValue', async () => {
      const task = await createTask([{ name: 'counter', type: 'number', value: 0 }]);

      const result = await runLoop(
        GroupFlow.simpleLoop,
        {
          indexValue: 10,
          indexEndValue: 5,
          incrementBy: 1,
          actions: [
            {
              group: 'math',
              name: 'add',
              params: { augend: '{= counter =}', addend: 1 },
              destination: 'counter',
            },
          ],
        } as any,
        task
      );

      expect(result).toBe(true);
      expect(getVar(task, 'counter')?.getValue()).toBe(0);
    });

    it('throws a validation error when indexEndValue is missing', async () => {
      const task = await createTask([]);
      await expect(
        GroupFlow.simpleLoop({ indexValue: 0, incrementBy: 1 } as any, task)
      ).rejects.toThrow();
    });
  });

  describe('forEachLoop', () => {
    it('binds each array element to the currentItem variable and runs the body per item', async () => {
      const task = await createTask([
        { name: 'item', type: 'number', value: 0 },
        { name: 'sum', type: 'number', value: 0 },
      ]);

      const result = await runLoop(
        GroupFlow.forEachLoop,
        {
          iterable: [1, 2, 3],
          currentItem: 'item',
          actions: [
            {
              group: 'math',
              name: 'add',
              params: { augend: '{= sum =}', addend: '{= item =}' },
              destination: 'sum',
            },
          ],
        } as any,
        task
      );

      expect(result).toBe(true);
      expect(getVar(task, 'sum')?.getValue()).toBe(6);
      expect(getVar(task, 'item')?.getValue()).toBe(3);
    });

    it('throws when iterable resolves to a string', async () => {
      const task = await createTask([{ name: 'item', type: 'number', value: 0 }]);

      await expect(
        runLoop(
          GroupFlow.forEachLoop,
          { iterable: 'not-an-array', currentItem: 'item', actions: [] } as any,
          task
        )
      ).rejects.toThrow('iterable did not resolve to an array');
    });

    it('throws a validation error when currentItem is missing', async () => {
      const task = await createTask([]);
      await expect(GroupFlow.forEachLoop({ iterable: [1, 2] } as any, task)).rejects.toThrow();
    });
  });

  describe('conditionalLoop', () => {
    it('runs the body while the re-resolved condition holds, mutating a variable each pass', async () => {
      const task = await createTask([{ name: 'counter', type: 'number', value: 0 }]);
      const action = new Action({
        group: 'flow',
        name: 'conditionalLoop',
        params: {
          compareAs: 'number',
          operator: 'lt',
          firstOperand: '{= counter =}',
          secondOperand: 5,
          actions: [
            {
              group: 'math',
              name: 'add',
              params: { augend: '{= counter =}', addend: 1 },
              destination: 'counter',
            },
          ],
        },
      });

      const result = await GroupFlow.conditionalLoop(undefined, task, undefined, action);

      expect(result).toBe(true);
      expect(getVar(task, 'counter')?.getValue()).toBe(5);
    });

    it('never runs the body when the initial condition is already false', async () => {
      const task = await createTask([{ name: 'counter', type: 'number', value: 10 }]);
      const action = new Action({
        group: 'flow',
        name: 'conditionalLoop',
        params: {
          compareAs: 'number',
          operator: 'lt',
          firstOperand: '{= counter =}',
          secondOperand: 5,
          actions: [
            {
              group: 'math',
              name: 'add',
              params: { augend: '{= counter =}', addend: 1 },
              destination: 'counter',
            },
          ],
        },
      });

      const result = await GroupFlow.conditionalLoop(undefined, task, undefined, action);

      expect(result).toBe(true);
      expect(getVar(task, 'counter')?.getValue()).toBe(10);
    });

    it('throws a validation error for an unknown loop operator', async () => {
      const task = await createTask([{ name: 'counter', type: 'number', value: 0 }]);
      const action = new Action({
        group: 'flow',
        name: 'conditionalLoop',
        params: {
          compareAs: 'number',
          operator: 'between',
          firstOperand: '{= counter =}',
          secondOperand: 5,
        },
      });

      await expect(
        GroupFlow.conditionalLoop(undefined, task, undefined, action)
      ).rejects.toThrow();
    });
  });

  describe('wait', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves true after the requested timeout elapses', async () => {
      const promise = GroupFlow.wait({ timeout: 250 } as any);
      await vi.advanceTimersByTimeAsync(250);
      await expect(promise).resolves.toBe(true);
    });

    it('defaults to a 1000ms pause when timeout is not provided', async () => {
      const promise = GroupFlow.wait({} as any);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(promise).resolves.toBe(true);
    });
  });
});
