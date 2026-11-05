import { beforeEach, describe, expect, it, vi } from 'vitest';

const { service, marker, isPackaged, spawnChild } = vi.hoisted(() => ({
  service: {
    installed: false,
    desktop: false,
    matches: true,
    install: vi.fn(),
    start: vi.fn(),
  },
  marker: { exists: false, write: vi.fn() },
  isPackaged: { value: true },
  spawnChild: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return isPackaged.value;
    },
  },
}));
vi.mock('node:child_process', () => ({ spawn: spawnChild }));
vi.mock('node:net', () => ({
  default: {
    connect: () => {
      const handlers: Record<string, () => void> = {};
      queueMicrotask(() => handlers.connect?.());
      return {
        once: (name: string, fn: () => void) => (handlers[name] = fn),
        setTimeout: vi.fn(),
        destroy: vi.fn(),
      };
    },
  },
}));
vi.mock('node:fs', () => ({
  default: {
    existsSync: () => marker.exists,
    mkdirSync: vi.fn(),
    writeFileSync: marker.write,
    readFileSync: () => '{"version":"1.0.0"}',
  },
}));
vi.mock('@tipeline/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tipeline/utils')>()), generateIdentifier: () => 'id' }));
vi.mock('@tipeline/utils/coreProcess', () => ({ runningCorePid: () => null }));
vi.mock('@tipeline/utils/coreService', () => ({
  coreServiceIsDesktop: () => service.desktop,
  coreServiceMatches: () => service.matches,
  coreServiceSupport: () => ({ available: true, restartsOnCrash: true }),
  installCoreService: service.install,
  isCoreServiceInstalled: () => service.installed,
  resolveOnPath: () => 'node',
  startCoreService: service.start,
  uninstallCoreService: vi.fn(),
}));
const localRequest = vi.hoisted(() => vi.fn());
vi.mock('../electron/main/utils/CoreService', () => ({ CoreService: { localRequest } }));
vi.mock('../electron/main/utils/ipc-channels', () => ({ CORE: { STATUS: 'status', STOP: 'stop' } }));

const { checkCoreVersion, launchIfNeeded } = await import('../electron/main/utils/CoreLauncher');

describe('CoreLauncher auto-start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(service, { installed: false, desktop: false, matches: true });
    marker.exists = false;
    isPackaged.value = true;
    process.resourcesPath = '/app/Resources';
  });

  it('turns auto-start on the first time when nothing set it up', async () => {
    const result = await launchIfNeeded();

    expect(service.install).toHaveBeenCalled();
    expect(marker.write).toHaveBeenCalled();
    expect(result.autoStartTurnedOn).toBe(true);
  });

  it("leaves the CLI's auto-start alone on first open", async () => {
    service.installed = true;
    service.matches = false;

    const result = await launchIfNeeded();

    expect(service.install).not.toHaveBeenCalled();
    expect(marker.write).toHaveBeenCalled();
    expect(result.autoStartTurnedOn).toBe(false);
  });

  it("doesn't switch the CLI's auto-start back on later opens", async () => {
    marker.exists = true;
    service.installed = true;
    service.matches = false;

    await launchIfNeeded();

    expect(service.install).not.toHaveBeenCalled();
  });

  it('updates its own auto-start when the app moved', async () => {
    marker.exists = true;
    service.installed = true;
    service.desktop = true;
    service.matches = false;

    await launchIfNeeded();

    expect(service.install).toHaveBeenCalled();
  });

  describe('checkCoreVersion unsupervised', () => {
    const entry = '/app/Resources/core/dist/engine/Server.js';

    beforeEach(() => {
      service.installed = true;
      service.desktop = true;
    });

    it("is true for this app's own Core outside its service", async () => {
      localRequest.mockResolvedValue({ version: '1.0.0', supervised: false, entry });

      expect((await checkCoreVersion()).unsupervised).toBe(true);
    });

    it('is false for an up-to-date Core the CLI started', async () => {
      localRequest.mockResolvedValue({ version: '1.0.0', supervised: false, entry: '/npm/Server.js' });

      expect((await checkCoreVersion()).unsupervised).toBe(false);
    });

    it("is false when the auto-start is the CLI's", async () => {
      service.desktop = false;
      localRequest.mockResolvedValue({ version: '1.0.0', supervised: false, entry });

      expect((await checkCoreVersion()).unsupervised).toBe(false);
    });
  });
});
