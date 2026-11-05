import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEND } from '@/ipc-channels';

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ load: vi.fn().mockResolvedValue(undefined) }),
}));

const { useAppInit } = await import('@/composables/useAppInit');

const OLD = { outdated: true, running: '1.0.0', bundled: '1.1.0' };

function stubIpc(
  check: unknown,
  launch = { wasRunning: true },
  restart = { restarted: true }
) {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === SEND.CORE_LAUNCH) return launch;
    if (channel === SEND.CORE_VERSION_CHECK) return check;
    if (channel === SEND.CORE_RESTART) return restart;
    return {};
  });
  vi.stubGlobal('window', { ipcRenderer: { invoke } });
  const restarts = () =>
    invoke.mock.calls.filter(([c]) => c === SEND.CORE_RESTART).length;
  return { invoke, restarts };
}

describe('useAppInit outdated Core', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });

  async function runInit(app: ReturnType<typeof useAppInit>) {
    const done = app.init();
    await vi.advanceTimersByTimeAsync(5000);
    await done;
  }

  it('leaves a current Core alone', async () => {
    const { restarts } = stubIpc({ outdated: false });
    const app = useAppInit();
    await runInit(app);
    expect(restarts()).toBe(0);
    expect(app.coreUpdateOffer.value).toBeNull();
    expect(app.ready.value).toBe(true);
  });

  it('restarts an idle outdated Core without asking', async () => {
    const { restarts } = stubIpc({ ...OLD, activeRuns: 0 });
    const app = useAppInit();
    await runInit(app);
    expect(restarts()).toBe(1);
    expect(app.coreUpdateOffer.value).toBeNull();
  });

  it('offers instead of restarting while runs are active', async () => {
    const { restarts } = stubIpc({ ...OLD, activeRuns: 2 });
    const app = useAppInit();
    await runInit(app);
    expect(restarts()).toBe(0);
    expect(app.coreUpdateOffer.value).toEqual({
      running: '1.0.0',
      bundled: '1.1.0',
      activeRuns: 2,
    });
  });

  it('offers when the old Core cannot say how many runs are active', async () => {
    const { restarts } = stubIpc(OLD);
    const app = useAppInit();
    await runInit(app);
    expect(restarts()).toBe(0);
    expect(app.coreUpdateOffer.value?.activeRuns).toBeUndefined();
  });

  it('offers when the automatic restart fails, and only tries it once', async () => {
    const { restarts } = stubIpc(
      { ...OLD, activeRuns: 0 },
      { wasRunning: true },
      { restarted: false }
    );
    const app = useAppInit();
    await runInit(app);
    expect(app.coreUpdateOffer.value).not.toBeNull();
    await runInit(app);
    expect(restarts()).toBe(1);
  });

  it('moves an idle Core under the service, without offering anything', async () => {
    const { restarts } = stubIpc({ outdated: false, unsupervised: true, activeRuns: 0 });
    const app = useAppInit();
    await runInit(app);
    expect(restarts()).toBe(1);
    expect(app.coreUpdateOffer.value).toBeNull();
  });

  it('leaves a busy Core unsupervised, without offering anything', async () => {
    const { restarts } = stubIpc({ outdated: false, unsupervised: true, activeRuns: 1 });
    const app = useAppInit();
    await runInit(app);
    expect(restarts()).toBe(0);
    expect(app.coreUpdateOffer.value).toBeNull();
  });

  it('passes on that auto-start was just turned on', async () => {
    stubIpc({ outdated: false }, { wasRunning: false, autoStartTurnedOn: true } as any);
    const app = useAppInit();
    await runInit(app);
    expect(app.autoStartNotice.value).toBe(true);
  });

  describe('when Core goes away', () => {
    const stubAutoStart = (autoStart: unknown) => {
      const { invoke } = stubIpc({ outdated: false });
      const base = invoke.getMockImplementation()!;
      invoke.mockImplementation(async (channel: string) =>
        channel === SEND.AUTO_START_GET ? autoStart : base(channel)
      );
    };

    it('says it is reconnecting when the service will bring it back', async () => {
      stubAutoStart({ enabled: true, restartsOnCrash: true });
      const app = useAppInit();
      await app.handleCoreDown();
      expect(app.errorText.value).toBe('loader.coreReconnecting');
    });

    it.each([
      [{ enabled: false, restartsOnCrash: true }],
      [{ enabled: true, restartsOnCrash: false }],
    ])('keeps the plain message when nothing will bring it back (%o)', async (autoStart) => {
      stubAutoStart(autoStart);
      const app = useAppInit();
      await app.handleCoreDown();
      expect(app.errorText.value).toBe('loader.coreDown');
    });

    it('loads again by itself when Core is back', async () => {
      stubAutoStart({ enabled: true, restartsOnCrash: true });
      const app = useAppInit();
      await app.handleCoreDown();
      const back = app.handleCoreBack();
      await vi.advanceTimersByTimeAsync(5000);
      await back;
      expect(app.errorText.value).toBe('');
      expect(app.ready.value).toBe(true);
    });

    it('a reconnect that beats the auto-start reply is not overwritten', async () => {
      stubAutoStart({ enabled: true, restartsOnCrash: true });
      const app = useAppInit();
      const down = app.handleCoreDown();
      const back = app.handleCoreBack();
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.all([down, back]);
      expect(app.errorText.value).toBe('');
    });

    it('ignores a reconnect when no error is showing', async () => {
      const { invoke } = stubIpc({ outdated: false });
      await useAppInit().handleCoreBack();
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  it('skips the check for a Core this launch just started', async () => {
    const { invoke } = stubIpc(
      { ...OLD, activeRuns: 0 },
      { wasRunning: false }
    );
    await runInit(useAppInit());
    expect(invoke).not.toHaveBeenCalledWith(SEND.CORE_VERSION_CHECK);
  });

  it('a version check that fails does not stop the app', async () => {
    const { invoke } = stubIpc({ outdated: false });
    invoke.mockImplementationOnce(async () => ({ wasRunning: true }));
    invoke.mockImplementation(async (channel: string) => {
      if (channel === SEND.CORE_VERSION_CHECK) throw new Error('no reply');
      return {};
    });
    const app = useAppInit();
    await runInit(app);
    expect(app.ready.value).toBe(true);
  });
});
