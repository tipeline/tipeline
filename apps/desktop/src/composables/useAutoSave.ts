import { getCurrentInstance, onBeforeUnmount, reactive } from 'vue';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Thrown from a save function to show a message instead of saving (e.g. "enter a number"). */
export class InvalidValue extends Error {}

/**
 * Settings that save on their own, with a per-field state for `<SaveStatus>`.
 *
 * - `save(field, fn)` saves now (switches, selects, blur).
 * - `schedule(field, fn)` saves after a short pause in typing; a later call replaces it.
 * - `flush(field?)` saves anything still waiting (call it on blur). Leaving the page flushes too.
 *
 * Saves for one field run one after another, so an older save never lands after a newer one.
 * A failed save shows "Couldn't save" (the detail goes in `detail`); an `InvalidValue` shows its
 * own message and nothing is saved.
 */
export function useAutoSave(options: { delay?: number; savedFor?: number } = {}) {
  const delay = options.delay ?? 600;
  const savedFor = options.savedFor ?? 2000;

  const states = reactive<Record<string, SaveState>>({});
  const messages = reactive<Record<string, string>>({});
  const details = reactive<Record<string, string>>({});
  const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; fn: () => unknown }>();
  const savedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const chains = new Map<string, Promise<void>>();

  function save(field: string, fn: () => unknown): Promise<void> {
    const queued = waiting.get(field);
    if (queued) {
      clearTimeout(queued.timer);
      waiting.delete(field);
    }
    clearTimeout(savedTimers.get(field));
    states[field] = 'saving';
    delete messages[field];
    delete details[field];

    const next = (chains.get(field) ?? Promise.resolve()).then(async () => {
      try {
        await fn();
        // A newer save for this field may have started meanwhile; let it report.
        if (chains.get(field) !== next) return;
        states[field] = 'saved';
        savedTimers.set(
          field,
          setTimeout(() => {
            if (states[field] === 'saved') states[field] = 'idle';
          }, savedFor)
        );
      } catch (err) {
        if (chains.get(field) !== next) return;
        states[field] = 'error';
        if (err instanceof InvalidValue) messages[field] = err.message;
        else details[field] = String((err as Error)?.message ?? err);
      }
    });
    chains.set(field, next);
    return next;
  }

  function schedule(field: string, fn: () => unknown) {
    const queued = waiting.get(field);
    if (queued) clearTimeout(queued.timer);
    waiting.set(field, { fn, timer: setTimeout(() => void save(field, fn), delay) });
  }

  function flush(field?: string): Promise<void> {
    const fields = field ? [field] : [...waiting.keys()];
    return Promise.all(
      fields.map((f) => {
        const queued = waiting.get(f);
        return queued ? save(f, queued.fn) : Promise.resolve();
      })
    ).then(() => undefined);
  }

  /** What `<SaveStatus>` needs for one field: `v-bind="autoSave.status('x')"`. */
  function status(field: string) {
    return {
      state: states[field] ?? 'idle',
      message: messages[field],
      detail: details[field],
    };
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      void flush();
      for (const timer of savedTimers.values()) clearTimeout(timer);
    });
  }

  return { save, schedule, flush, status };
}
