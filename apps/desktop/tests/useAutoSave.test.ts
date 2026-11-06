import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidValue, useAutoSave } from '@/composables/useAutoSave';

describe('useAutoSave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows saving, then saved, then clears', async () => {
    const autoSave = useAutoSave({ savedFor: 2000 });
    let finish!: () => void;
    const done = autoSave.save('key', () => new Promise<void>((r) => (finish = r)));
    expect(autoSave.status('key').state).toBe('saving');
    await Promise.resolve();
    finish();
    await done;
    expect(autoSave.status('key').state).toBe('saved');
    vi.advanceTimersByTime(2000);
    expect(autoSave.status('key').state).toBe('idle');
  });

  it('waits for a pause in typing and saves only the last value', async () => {
    const autoSave = useAutoSave({ delay: 500 });
    const saved: string[] = [];
    for (const value of ['a', 'ab', 'abc']) {
      autoSave.schedule('key', () => saved.push(value));
      vi.advanceTimersByTime(200);
    }
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual(['abc']);
  });

  it('flush saves a waiting value at once, and nothing when none is waiting', async () => {
    const autoSave = useAutoSave({ delay: 500 });
    const fn = vi.fn();
    await autoSave.flush('key');
    expect(fn).not.toHaveBeenCalled();
    autoSave.schedule('key', fn);
    await autoSave.flush('key');
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs saves for one field in order and reports the newest', async () => {
    const autoSave = useAutoSave();
    const order: string[] = [];
    let finishFirst!: () => void;
    const first = autoSave.save('key', async () => {
      await new Promise<void>((r) => (finishFirst = r));
      order.push('first');
    });
    const second = autoSave.save('key', () => {
      order.push('second');
      throw new Error('disk full');
    });
    await Promise.resolve();
    finishFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
    expect(autoSave.status('key')).toEqual({ state: 'error', message: undefined, detail: 'disk full' });
  });

  it('shows the message of an invalid value', async () => {
    const autoSave = useAutoSave();
    await autoSave.save('key', () => {
      throw new InvalidValue('Enter a number above 0.');
    });
    expect(autoSave.status('key')).toMatchObject({ state: 'error', message: 'Enter a number above 0.' });
    await autoSave.save('key', () => undefined);
    expect(autoSave.status('key')).toMatchObject({ state: 'saved', message: undefined });
  });
});
