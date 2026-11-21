import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkAllHubs } = vi.hoisted(() => ({ checkAllHubs: vi.fn() }));
vi.mock('@/hub/HubSyncService', () => ({ HubSyncService: { checkAllHubs } }));

import {
  DEFAULT_HUB_CHECK_INTERVAL,
  HUB_CHECK_INTERVAL_SETTING,
  HubPoller,
  hubCheckInterval,
} from '@engine/HubPoller';
import Core from '@engine/Core';
import { SettingsService } from '@database/services/SettingsService';

// Real settings table; only the hub check itself is replaced, since what's tested is when it runs.
const MINUTE = 60 * 1000;
let knex: Knex;

beforeAll(async () => {
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);
});
afterAll(async () => {
  await knex.destroy();
});

beforeEach(async () => {
  await knex('settings').where('key', HUB_CHECK_INTERVAL_SETTING).del();
  checkAllHubs.mockReset().mockResolvedValue([]);
  vi.useFakeTimers();
});
afterEach(() => {
  HubPoller.stop();
  vi.useRealTimers();
});

describe('HubPoller', () => {
  it('checks at start and then every hour by default', async () => {
    expect(await hubCheckInterval()).toBe(DEFAULT_HUB_CHECK_INTERVAL);
    await HubPoller.start();
    expect(checkAllHubs).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(59 * MINUTE);
    expect(checkAllHubs).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MINUTE);
    expect(checkAllHubs).toHaveBeenCalledTimes(2);
  });

  it('follows the saved interval', async () => {
    await SettingsService.set(HUB_CHECK_INTERVAL_SETTING, '15m');
    await HubPoller.start();
    vi.advanceTimersByTime(45 * MINUTE);
    expect(checkAllHubs).toHaveBeenCalledTimes(4);
  });

  it('"only when I check" never checks on its own, not even at start', async () => {
    await SettingsService.set(HUB_CHECK_INTERVAL_SETTING, 'manual');
    await HubPoller.start();
    vi.advanceTimersByTime(48 * 60 * MINUTE);
    expect(checkAllHubs).not.toHaveBeenCalled();
  });

  it('an unknown saved value keeps checking hourly rather than stopping', async () => {
    await SettingsService.set(HUB_CHECK_INTERVAL_SETTING, 'often');
    expect(await hubCheckInterval()).toBe('1h');
  });

  it('a changed setting applies at once, without a restart', async () => {
    await HubPoller.start();
    checkAllHubs.mockClear();

    await Core.settingsSet(HUB_CHECK_INTERVAL_SETTING, '15m');
    vi.advanceTimersByTime(15 * MINUTE);
    expect(checkAllHubs).toHaveBeenCalledTimes(1);

    await Core.settingsSet(HUB_CHECK_INTERVAL_SETTING, 'manual');
    vi.advanceTimersByTime(24 * 60 * MINUTE);
    expect(checkAllHubs).toHaveBeenCalledTimes(1);
  });

  it('refuses a value that is not one of the choices', async () => {
    await expect(Core.settingsSet(HUB_CHECK_INTERVAL_SETTING, '5m')).rejects.toThrow(/15m, 1h, 6h, 24h, manual/);
    expect(await SettingsService.get(HUB_CHECK_INTERVAL_SETTING)).toBeNull();
  });
});
