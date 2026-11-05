import { describe, it, expect } from 'vitest';
import { flowFieldErrorActions } from '@/utils/flowValidation';

const unfinished = { identifier: 'a1', group: 'math', name: 'multiply', label: 'Multiply', params: {} };
const finished = {
  identifier: 'a2',
  group: 'math',
  name: 'multiply',
  params: { multiplier: '{= multiplier =}', multiplicand: '{= multiplicand =}' },
};

describe('flowFieldErrorActions', () => {
  it('lists a step dropped in the builder but never filled in', () => {
    expect(flowFieldErrorActions([unfinished, finished])).toEqual([unfinished]);
  });

  it('finds unfinished steps inside a loop', () => {
    const loop = { identifier: 'l1', group: 'flow', name: 'loop', params: { iterable: '{= items =}', actions: [unfinished] } };
    expect(flowFieldErrorActions([loop]).map((a) => a.identifier)).toContain('a1');
  });

  it('is empty for a workflow whose steps are all set up', () => {
    expect(flowFieldErrorActions([finished])).toEqual([]);
    expect(flowFieldErrorActions(undefined as any)).toEqual([]);
  });
});
