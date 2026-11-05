import type { IJobRunner } from '@engine/runner/IJobRunner.js';

const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const DRIFT_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Detects system sleep/wake by watching for wall-clock gaps larger than the
 * check interval would allow, then asks the job runner to re-register its
 * scheduled jobs. Native timers (which Bree/later chains rely on) can fail to
 * re-arm themselves after a long process suspension, silently killing cron
 * schedules with no error.
 */
export class SleepWatchdog {
  private timer: NodeJS.Timeout | null = null;
  private lastTick = Date.now();

  constructor(private readonly runner: IJobRunner) {}

  start(): void {
    this.lastTick = Date.now();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async check(): Promise<void> {
    const now = Date.now();
    const drift = now - this.lastTick - CHECK_INTERVAL_MS;
    this.lastTick = now;

    if (drift < DRIFT_THRESHOLD_MS) return;

    console.warn(
      `[SleepWatchdog] Detected ${Math.round(drift / 1000)}s of unaccounted time — resyncing scheduled jobs`
    );
    try {
      await this.runner.resync?.();
    } catch (err) {
      console.error('[SleepWatchdog] Failed to resync job runner:', err);
    }
  }
}
