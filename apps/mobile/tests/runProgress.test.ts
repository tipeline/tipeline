import { describe, expect, it } from 'vitest';
import type { RunEvent } from '@tipeline/client';
import { applyRunEvent, finalOutputs, formatValue, startProgress } from '../src/lib/runProgress';

const ev = (type: RunEvent['type'], data?: any, error?: string): RunEvent =>
  ({ type, data, error, correlationId: 'c', event: 'x' }) as RunEvent;

const steps = [
  { identifier: 's1', label: 'Say hello' },
  { identifier: 's2', label: 'Wait' },
];

/** Events as Core sent them in the end-to-end check against the Docker Server. */
const realRun: RunEvent[] = [
  ev('start', { name: 'Mobile client check', pipelineIdentifier: 'p1', taskIdentifier: 't' }),
  ev('action', { name: 'system.runApplication', result: 'hello from Linux', changedVariables: [{ name: 'out', value: 'hello from Linux' }], identifier: 's1' }),
  ev('action', { name: 'system.runApplication', result: 'done', changedVariables: [], identifier: 's2' }),
  ev('end', { name: 'Mobile client check', pipelineIdentifier: 'p1' }),
  ev('end_all', 'Workflow finished successfully'),
];

describe('applyRunEvent', () => {
  it('follows a run to the end and keeps the changed variables', () => {
    let p = startProgress(steps);
    expect(p.state).toBe('starting');
    for (const e of realRun) p = applyRunEvent(p, e);
    expect(p.state).toBe('finished');
    expect(p.pipelineIdentifier).toBe('p1');
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'done']);
    expect(p.values).toEqual({ out: 'hello from Linux' });
  });

  it('keeps the first run id when a sub-workflow starts', () => {
    let p = applyRunEvent(startProgress(steps), ev('start', { pipelineIdentifier: 'parent' }));
    p = applyRunEvent(p, ev('start', { pipelineIdentifier: 'child' }));
    expect(p.pipelineIdentifier).toBe('parent');
  });

  it('marks a failed step and a failed run', () => {
    let p = applyRunEvent(startProgress(steps), ev('start', { pipelineIdentifier: 'p' }));
    p = applyRunEvent(p, ev('action_error', { identifier: 's1' }, 'Mail server refused the login'));
    p = applyRunEvent(p, ev('error', undefined, 'Workflow failed'));
    p = applyRunEvent(p, ev('end_all'));
    expect(p.steps[0]).toMatchObject({ state: 'failed', error: 'Mail server refused the login' });
    expect(p.steps[1].state).toBe('waiting');
    expect(p.state).toBe('failed');
    expect(p.error).toBe('Workflow failed');
  });

  it('ignores steps it does not list (inside blocks or sub-workflows) but keeps their values', () => {
    let p = applyRunEvent(startProgress(steps), ev('action', { identifier: 'nested', changedVariables: [{ name: 'x', value: 1 }] }));
    expect(p.steps.every((s) => s.state === 'waiting')).toBe(true);
    expect(p.values).toEqual({ x: 1 });
  });
});

describe('finalOutputs', () => {
  it('shows outputs that got a value, in source order', () => {
    let p = startProgress(steps);
    for (const e of realRun) p = applyRunEvent(p, e);
    const outputs = [
      { type: 'string', name: 'missing', output: true },
      { type: 'string', name: 'out', output: true, label: 'Out' },
    ];
    expect(finalOutputs(p, outputs)).toEqual([{ variable: outputs[1], value: 'hello from Linux' }]);
  });

  it('formats values as text', () => {
    expect(formatValue('a')).toBe('a');
    expect(formatValue({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatValue(null)).toBe('');
  });
});
