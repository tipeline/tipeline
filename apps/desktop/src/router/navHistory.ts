import { reactive } from 'vue';
import type { RouterHistory } from 'vue-router';

/**
 * Back/forward state for the in-app history.
 *
 * The router runs on memory history (there is no browser URL in Electron), so nothing tells
 * the UI whether there is anywhere to go back or forward to. `trackHistory` wraps the history
 * object and mirrors its position here. Wrapping (rather than listening to the router) also
 * catches navigations a guard cancels: the router then calls `go(-delta, false)` to undo the
 * move, and that call goes through the wrapper too.
 */
export interface NavEntry {
  /** Name of the page at this entry, filled in by the header while the page is shown. */
  label: string;
}

export const navHistory = reactive({
  /** Index of the current entry in the history list. */
  position: 0,
  /** One entry per history step; the router's own list is the same length. */
  entries: [{ label: '' }] as NavEntry[],
  /** Entries below this index can't be gone back to (earlier workspace). */
  floor: 0,
});

export function canGoBack(): boolean {
  return navHistory.position > navHistory.floor;
}

export function canGoForward(): boolean {
  return navHistory.position < navHistory.entries.length - 1;
}

export function backLabel(): string {
  return canGoBack() ? navHistory.entries[navHistory.position - 1].label : '';
}

export function forwardLabel(): string {
  return canGoForward() ? navHistory.entries[navHistory.position + 1].label : '';
}

/** Names the page at the current entry (shown in the Back/Forward button tooltips). */
export function setCurrentLabel(label: string) {
  const entry = navHistory.entries[navHistory.position];
  if (entry) entry.label = label;
}

/**
 * Stops Back from returning to pages shown before this point, for example after switching
 * workspace, when those items may not exist any more. Forward is dropped too.
 */
export function resetHistory() {
  navHistory.entries.splice(navHistory.position + 1);
  navHistory.floor = navHistory.position;
}

export function trackHistory(history: RouterHistory): RouterHistory {
  const { push, replace, go } = history;

  history.push = (to, state) => {
    push.call(history, to, state);
    navHistory.position++;
    navHistory.entries.splice(navHistory.position, Infinity, { label: '' });
  };

  history.replace = (to, state) => {
    replace.call(history, to, state);
    navHistory.entries.splice(navHistory.position, 1, { label: '' });
  };

  history.go = (delta, shouldTrigger) => {
    const target = navHistory.position + delta;
    // Never past the floor: Back from the first page of a workspace does nothing.
    if (delta < 0 && target < navHistory.floor) return;
    navHistory.position = Math.max(0, Math.min(target, navHistory.entries.length - 1));
    go.call(history, delta, shouldTrigger);
  };

  return history;
}
