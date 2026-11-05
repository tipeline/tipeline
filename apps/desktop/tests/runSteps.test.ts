import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  countSteps,
  firstFailed,
  flattenSteps,
  formatStepDuration,
  iterationSpans,
  runWindow,
  stepDuration,
  stepStatus,
  stepSummary,
} from '@/utils/runSteps';

const at = (ms: number) => new Date(Date.UTC(2026, 9, 12, 9, 0, 0) + ms).toISOString();
const T0 = Date.UTC(2026, 9, 12, 9, 0, 0);

function step(identifier: string, from: number | null, to: number | null, extra: any = {}) {
  return {
    identifier,
    group: 'file',
    name: 'write',
    status: 'completed',
    started_at: from === null ? undefined : at(from),
    finished_at: to === null ? undefined : at(to),
    params: {},
    ...extra,
  };
}

const iterations = (durations: number[], start = 0) => {
  let t = start;
  return durations.map((d, i) => {
    const it = { index: i + 1, status: 'completed', started_at: at(t), finished_at: at(t + d) };
    t += d;
    return it;
  });
};

describe('runSteps', () => {
  it('reads a step status, with cached apart from completed', () => {
    expect(stepStatus({ status: 'completed' })).toBe('completed');
    expect(stepStatus({ status: 'completed', cached: true })).toBe('cached');
    expect(stepStatus({ error: 'boom' })).toBe('failed');
    expect(stepStatus({})).toBe('pending');
  });

  it('times a running step up to now, and leaves a step without a start untimed', () => {
    expect(stepDuration(step('a', 0, 250), null)).toBe(250);
    expect(stepDuration(step('b', 1000, null, { status: 'running' }), T0 + 4000)).toBe(3000);
    expect(stepDuration(step('c', null, 500), null)).toBeNull();
  });

  it('lists nested steps under their parent, and skips the children of a closed parent', () => {
    const actions = [step('a', 0, 10), step('loop', 10, 100, { params: { actions: [step('x', 20, 30)] } })];
    expect(flattenSteps(actions).map((r) => [r.key, r.depth])).toEqual([
      ['a', 0],
      ['loop', 0],
      ['x', 1],
    ]);
    expect(flattenSteps(actions, (key) => key !== 'loop').map((r) => r.key)).toEqual(['a', 'loop']);
  });

  it('finds the deepest failed step', () => {
    const actions = [
      step('a', 0, 10),
      step('loop', 10, 100, { status: 'completed', params: { actions: [step('ok', 20, 30), step('bad', 30, 40, { status: 'failed' })] } }),
      step('b', 100, 110),
    ];
    expect(firstFailed(actions)?.key).toBe('bad');
  });

  it('counts every step, slow ones included', () => {
    const actions = [
      step('a', 0, 1500),
      step('b', 1500, 1510, { cached: true }),
      step('c', 1510, 1600, { status: 'failed' }),
      step('d', null, null, { status: 'pending' }),
    ];
    expect(countSteps(actions, null)).toMatchObject({ total: 4, completed: 1, cached: 1, failed: 1, pending: 1, slow: 1 });
  });

  it('marks a loop pass slow only when it stands out from the others', () => {
    const action = step('shot', 0, 0, { iterations: iterations([400, 420, 410, 1300, 405]) });
    expect(iterationSpans(action).map((s) => s.slow)).toEqual([false, false, false, true, false]);
    const even = step('even', 0, 0, { iterations: iterations([400, 420, 410]) });
    expect(iterationSpans(even).some((s) => s.slow)).toBe(false);
  });

  it('spans the run from its start to its end, or to now while it runs', () => {
    const actions = [step('a', 100, 300)];
    expect(runWindow(actions, { started_at: at(0), finished_at: at(1000) }, null)).toEqual({ start: T0, end: T0 + 1000 });
    expect(runWindow(actions, { started_at: at(0) }, T0 + 5000)).toEqual({ start: T0, end: T0 + 5000 });
    expect(runWindow(actions, null, null)).toEqual({ start: T0 + 100, end: T0 + 300 });
    expect(runWindow([], null, null)).toBeNull();
  });

  it('stretches past the run times to cover every step', () => {
    const actions = [step('a', -20, 300), step('b', 300, 1400)];
    expect(runWindow(actions, { started_at: at(0), finished_at: at(1000) }, null)).toEqual({ start: T0 - 20, end: T0 + 1400 });
  });

  it('formats short and long durations', () => {
    expect(formatStepDuration(4)).toBe('4ms');
    expect(formatStepDuration(1240)).toBe('1.2s');
    expect(formatStepDuration(125000)).toBe('2m 5s');
  });

  it('summarizes the input values on one line, without nested steps', () => {
    expect(stepSummary({ params: { method: 'GET', url: 'https://x.test/a', actions: [{}] } })).toBe('GET · https://x.test/a');
    expect(stepSummary({ params: {} })).toBe('');
  });

  it('picks round axis ticks', () => {
    expect(axisTicks(18000)).toEqual([0, 5000, 10000, 15000]);
    expect(axisTicks(900)).toEqual([0, 200, 400, 600, 800]);
  });
});
