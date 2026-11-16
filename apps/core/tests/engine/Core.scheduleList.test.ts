import { describe, expect, it, vi } from 'vitest';

vi.mock('@engine/runner/JobRunnerFactory', () => ({ getJobRunner: vi.fn() }));

import Core from '@engine/Core';
import { AppSettings } from '@engine/AppSettings';
import { getJobRunner } from '@engine/runner/JobRunnerFactory';

describe('Core.scheduleList', () => {
  it("adds the time zone the crons run in, so a client elsewhere can say so", async () => {
    vi.mocked(getJobRunner).mockReturnValue({
      listSchedules: async () => [{ scheduleIdentifier: 's1', cron: '0 9 * * 1-5' }],
    } as any);
    AppSettings.timezone = 'America/Costa_Rica';

    expect(await Core.scheduleList()).toEqual([
      { scheduleIdentifier: 's1', cron: '0 9 * * 1-5', timezone: 'America/Costa_Rica' },
    ]);
  });
});
