import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HubService, OFFICIAL_HUB } from '@database/services/HubService';
import { Hub } from '@database/models/Hub';

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

describe('official hub', () => {
  it('is added on first start, enabled, under its fixed id', async () => {
    await HubService.ensureOfficialHub();
    const hub = await HubService.getById(OFFICIAL_HUB.id);
    expect(hub).toMatchObject({ name: 'Tipeline Hub', type: 'remote', target: 'https://hub.tipeline.com' });
    expect(!!hub!.enabled).toBe(true);
  });

  it('is listed before the hubs the user adds', async () => {
    await HubService.add({ name: 'Mine', type: 'remote', target: 'https://example.com' });
    const ids = (await HubService.list()).map((h) => h.id);
    expect(ids[0]).toBe(OFFICIAL_HUB.id);
    expect(ids).toHaveLength(2);
  });

  it('keeps being switched off across starts, and is not added twice', async () => {
    await HubService.setEnabled(OFFICIAL_HUB.id, false);
    await HubService.ensureOfficialHub();
    const rows = await Hub.query().where({ id: OFFICIAL_HUB.id });
    expect(rows).toHaveLength(1);
    expect(!!rows[0].enabled).toBe(false);
  });

  it('follows the address that ships with this release', async () => {
    await Hub.query().patch({ target: 'https://old.example.com', name: 'Old' }).where({ id: OFFICIAL_HUB.id });
    await HubService.ensureOfficialHub();
    const hub = await HubService.getById(OFFICIAL_HUB.id);
    expect(hub).toMatchObject({ name: OFFICIAL_HUB.name, target: OFFICIAL_HUB.target });
    expect(!!hub!.enabled).toBe(false);
  });

  it("can't be edited or removed", async () => {
    await expect(HubService.update(OFFICIAL_HUB.id, { name: 'Renamed' })).rejects.toThrow(/built in/);
    await expect(HubService.remove(OFFICIAL_HUB.id)).rejects.toThrow(/built in/);
    expect(await HubService.getById(OFFICIAL_HUB.id)).not.toBeNull();
  });
});
