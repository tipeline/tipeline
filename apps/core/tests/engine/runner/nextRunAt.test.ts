import { describe, expect, it } from 'vitest';
import { nextRunAt } from '@engine/runner/nextRunAt';

describe('nextRunAt', () => {
  // Local time on purpose: both runners fire on the machine's own clock.
  const from = new Date(2026, 9, 7, 10, 2, 0);

  it('returns the next time the cron fires', () => {
    expect(nextRunAt('*/5 * * * *', true, from)).toBe(new Date(2026, 9, 7, 10, 5, 0).toISOString());
    expect(nextRunAt('0 9 * * *', true, from)).toBe(new Date(2026, 9, 8, 9, 0, 0).toISOString());
  });

  it('is null for a paused schedule', () => {
    expect(nextRunAt('*/5 * * * *', false, from)).toBeNull();
  });

  it('is null for a cron it cannot read', () => {
    expect(nextRunAt('not a cron', true, from)).toBeNull();
  });
});
