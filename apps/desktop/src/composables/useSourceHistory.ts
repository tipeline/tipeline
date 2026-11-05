import { ref, computed, toRaw, type Ref } from 'vue';

// Steps kept to go back. Each is a whole workflow source; they're small.
const MAX_STEPS = 100;

const snapshot = (value: unknown) => JSON.stringify(toRaw(value) ?? null);

/**
 * Undo/redo for the builder: a stack of whole-source snapshots, taken when a change
 * is saved (autosave already groups a burst of edits into one save) or right before
 * an undo, so an edit that hasn't been autosaved yet can still be undone.
 *
 * `current` is the snapshot of what's in the editor as far as history knows; a
 * snapshot that matches it records nothing, so saving an undone state doesn't add
 * a step.
 */
export function useSourceHistory(source: Ref<any>) {
  const past = ref<string[]>([]);
  const future = ref<string[]>([]);
  let current: string | null = null;

  /** Starts over from what's loaded now (a freshly opened workflow). */
  function reset() {
    past.value = [];
    future.value = [];
    current = source.value ? snapshot(source.value) : null;
  }

  /** Takes what's in the editor now as a step, if it changed. */
  function record() {
    if (!source.value) return;
    const now = snapshot(source.value);
    if (current === null) {
      current = now;
      return;
    }
    if (now === current) return;
    past.value.push(current);
    if (past.value.length > MAX_STEPS) past.value.shift();
    future.value = [];
    current = now;
  }

  /**
   * The editor now holds the same change in another form (core's normalized copy
   * after a save): follow it without adding a step.
   */
  function sync() {
    if (source.value) current = snapshot(source.value);
  }

  function apply(next: string) {
    current = next;
    source.value = JSON.parse(next);
  }

  /** Goes back one step. Returns false when there's nothing to undo. */
  function undo(): boolean {
    record();
    const previous = past.value.pop();
    if (previous === undefined || current === null) return false;
    future.value.push(current);
    apply(previous);
    return true;
  }

  /** Goes forward one undone step. Returns false when there's nothing to redo. */
  function redo(): boolean {
    record();
    const next = future.value.pop();
    if (next === undefined || current === null) return false;
    past.value.push(current);
    apply(next);
    return true;
  }

  return {
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    reset,
    record,
    sync,
    undo,
    redo,
  };
}
