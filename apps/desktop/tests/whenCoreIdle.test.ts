import { beforeEach, describe, expect, it, vi } from 'vitest';
import { whenCoreIdle, type WhenCoreIdleOptions } from '../src/composables/useWhenCoreIdle';

function setup(activeRuns: WhenCoreIdleOptions['activeRuns']) {
  const options = {
    activeRuns,
    onWaitingBriefly: vi.fn(),
    onAskUser: vi.fn(),
    onWaitingForRuns: vi.fn(),
    proceed: vi.fn(),
  };
  return { options, cancel: whenCoreIdle(options) };
}

describe('whenCoreIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('goes straight ahead with nothing running', async () => {
    const { options } = setup(async () => 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(options.proceed).toHaveBeenCalledExactlyOnceWith(false);
    expect(options.onWaitingBriefly).not.toHaveBeenCalled();
  });

  it('goes ahead if the run ends within the grace period, without asking', async () => {
    let active = 1;
    const { options } = setup(async () => active);
    await vi.advanceTimersByTimeAsync(2000);
    expect(options.onWaitingBriefly).toHaveBeenCalled();
    active = 0;
    await vi.advanceTimersByTimeAsync(1000);
    expect(options.proceed).toHaveBeenCalledExactlyOnceWith(false);
    expect(options.onAskUser).not.toHaveBeenCalled();
  });

  it('asks after 5 seconds and not before', async () => {
    const { options } = setup(async () => 2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(options.onAskUser).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(options.onAskUser).toHaveBeenCalledOnce();
    expect(options.onAskUser.mock.calls[0][0]).toBe(2);
    expect(options.proceed).not.toHaveBeenCalled();
  });

  it('interrupts when the user says so', async () => {
    const { options } = setup(async () => 1);
    await vi.advanceTimersByTimeAsync(5000);
    options.onAskUser.mock.calls[0][1].interrupt();
    expect(options.proceed).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('waits as long as it takes when the user says so, and goes ahead by itself', async () => {
    let active = 1;
    const { options } = setup(async () => active);
    await vi.advanceTimersByTimeAsync(5000);
    options.onAskUser.mock.calls[0][1].wait();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(options.proceed).not.toHaveBeenCalled();
    active = 0;
    await vi.advanceTimersByTimeAsync(1000);
    expect(options.proceed).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('can still interrupt while waiting, or give up', async () => {
    const first = setup(async () => 1);
    await vi.advanceTimersByTimeAsync(5000);
    first.options.onAskUser.mock.calls[0][1].wait();
    await vi.advanceTimersByTimeAsync(1000);
    first.options.onWaitingForRuns.mock.lastCall![1].interrupt();
    expect(first.options.proceed).toHaveBeenCalledExactlyOnceWith(true);

    const second = setup(async () => 1);
    await vi.advanceTimersByTimeAsync(5000);
    second.options.onAskUser.mock.calls[0][1].wait();
    await vi.advanceTimersByTimeAsync(1000);
    second.options.onWaitingForRuns.mock.lastCall![1].cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(second.options.proceed).not.toHaveBeenCalled();
  });

  it('counts a Core that cannot count as busy', async () => {
    const { options } = setup(async () => undefined);
    await vi.advanceTimersByTimeAsync(5000);
    expect(options.onAskUser.mock.calls[0][0]).toBe(1);
    expect(options.proceed).not.toHaveBeenCalled();
  });

  it('goes ahead when Core is gone, leaving nothing to wait for', async () => {
    const { options } = setup(async () => {
      throw new Error('gone');
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(options.proceed).toHaveBeenCalledExactlyOnceWith(false);
  });
});
