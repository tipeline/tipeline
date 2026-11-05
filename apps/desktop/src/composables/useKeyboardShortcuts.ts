import { onMounted, onUnmounted, toValue, type MaybeRefOrGetter } from 'vue';

export interface KeyboardShortcut {
  /** KeyboardEvent.key to match, case-insensitively (e.g. 'j', 'Enter'). */
  key: string;
  /** Require Cmd (macOS) or Ctrl (other platforms). Exact match: absent means Cmd/Ctrl must NOT be held. */
  meta?: boolean;
  /** Require Shift. Exact match: absent means Shift must NOT be held. */
  shift?: boolean;
  handler: (e: KeyboardEvent) => void;
  /** Shortcut only fires while this is true. Defaults to always enabled. */
  enabled?: MaybeRefOrGetter<boolean>;
  /**
   * Skip while focus is on a text input/textarea/select/contenteditable.
   * Needed for letter shortcuts like Cmd+E or Ctrl+F, which are also native
   * cursor-movement bindings inside macOS text fields.
   */
  skipWhenEditable?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Registers a set of window-level keydown shortcuts for the lifetime of the
 * calling component. Shortcuts are matched in order; the first match wins.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  function onKeydown(e: KeyboardEvent) {
    for (const shortcut of shortcuts) {
      if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;
      if (!!shortcut.meta !== (e.metaKey || e.ctrlKey)) continue;
      if (!!shortcut.shift !== e.shiftKey) continue;
      if (shortcut.skipWhenEditable && isEditableTarget(e.target)) continue;
      if (shortcut.enabled !== undefined && !toValue(shortcut.enabled)) continue;

      e.preventDefault();
      shortcut.handler(e);
      return;
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown));
}
