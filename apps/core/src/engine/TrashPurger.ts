import { TrashService } from '@database/services/TrashService';

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Deletes Trash items older than TRASH_KEEP_DAYS. Runs on a plain interval in the main
 * Core process, like CacheSweeper, and once at start.
 */
export class TrashPurger {
  private static timer: NodeJS.Timeout | null = null;

  static start(): void {
    if (this.timer) return;
    void this.purge();
    this.timer = setInterval(() => void this.purge(), PURGE_INTERVAL_MS);
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async purge(): Promise<number> {
    try {
      return (await TrashService.purgeExpired()).length;
    } catch (error) {
      console.warn('[TrashPurger] purge failed:', error);
      return 0;
    }
  }
}
