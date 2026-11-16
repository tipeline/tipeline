import { describe, expect, it } from 'vitest';
import {
  countsAlert,
  dismissedEntry,
  failingWorkflows,
  missedSchedules,
  openAlerts,
  type AlertItem,
  type ScheduleItem,
} from '../src/lib/inbox';

const none = () => false;

describe('failingWorkflows', () => {
  const workflows = [
    { identifier: 'a', name: 'A', last_run_status: 'failed', last_run_at: '2026-11-15T08:00:00Z', last_run_identifier: 'run-a1' },
    { identifier: 'b', name: 'B', last_run_status: 'completed', last_run_at: '2026-11-15T09:00:00Z' },
    { identifier: 'c', name: 'C', last_run_status: 'failed', last_run_at: '2026-11-15T10:00:00Z', last_run_identifier: 'run-c1' },
  ];

  it('lists workflows whose latest run failed, newest first', () => {
    expect(failingWorkflows(workflows, none).map((w) => w.identifier)).toEqual(['c', 'a']);
  });

  it('leaves out a dismissed failure until the workflow fails again', () => {
    const dismissed = new Set([dismissedEntry('c', 'run-c1')]);
    const isDismissed = (key: string, occurrence: string) => dismissed.has(dismissedEntry(key, occurrence));
    expect(failingWorkflows(workflows, isDismissed).map((w) => w.identifier)).toEqual(['a']);
    const failedAgain = workflows.map((w) => (w.identifier === 'c' ? { ...w, last_run_identifier: 'run-c2' } : w));
    expect(failingWorkflows(failedAgain, isDismissed).map((w) => w.identifier)).toEqual(['c', 'a']);
  });
});

describe('missedSchedules', () => {
  const schedule = (id: string, over: Partial<ScheduleItem> = {}): ScheduleItem => ({
    scheduleIdentifier: id,
    taskIdentifier: 't',
    taskName: 'T',
    cron: '0 9 * * *',
    runAt: null,
    everySeconds: null,
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    ...over,
  });
  it('lists schedules that should have run, only while on', () => {
    const list = [
      schedule('s1', { missedAt: '2026-11-15T09:00:00Z' }),
      schedule('s2'),
      schedule('s3', { missedAt: '2026-11-15T10:00:00Z', enabled: false }),
    ];
    expect(missedSchedules(list, none).map((s) => s.scheduleIdentifier)).toEqual(['s1']);
  });
});

describe('alerts', () => {
  const alert = (id: string, level: string, status = 'open', at = '2026-11-15T09:00:00Z'): AlertItem => ({
    id,
    taskIdentifier: 't',
    workflowName: 'T',
    pipelineIdentifier: null,
    title: id,
    message: null,
    level,
    status,
    count: 1,
    lastRaisedAt: at,
  });
  it('shows open alerts, the serious ones first, and counts all but info', () => {
    const list = [alert('i', 'info'), alert('w', 'warning'), alert('c', 'critical'), alert('d', 'critical', 'dismissed')];
    expect(openAlerts(list).map((a) => a.id)).toEqual(['c', 'w', 'i']);
    expect(list.filter(countsAlert).map((a) => a.id)).toEqual(['w', 'c']);
  });
});
