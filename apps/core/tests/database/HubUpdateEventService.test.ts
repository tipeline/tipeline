import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { HubUpdateEventService } from '@database/services/HubUpdateEventService';

// Real in-memory SQLite with the real migrations, like an upgraded install.
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
  await knex('hub').insert({ id: 'hub-1', name: 'Team Hub', type: 'local_folder', target: '/x', enabled: true });
});
afterAll(() => knex.destroy());

const item = { type: 'task' as const, identifier: 'wf-1', name: 'Hello', hubName: 'Team Hub', fromVersion: '1.0.0' };

async function installWorkflow() {
  const [id] = await knex('task').insert({ identifier: 'wf-1', name: 'Hello', source: '{}' });
  await knex('task_hub_link').insert({ task_id: id, hub_id: 'hub-1', hub_task_identifier: 'hello' });
  return id;
}

beforeEach(async () => {
  await knex('hub_update_event').del();
  await knex('task_hub_link').del();
  await knex('task').del();
  await installWorkflow();
});

describe('HubUpdateEventService', () => {
  it('keeps one row however many hourly checks report the same thing', async () => {
    await HubUpdateEventService.setAttention(item, { kind: 'major_waiting', toVersion: '2.0.0' });
    await HubUpdateEventService.markAllRead();
    await HubUpdateEventService.setAttention(item, { kind: 'major_waiting', toVersion: '2.0.0' });

    const rows = await HubUpdateEventService.list();
    expect(rows).toHaveLength(1);
    // Still read: the same news doesn't light the badge again.
    expect(rows[0].read_at).toBeTruthy();
  });

  it('replaces the row when the situation changes', async () => {
    await HubUpdateEventService.setAttention(item, { kind: 'major_waiting', toVersion: '2.0.0' });
    await HubUpdateEventService.setAttention(item, { kind: 'major_waiting', toVersion: '3.0.0' });

    const rows = await HubUpdateEventService.list();
    expect(rows.map((r) => r.to_version)).toEqual(['3.0.0']);
    expect(rows[0].read_at).toBeFalsy();
  });

  it('removes the request once it is over', async () => {
    await HubUpdateEventService.setAttention(item, { kind: 'older_listed', toVersion: '0.9.0' });
    await HubUpdateEventService.setAttention(item, null);
    expect(await HubUpdateEventService.list()).toEqual([]);
  });

  it('an update replaces the request with history', async () => {
    await HubUpdateEventService.setAttention(item, { kind: 'major_waiting', toVersion: '2.0.0' });
    await HubUpdateEventService.recordUpdated(item, '2.0.0');

    const rows = await HubUpdateEventService.list();
    expect(rows.map((r) => [r.kind, r.from_version, r.to_version])).toEqual([['updated', '1.0.0', '2.0.0']]);
    expect(rows[0].read_at).toBeFalsy();
  });

  it("an update the user started doesn't need announcing", async () => {
    await HubUpdateEventService.recordUpdated(item, '2.0.0', true);
    expect((await HubUpdateEventService.list())[0].read_at).toBeTruthy();
  });

  it('records nothing when the version stayed the same', async () => {
    await HubUpdateEventService.recordUpdated(item, '1.0.0');
    expect(await HubUpdateEventService.list()).toEqual([]);
  });

  it('drops requests about a deleted item but keeps its history', async () => {
    await HubUpdateEventService.recordUpdated(item, '1.1.0');
    await HubUpdateEventService.setAttention(item, { kind: 'major_waiting', toVersion: '2.0.0' });
    await knex('task').where({ identifier: 'wf-1' }).del();

    const rows = await HubUpdateEventService.list();
    expect(rows.map((r) => r.kind)).toEqual(['updated']);
  });

  it('drops requests about an item that left its hub', async () => {
    await HubUpdateEventService.setAttention(item, { kind: 'failed', message: 'nope' });
    await knex('task_hub_link').del();
    expect(await HubUpdateEventService.list()).toEqual([]);
  });
});
