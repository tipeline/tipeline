import fs from 'node:fs';
import path from 'node:path';

// This computer's menu bar / tray choices, next to Electron's own files in userData: they
// are about this Desktop install, not a workspace, so they don't go to Core's settings.

export interface TraySettings {
  /** Closing the window hides it; Tipeline keeps running in the menu bar / tray. */
  keepRunning: boolean;
  /** The "still running in the menu bar" notice was shown (only once). */
  hintShown: boolean;
}

const DEFAULTS: TraySettings = { keepRunning: true, hintShown: false };

export function readTraySettings(dir: string): TraySettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'tray.json'), 'utf8'));
    return {
      keepRunning: typeof raw?.keepRunning === 'boolean' ? raw.keepRunning : DEFAULTS.keepRunning,
      hintShown: raw?.hintShown === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeTraySettings(dir: string, settings: TraySettings): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tray.json'), JSON.stringify(settings, null, 2));
  } catch (err: any) {
    console.warn('[Tray] could not save settings:', err?.message ?? err);
  }
}
