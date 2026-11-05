import { HubSyncService } from '@/hub/HubSyncService';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour, fixed for now

/**
 * Periodically checks every enabled hub for updates. Runs on a plain interval in
 * the main Core process rather than through Bree — Bree's cron path
 * (BreeRunner.addCronJob) spins up an isolated worker thread built specifically
 * around executing task pipelines, and hub-sync never runs user pipeline code
 * (only network + DB calls), so reusing it would mean a new worker entry point
 * for no isolation benefit.
 */
export class HubPoller {
  private static timer: NodeJS.Timeout | null = null;

  static start(): void {
    if (this.timer) return;

    HubSyncService.checkAllHubs().catch((err) => console.error('[HubPoller] Initial hub check failed:', err));

    this.timer = setInterval(() => {
      HubSyncService.checkAllHubs().catch((err) => console.error('[HubPoller] Hub check failed:', err));
    }, POLL_INTERVAL_MS);
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
