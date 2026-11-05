import { describe, expect, it } from 'vitest';
import { Action } from '@action/Action';
import { PluginActionRegistry } from '@/plugin/PluginActionRegistry';
import { RunCanceledSignal } from '@utils/errors';

describe('Action', () => {
  describe('getParamsPlain', () => {
    it('preserves a resolved array param (e.g. from `{= arr =}` interpolation)', () => {
      const action = new Action({
        group: 'math',
        name: 'max',
        params: { array: [12.5, 99.99, 45.0] },
      });

      expect(action.getParamsPlain()).toEqual({ array: [12.5, 99.99, 45.0] });
    });

    it('preserves a resolved plain object param', () => {
      const action = new Action({
        group: 'http',
        name: 'request',
        params: { headers: { Authorization: 'Bearer token' } },
      });

      expect(action.getParamsPlain()).toEqual({
        headers: { Authorization: 'Bearer token' },
      });
    });

    it('preserves nested arrays and objects', () => {
      const action = new Action({
        group: 'math',
        name: 'max',
        params: { config: { list: [1, 2, { nested: 'value' }] } },
      });

      expect(action.getParamsPlain()).toEqual({
        config: { list: [1, 2, { nested: 'value' }] },
      });
    });

    it('preserves scalar params untouched', () => {
      const action = new Action({
        group: 'math',
        name: 'abs',
        params: { number: -42.5, label: 'balance' },
      });

      expect(action.getParamsPlain()).toEqual({ number: -42.5, label: 'balance' });
    });

    it('replaces function values with null', () => {
      const action = new Action({
        group: 'script',
        name: 'run',
        params: { callback: () => {} },
      });

      expect(action.getParamsPlain()).toEqual({ callback: null });
    });

    it('replaces non-plain class instances with null', () => {
      class FakeConnection {
        host = 'localhost';
      }

      const action = new Action({
        group: 'database',
        name: 'query',
        params: {},
      });
      // setParams mirrors how Block resolves `{= var =}` params before execution,
      // where a variable can hold a live runtime object (e.g. a browser handle).
      // The constructor's safeClone would otherwise flatten the instance's prototype.
      action.setParams({ connection: new FakeConnection() });

      expect(action.getParamsPlain()).toEqual({ connection: null });
    });

    it('returns params unchanged when params is not an object', () => {
      const action = new Action({
        group: 'math',
        name: 'abs',
        params: null,
      });

      expect(action.getParamsPlain()).toBeNull();
    });

    it('does not mutate the underlying params', () => {
      const params = { array: [1, 2, 3] };
      const action = new Action({
        group: 'math',
        name: 'max',
        params,
      });

      const plain = action.getParamsPlain();
      plain.array.push(4);

      expect(action.getParams()).toEqual({ array: [1, 2, 3] });
    });
  });

  describe('execute', () => {
    it('passes a cancel through unwrapped, even with onError: continue', async () => {
      // A flow step (a loop, a sub-workflow) whose nested steps were canceled.
      PluginActionRegistry.testCancel = {
        nested: async () => {
          throw new RunCanceledSignal('ana');
        },
      };
      try {
        for (const onError of ['throw', 'continue'] as const) {
          const action = new Action({
            group: 'testCancel',
            name: 'nested',
            params: {},
            identifier: 'loop',
            onError,
          } as any);
          await expect(action.execute({} as any, null)).rejects.toBeInstanceOf(RunCanceledSignal);
        }
      } finally {
        delete PluginActionRegistry.testCancel;
      }
    });
  });
});
