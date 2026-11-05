/**
 * Lightweight in-process cache for runtime app settings.
 * Populated on boot and kept in sync when settings change via Core.settingsSet.
 */
export class AppSettings {
  private static _timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

  static get timezone(): string {
    return this._timezone;
  }

  static set timezone(tz: string) {
    if (tz) this._timezone = tz;
  }
}
