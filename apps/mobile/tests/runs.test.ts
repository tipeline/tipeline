import { describe, expect, it } from 'vitest';
import {
  endMessage,
  isActive,
  pendingApproval,
  relativeTime,
  runDurationMs,
  runOutputs,
  runSteps,
  statusFilter,
  statusTone,
  type RunDetail,
} from '../src/lib/runs';

const source = JSON.stringify({
  name: 'Result check',
  pipeline: {
    variables: [
      { type: 'string', name: 'count', label: 'Count', visibility: 'public', output: true },
      { type: 'string', name: 'status', label: 'Status', visibility: 'public', output: true },
      { type: 'string', name: 'token', label: 'Token', visibility: 'public', output: true, secret: true },
      { type: 'string', name: 'scratch' },
    ],
    actions: [
      { identifier: 'a1', group: 'system', name: 'runApplication', label: 'Count' },
      { identifier: 'a2', group: 'approval', name: 'request' },
      { identifier: 'a3', group: 'file', name: 'write', label: 'Save' },
    ],
  },
});

/** A pipelineDetail as Core answered it on the Docker Server, trimmed. */
const run = (over: Partial<RunDetail> = {}): RunDetail => ({
  identifier: 'p1',
  status: 'completed',
  started_at: '2026-11-15T19:59:33.674Z',
  finished_at: '2026-11-15T19:59:33.699Z',
  metadata: null,
  source,
  task: { identifier: 't1', name: 'Result check' },
  actions: [
    { identifier: 'a1', status: 'completed', started_at: '2026-11-15T19:59:33.690Z', finished_at: '2026-11-15T19:59:33.699Z', block: { parent_block_id: null } },
    { identifier: 'inner', status: 'failed', error: 'not a top-level step', block: { parent_block_id: 7 } },
  ],
  variables: [
    { name: 'count', value: '3', scope: 'task', hidden: false },
    { name: 'status', value: 'ready', scope: 'task', hidden: false },
    { name: 'token', value: null, scope: 'task', hidden: true },
    { name: 'scratch', value: 'hidden-helper', scope: 'task', hidden: false },
    { name: 'HOME', value: null, scope: 'env', hidden: true },
  ],
  ...over,
});

describe('run statuses', () => {
  it('tells active runs, pill tones and list filters', () => {
    expect(['pending', 'running', 'paused'].every(isActive)).toBe(true);
    expect(['completed', 'failed', 'canceled'].some(isActive)).toBe(false);
    expect([statusTone('completed'), statusTone('failed'), statusTone('paused'), statusTone('canceled')]).toEqual([
      'success',
      'failed',
      'waiting',
      'muted',
    ]);
    expect(statusFilter('all')).toBeUndefined();
    expect(statusFilter('paused')).toBe('paused');
  });
});

describe('runSteps', () => {
  it('lists top-level steps in source order with what happened to each', () => {
    const steps = runSteps(run({ status: 'failed', actions: [
      ...run().actions!,
      { identifier: 'a2', status: 'failed', error: JSON.stringify({ message: 'Rejected' }) },
    ] }));
    expect(steps.map((s) => [s.label, s.state])).toEqual([
      ['Count', 'done'],
      ['approval.request', 'failed'],
      ['Save', 'skipped'],
    ]);
    expect(steps[0].durationMs).toBe(9);
    expect(steps[1].error).toBe('Rejected');
  });

  it('shows steps still to come while the run goes on, and the step waiting at an approval', () => {
    const steps = runSteps(run({ status: 'paused', finished_at: null, actions: [
      ...run().actions!,
      { identifier: 'a2', status: 'paused' },
    ] }));
    expect(steps.map((s) => s.state)).toEqual(['done', 'paused', 'waiting']);
  });

  it('treats pending rows as not run once the run ended (Core stores them for steps to come)', () => {
    const rows = [
      { identifier: 'a1', status: 'canceled', block: { parent_block_id: null } },
      { identifier: 'a2', status: 'pending', block: { parent_block_id: null } },
    ];
    expect(runSteps(run({ status: 'canceled', actions: rows })).map((s) => s.state)).toEqual(['canceled', 'skipped', 'skipped']);
    expect(runSteps(run({ status: 'running', actions: rows })).map((s) => s.state)).toEqual(['canceled', 'waiting', 'waiting']);
  });

  it('keeps the last attempt of a resumed step', () => {
    const steps = runSteps(run({ actions: [
      { identifier: 'a1', status: 'failed', error: 'first try' },
      { identifier: 'a1', status: 'completed' },
    ] }));
    expect(steps[0]).toMatchObject({ state: 'done' });
    expect(steps[0].error).toBeUndefined();
  });
});

describe('runOutputs', () => {
  it("shows the outputs from the run's own copy of the workflow, secrets hidden", () => {
    expect(runOutputs(run()).map((o) => [o.variable.name, o.value, o.hidden])).toEqual([
      ['count', '3', false],
      ['status', 'ready', false],
      ['token', null, true],
    ]);
  });

  it('falls back to public non-secret variables when no outputs are declared', () => {
    const plain = JSON.stringify({
      pipeline: {
        variables: [
          { type: 'string', name: 'site', visibility: 'public' },
          { type: 'string', name: 'password', visibility: 'public', secret: true },
          { type: 'string', name: 'inner', visibility: 'protected' },
        ],
      },
    });
    const detail = run({
      source: plain,
      variables: [
        { name: 'site', value: 'example.com', scope: 'task' },
        { name: 'password', value: null, scope: 'task', hidden: true },
        { name: 'inner', value: 'x', scope: 'task' },
      ],
    });
    expect(runOutputs(detail).map((o) => o.variable.name)).toEqual(['site']);
  });
});

describe('run metadata', () => {
  it('reads the approval a paused run waits at', () => {
    const metadata = JSON.stringify({ approval: { title: 'Ship it?', details: 'v2.1' } });
    expect(pendingApproval({ status: 'paused', metadata })).toEqual({ title: 'Ship it?', details: 'v2.1' });
    expect(pendingApproval({ status: 'running', metadata })).toBeNull();
    expect(pendingApproval({ status: 'paused', metadata: { approval: null } })).toBeNull();
  });

  it("says why a run ended, in Core's words", () => {
    expect(endMessage({ status: 'canceled', metadata: { reason: 'user_canceled', message: 'Canceled by ed@acme.com' } })).toBe(
      'Canceled by ed@acme.com'
    );
    expect(endMessage({ status: 'running', metadata: { message: 'x' } })).toBe('');
    expect(endMessage({ status: 'completed', metadata: null })).toBe('');
  });
});

describe('times', () => {
  const now = Date.parse('2026-11-15T20:00:00.000Z');
  it('measures finished and running runs', () => {
    expect(runDurationMs({ started_at: '2026-11-15T19:59:00.000Z', finished_at: '2026-11-15T19:59:30.000Z' }, now)).toBe(30_000);
    expect(runDurationMs({ started_at: '2026-11-15T19:58:00.000Z', finished_at: null }, now)).toBe(120_000);
    expect(runDurationMs({ started_at: null, finished_at: null }, now)).toBeUndefined();
  });

  it('says when, in the app language', () => {
    expect(relativeTime('2026-11-15T19:55:00.000Z', 'en', now)).toBe('5 minutes ago');
    expect(relativeTime('2026-11-15T22:00:00.000Z', 'en', now)).toBe('in 2 hours');
    expect(relativeTime('2026-11-14T20:00:00.000Z', 'es', now)).toBe('ayer');
    expect(relativeTime('2026-11-15T19:59:58.000Z', 'en', now)).toBe('now');
    expect(relativeTime(null, 'en', now)).toBe('');
  });
});
