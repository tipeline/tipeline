import { PipelineService } from '@database/services/PipelineService';
import { SettingsService } from '@database/services/SettingsService';
import { DatabaseManager } from '@database/DatabaseManager';

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const RUN_KEEP_DAYS_SETTING = 'runs.keepDays';
export const DEFAULT_RUN_KEEP_DAYS = 90;

/** How many days runs are kept; 0 means forever. A value that makes no sense keeps everything. */
export async function runKeepDays(): Promise<number> {
  const raw = await SettingsService.get(RUN_KEEP_DAYS_SETTING);
  if (raw === null) return DEFAULT_RUN_KEEP_DAYS;
  const days = Number(raw);
  return Number.isInteger(days) && days > 0 ? days : 0;
}

/**
 * Deletes finished runs older than the limit in Settings → Run history, then gives the file's
 * free space back to the disk. Runs on a plain interval in the main Core process, like
 * TrashPurger, and once at start.
 */
export class RunHistoryPurger {
  private static timer: NodeJS.Timeout | null = null;
  private static purging = false;

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
    if (this.purging) return 0;
    this.purging = true;
    try {
      const days = await runKeepDays();
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const deleted = days ? await PipelineService.deleteFinishedBefore(cutoff) : 0;
      if (deleted) console.log(`[RunHistoryPurger] Deleted ${deleted} run(s) older than ${days} days`);
      // Also covers what other cleanups freed since yesterday: the Trash, the cache, cleared runs.
      await DatabaseManager.reclaimFreeSpace();
      return deleted;
    } catch (error) {
      console.warn('[RunHistoryPurger] purge failed:', error);
      return 0;
    } finally {
      this.purging = false;
    }
  }
}
