const GRACE_MS = 5000;
const POLL_MS = 1000;

export interface WhenCoreIdleOptions {
  /** Throws when Core can't be reached, which means nothing is left to wait for. */
  activeRuns: () => Promise<number | undefined>;
  onWaitingBriefly: (count: number) => void;
  /** Runs are still going after the grace period: the user picks interrupt or wait. */
  onAskUser: (count: number, choose: { interrupt: () => void; wait: () => void }) => void;
  onWaitingForRuns: (count: number, choose: { interrupt: () => void; cancel: () => void }) => void;
  /** Runs what needed Core idle. `interrupt` says the user agreed to end what's still running. */
  proceed: (interrupt: boolean) => void;
}

/**
 * Before stopping Core: gives active runs a moment to end, then lets the user choose. Only asks
 * and polls, so Core keeps working normally for as long as this takes. If the app closes while
 * waiting nothing happens, and the next launch offers it again.
 */
export function whenCoreIdle(options: WhenCoreIdleOptions): () => void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const finish = (interrupt: boolean) => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    options.proceed(interrupt);
  };

  const cancel = () => {
    done = true;
    if (timer) clearTimeout(timer);
  };

  const poll = async (onBusy: (count: number) => void) => {
    if (done) return;
    let active: number | undefined;
    try {
      active = await options.activeRuns();
    } catch {
      finish(false);
      return;
    }
    if (done) return;
    if (active === 0) finish(false);
    // Core that can't count isn't known to be idle, so it counts as one run.
    else onBusy(active ?? 1);
  };

  const waitForRuns = () => {
    if (done) return;
    if (timer) clearTimeout(timer);
    const tick = () =>
      poll((count) => {
        options.onWaitingForRuns(count, { interrupt: () => finish(true), cancel });
        timer = setTimeout(tick, POLL_MS);
      });
    tick();
  };

  const deadline = Date.now() + GRACE_MS;
  const tick = () =>
    poll((count) => {
      if (Date.now() >= deadline) {
        options.onAskUser(count, { interrupt: () => finish(true), wait: waitForRuns });
        return;
      }
      options.onWaitingBriefly(count);
      timer = setTimeout(tick, POLL_MS);
    });
  tick();

  return cancel;
}
