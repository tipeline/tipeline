import { describe, expect, it } from 'vitest';
import { applyLiveEvents, updateTimelineWithEvents } from '@/composables/useTimelineUpdater';
import { stepDuration } from '@/utils/runSteps';

const ev = (type: string, timestamp: number, data?: any) => ({
  type,
  timestamp,
  data,
  correlationId: 'c',
  taskIdentifier: 't',
  pipelineIdentifier: 'p',
});

describe('updateTimelineWithEvents', () => {
  it('marks a step that threw as failed, not completed, once the run ends', () => {
    const actions: any[] = [{ identifier: 'a1', status: 'running' }];
    updateTimelineWithEvents(actions, [
      ev('start', 1),
      ev('action_error', 2, { identifier: 'a1', name: 'script.run', error: 'boom' }),
      ev('end', 3, {}),
    ]);
    expect(actions[0].status).toBe('failed');
    expect(actions[0].error).toBe('boom');
  });

  it('keeps steps that finished before the failure completed', () => {
    const actions: any[] = [
      { identifier: 'a1', status: 'pending' },
      { identifier: 'a2', status: 'pending' },
    ];
    updateTimelineWithEvents(actions, [
      ev('action', 2, { identifier: 'a1', result: 1 }),
      ev('action_error', 3, { identifier: 'a2', error: 'boom' }),
      ev('end', 4, {}),
    ]);
    expect(actions.map((a) => a.status)).toEqual(['completed', 'failed']);
  });

  it('keeps the saved statuses when the reloaded run gets its events re-applied', () => {
    // The run page reloads the run when it ends, then re-applies the events it saw. The
    // failed step's saved status must survive, even when no event of its own arrived.
    const actions: any[] = [
      { identifier: 'a1', status: 'completed', finished_at: new Date(1).toISOString() },
      { identifier: 'a2', status: 'completed', finished_at: new Date(2).toISOString() },
      { identifier: 'auth', status: 'failed', error: 'Token refresh failed' },
      { identifier: 'a4', status: 'pending' },
    ];
    updateTimelineWithEvents(actions, [ev('action', 1, { identifier: 'a1' }), ev('action', 2, { identifier: 'a2' }), ev('end', 4, {})]);
    expect(actions.map((a) => a.status)).toEqual(['completed', 'completed', 'failed', 'pending']);
    expect(actions[2].error).toBe('Token refresh failed');
  });

  it('still resets a loop body for its next pass when a step completes again live', () => {
    const body: any[] = [
      { identifier: 'shot', status: 'pending' },
      { identifier: 'write', status: 'pending' },
    ];
    const first = [ev('action', 1, { identifier: 'shot' }), ev('action', 2, { identifier: 'write' })];
    updateTimelineWithEvents(body, first);
    expect(body.map((a) => a.status)).toEqual(['completed', 'completed']);
    updateTimelineWithEvents(body, [...first, ev('action', 3, { identifier: 'shot' })]);
    expect(body.map((a) => a.status)).toEqual(['completed', 'running']);
  });
});

describe('applyLiveEvents', () => {
  // Saved times from a real run: 3ms, then under 1ms. Their events reached the window
  // together, about 40ms after the first step started.
  const saved = () => [
    {
      identifier: 'a1',
      status: 'completed',
      started_at: '2026-11-05T03:38:16.977Z',
      finished_at: '2026-11-05T03:38:16.980Z',
    },
    {
      identifier: 'a2',
      status: 'completed',
      started_at: '2026-11-05T03:38:16.980Z',
      finished_at: '2026-11-05T03:38:16.980Z',
    },
  ];
  const arrived = Date.parse('2026-11-05T03:38:17.018Z');
  const burst = [
    ev('action', arrived, { identifier: 'a1', result: 1 }),
    ev('action', arrived + 1, { identifier: 'a2', result: 2 }),
    ev('end', arrived + 2, {}),
  ];

  it('keeps the saved durations of a run that has ended', () => {
    for (const status of ['completed', 'failed', 'canceled']) {
      const actions = saved();
      applyLiveEvents(actions, burst, status);
      expect(actions.map((a) => stepDuration(a, null))).toEqual([3, 0]);
    }
  });

  it('applies events while the run is going', () => {
    const actions: any[] = [{ identifier: 'a1', status: 'pending' }];
    applyLiveEvents(actions, [ev('action', arrived, { identifier: 'a1', result: 1 })], 'running');
    expect(actions[0].status).toBe('completed');
  });

  it('shows what the bug looked like when events were re-applied to a saved run', () => {
    const actions = saved();
    updateTimelineWithEvents(actions, burst);
    expect(actions.map((a) => stepDuration(a, null))).toEqual([41, 39]);
  });
});
