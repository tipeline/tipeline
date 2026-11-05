import { CacheService } from '@database/services/CacheService';

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Keeps the result cache tidy: removes expired entries, then the oldest ones while
 * it's over its size limit (Settings → Cache). Expired entries are also removed when
 * they're read; this catches the ones nobody asks for again.
 *
 * Runs on a plain interval in the main Core process, like ApprovalTimeoutService, and
 * once at start.
 */
export class CacheSweeper {
  private static timer: NodeJS.Timeout | null = null;
  private static sweeping = false;

  static start(): void {
    if (this.timer) return;
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async sweep(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      return await CacheService.sweep();
    } catch (error) {
      console.warn('[CacheSweeper] sweep failed:', error);
      return 0;
    } finally {
      this.sweeping = false;
    }
  }
}
