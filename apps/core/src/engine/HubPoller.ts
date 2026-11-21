import { HubSyncService } from '@/hub/HubSyncService';
import { SettingsService } from '@database/services/SettingsService';

export const HUB_CHECK_INTERVAL_SETTING = 'hubs.checkInterval';

/** The choices in Settings → Hubs. `manual` only checks when someone asks (Check now, a plugin page). */
export const HUB_CHECK_INTERVALS = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  manual: null,
} as const;

export type HubCheckInterval = keyof typeof HUB_CHECK_INTERVALS;
export const DEFAULT_HUB_CHECK_INTERVAL: HubCheckInterval = '1h';

export function isHubCheckInterval(value: string): value is HubCheckInterval {
  return Object.prototype.hasOwnProperty.call(HUB_CHECK_INTERVALS, value);
}

/** The saved choice; anything unknown falls back to the default rather than stopping checks. */
export async function hubCheckInterval(): Promise<HubCheckInterval> {
  const raw = await SettingsService.get(HUB_CHECK_INTERVAL_SETTING);
  return raw && isHubCheckInterval(raw) ? raw : DEFAULT_HUB_CHECK_INTERVAL;
}

/**
 * Periodically checks every enabled hub for updates, as often as Settings → Hubs says.
 * Runs on a plain interval in the main Core process rather than through Bree — Bree's cron
 * path (BreeRunner.addCronJob) spins up an isolated worker thread built specifically around
 * executing task pipelines, and hub-sync never runs user pipeline code (only network + DB
 * calls), so reusing it would mean a new worker entry point for no isolation benefit.
 */
export class HubPoller {
  private static timer: NodeJS.Timeout | null = null;
  private static started = false;

  static async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const interval = await hubCheckInterval();
    if (interval !== 'manual') this.checkAll('Initial hub check failed');
    this.schedule(interval);
  }

  /** Applies a changed setting now. The next check is one full interval away. */
  static async reschedule(): Promise<void> {
    if (!this.started) return;
    this.schedule(await hubCheckInterval());
  }

  static stop(): void {
    this.clear();
    this.started = false;
  }

  private static schedule(interval: HubCheckInterval) {
    this.clear();
    const ms = HUB_CHECK_INTERVALS[interval];
    if (ms === null) return;
    this.timer = setInterval(() => this.checkAll('Hub check failed'), ms);
  }

  private static clear() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private static checkAll(failure: string) {
    HubSyncService.checkAllHubs().catch((err) => console.error(`[HubPoller] ${failure}:`, err));
  }
}
