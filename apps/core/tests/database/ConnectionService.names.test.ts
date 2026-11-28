import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { ConnectionService } from '@database/services/ConnectionService';

// Real (in-memory) SQLite: a remote is picked by its name, so names must stay unique.
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
afterAll(() => knex.destroy());

beforeEach(async () => {
  await knex('connections').del();
  await knex('settings').del();
});

describe('ConnectionService names', () => {
  it('refuses a name already used, ignoring case and spaces', async () => {
    await ConnectionService.add('office', 'ws://10.0.0.1:4000', 't');
    await expect(ConnectionService.add(' Office ', 'ws://10.0.0.2:4000', 't')).rejects.toThrow(
      'A connection named "Office" already exists'
    );
    expect(await ConnectionService.list()).toHaveLength(1);
  });

  it('refuses "local" and an empty name', async () => {
    await expect(ConnectionService.add('Local', 'ws://10.0.0.1:4000', 't')).rejects.toThrow('"local" means this machine');
    await expect(ConnectionService.add('  ', 'ws://10.0.0.1:4000', 't')).rejects.toThrow('Give the connection a name');
  });

  it('renaming to a used name is refused, keeping its own is fine', async () => {
    const a = await ConnectionService.add('a', 'ws://10.0.0.1:4000', 't');
    await ConnectionService.add('b', 'ws://10.0.0.2:4000', 't');
    await expect(ConnectionService.update(a.id, { name: 'B' })).rejects.toThrow('already exists');
    expect((await ConnectionService.update(a.id, { name: 'A' })).name).toBe('A');
  });

  it('switching by a name two saved connections share asks for an ID', async () => {
    await knex('connections').insert([
      { id: 'c1', name: 'self', host: 'ws://a', token: 't' },
      { id: 'c2', name: 'self', host: 'ws://b', token: 't' },
    ]);
    await expect(ConnectionService.setActive('self')).rejects.toThrow(
      '2 connections are named "self". Use one\'s ID instead: c1, c2'
    );
    await ConnectionService.setActive('c2');
    expect(await ConnectionService.getActiveId()).toBe('c2');
  });

  it('switches by name, ignoring case', async () => {
    const office = await ConnectionService.add('Office', 'ws://10.0.0.1:4000', 't');
    await ConnectionService.setActive('office');
    expect(await ConnectionService.getActiveId()).toBe(office.id);
  });
});
