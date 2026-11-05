import { describe, expect, it } from 'vitest';
import {
  attachChildRuns,
  childRunsFromEvents,
  mergeChildRuns,
  shownChildRun,
  type ChildRun,
  type ChildRunDetail,
} from '@/utils/childRuns';
import { countSteps, firstFailed, flattenSteps } from '@/utils/runSteps';

const run = (identifier: string, status: string, stepIdentifier = 'call'): ChildRun => ({
  identifier,
  status,
  started_at: null,
  finished_at: null,
  taskIdentifier: 'enrich',
  taskName: 'Enrich customer',
  stepIdentifier,
});

const parentSteps = () => [
  { identifier: 'fetch', group: 'api', name: 'request', status: 'completed', params: {} },
  { identifier: 'call', group: 'subtask', name: 'exec', status: 'failed', params: { identifier: 'enrich' } },
  { identifier: 'write', group: 'file', name: 'write', status: 'pending', params: {} },
];

// The sub-workflow's steps: `fetch` repeats an identifier of the caller's.
const childSteps = () => [
  { identifier: 'fetch', group: 'db', name: 'query', status: 'completed', params: {} },
  { identifier: 'enrich-call', group: 'api', name: 'request', status: 'failed', params: {}, error: '401' },
];

describe('shownChildRun', () => {
  it('shows a failed run, else the one running, else the last', () => {
    expect(shownChildRun([run('a', 'completed'), run('b', 'failed'), run('c', 'completed')])?.identifier).toBe('b');
    expect(shownChildRun([run('a', 'completed'), run('b', 'running')])?.identifier).toBe('b');
    expect(shownChildRun([run('a', 'completed'), run('b', 'completed')])?.identifier).toBe('b');
    expect(shownChildRun([])).toBeNull();
  });
});

describe('attachChildRuns', () => {
  it('asks for the run a sub-workflow step started, then lists its steps under the step', () => {
    const actions = parentSteps();
    const children = [run('child-1', 'failed')];

    const missing = attachChildRuns(actions, children, () => undefined);
    expect(missing.map((r) => r.identifier)).toEqual(['child-1']);
    expect(actions[1].childRun.identifier).toBe('child-1');
    expect(actions[1].childSteps).toBeUndefined();

    const detail: ChildRunDetail = { status: 'failed', actions: childSteps(), children: [] };
    expect(attachChildRuns(actions, children, () => detail)).toEqual([]);
    expect(actions[1].childSteps).toBe(detail.actions);

    // Keyed under the step, so the repeated identifier doesn't clash with the caller's.
    const keys = flattenSteps(actions).map((r) => r.key);
    expect(keys).toEqual(['fetch', 'call', 'call>fetch', 'call>enrich-call', 'write']);
    // Where it failed is the sub-workflow's step; the counts stay the run's own.
    expect(firstFailed(actions)?.key).toBe('call>enrich-call');
    expect(countSteps(actions, null).total).toBe(3);
  });

  it('asks again when the run has changed since it was loaded', () => {
    const actions = parentSteps();
    const stale: ChildRunDetail = { status: 'running', actions: childSteps(), children: [] };
    const missing = attachChildRuns(actions, [run('child-1', 'failed')], () => stale);
    expect(missing.map((r) => r.status)).toEqual(['failed']);
  });

  it('links runs saved before parent links from the step result', () => {
    const actions = parentSteps();
    actions[1].status = 'completed';
    (actions[1] as any).result = { taskIdentifier: 'enrich', pipelineIdentifier: 'old-child' };
    attachChildRuns(actions, [], () => undefined);
    expect(actions[1].childRun).toMatchObject({ identifier: 'old-child', taskIdentifier: 'enrich' });
  });

  it('attaches sub-workflows of sub-workflows', () => {
    const actions = parentSteps();
    const middle: ChildRunDetail = {
      status: 'failed',
      actions: [{ identifier: 'inner', group: 'subtask', name: 'exec', status: 'failed', params: {} }],
      children: [run('grandchild', 'failed', 'inner')],
    };
    const missing = attachChildRuns(actions, [run('child-1', 'failed')], (id) => (id === 'child-1' ? middle : undefined));
    expect(missing.map((r) => r.identifier)).toEqual(['grandchild']);
    expect(middle.actions[0].childRun.identifier).toBe('grandchild');
  });

  it('keeps every run of a step that ran in a loop', () => {
    const actions = parentSteps();
    attachChildRuns(actions, [run('r1', 'completed'), run('r2', 'failed'), run('r3', 'completed')], () => undefined);
    expect(actions[1].childRuns.map((r: ChildRun) => r.identifier)).toEqual(['r1', 'r2', 'r3']);
    expect(actions[1].childRun.identifier).toBe('r2');
  });
});

describe('childRunsFromEvents', () => {
  it('picks the sub-workflow runs a live run started from their start events', () => {
    const events = [
      { type: 'start', pipelineIdentifier: 'parent', taskIdentifier: 'sync', timestamp: 0, data: {} },
      {
        type: 'start',
        pipelineIdentifier: 'child-1',
        taskIdentifier: 'enrich',
        timestamp: 1000,
        data: { name: 'Enrich customer', parent: { pipelineIdentifier: 'parent', stepIdentifier: 'call' } },
      },
      {
        type: 'start',
        pipelineIdentifier: 'other',
        taskIdentifier: 'enrich',
        timestamp: 2000,
        data: { parent: { pipelineIdentifier: 'someone-else', stepIdentifier: 'call' } },
      },
    ];
    const live = childRunsFromEvents(events, 'parent');
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ identifier: 'child-1', status: 'running', taskName: 'Enrich customer', stepIdentifier: 'call' });

    // The saved list wins for runs it already has.
    expect(mergeChildRuns([run('child-1', 'failed')], live).map((r) => r.status)).toEqual(['failed']);
  });
});
