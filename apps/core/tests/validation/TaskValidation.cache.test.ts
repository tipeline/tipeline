import { describe, expect, it } from 'vitest';
import { TaskValidator } from '@validation/TaskValidation';

const task = (actions: any[], cache?: unknown) => ({
  name: 'W',
  description: 'd',
  ...(cache ? { cache } : {}),
  pipeline: { variables: [], actions },
});

describe('TaskValidator — cache settings', () => {
  it('keeps a valid step and workflow cache setting', () => {
    const validated: any = TaskValidator.validateFormat(
      task([{ group: 'http', name: 'request', params: { url: 'https://x' }, cache: { ttl: '1h', key: ['url'] } }], {
        ttl: '30m',
        inputs: ['id'],
      })
    );
    expect(validated.cache).toEqual({ ttl: '30m', inputs: ['id'] });
    expect(validated.pipeline.actions[0].cache).toEqual({ ttl: '1h', key: ['url'] });
  });

  it('rejects a cache setting on a step that cannot be cached, nested ones included', () => {
    expect(() =>
      TaskValidator.validateFormat(task([{ group: 'email', name: 'send', params: {}, cache: { ttl: '1h' } }]))
    ).toThrow(/email.send can't be cached/);
    expect(() =>
      TaskValidator.validateFormat(
        task([
          {
            group: 'flow',
            name: 'forEachLoop',
            params: { actions: [{ group: 'file', name: 'write', params: {}, cache: { ttl: 60 } }] },
          },
        ])
      )
    ).toThrow(/file.write can't be cached/);
  });

  it('rejects a bad TTL', () => {
    expect(() =>
      TaskValidator.validateFormat(task([{ group: 'math', name: 'sum', params: {}, cache: { ttl: 'soon' } }]))
    ).toThrow(/cache.ttl.invalid/);
    expect(() => TaskValidator.validateFormat(task([], { ttl: '90d' }))).toThrow(/cache.ttl.tooLong/);
  });

  it('rejects caching a workflow with a step that changes things outside the run', () => {
    expect(() =>
      TaskValidator.validateFormat(
        task([{ group: 'script', name: 'runScript', params: {} }, { group: 'email', name: 'send', params: {} }], {
          ttl: '1h',
        })
      )
    ).toThrow(/can't be cached: .*email.send/);
  });
});
