import { SEND } from '@/ipc-channels';

/**
 * Brings the main window to the front. `window.focus()` isn't enough: while Tipeline runs in
 * the menu bar / tray the window is hidden, and only the main process can show it again
 * (a notification click must open the window, not just change its page).
 */
export function bringToFront(): void {
  void window.ipcRenderer?.invoke(SEND.WINDOW_SHOW);
}
