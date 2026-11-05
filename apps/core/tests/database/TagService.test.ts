import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { taskSchema } from '@tipeline/schemas';
import { TagService } from '@database/services/TagService';
import { TaskService } from '@database/services/TaskService';

const migrations = { directory: path.resolve(__dirname, '../../src/database/migrations') };
const source = JSON.stringify({ name: 'Flow', pipeline: { variables: [], actions: [] } });

describe('TagService (tags are lowercase)', () => {
  let knex: Knex;

  beforeAll(async () => {
    knex = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true, migrations });
    await knex.migrate.latest();
    await knex.raw('PRAGMA foreign_keys = ON');
    Model.knex(knex);
  });
  afterAll(() => knex.destroy());

  beforeEach(async () => {
    for (const table of ['task_tag', 'tag', 'task']) await knex(table).del();
  });

  it('lowercases, trims and drops repeats and empties', () => {
    expect(TagService.normalizeLabels(['Hola', ' hola ', 'HOLA', '', '  ', 'Mundo'])).toEqual(['hola', 'mundo']);
  });

  it('keeps only letters (any language), numbers, single spaces and hyphens', () => {
    expect(
      TagService.normalizeLabels(['testasd@$@#$', 'Heart  Rate!', 'content--types', ' -ip-addresses- ', 'Programación', 'e\u0301xito', 'node.js', '#$%', 'año 2026'])
    ).toEqual(['testasd', 'heart rate', 'content-types', 'ip-addresses', 'programación', 'éxito', 'nodejs', 'año 2026']);
  });

  it('refuses a tag with no letters or numbers on the Tags page', async () => {
    await expect(TagService.create('@#$')).rejects.toThrow('Tag label is required');
  });

  it('saves a workflow\'s tags lowercase, sharing a tag with any casing typed later', async () => {
    const first = await TaskService.install({ name: 'One', version: '1.0.0', tags: ['Hola'], source });
    const second = await TaskService.install({ name: 'Two', version: '1.0.0', tags: ['HOLA', 'hola'], source });

    expect(first.tags).toEqual(['hola']);
    expect(second.tags).toEqual(['hola']);
    expect(await knex('tag').pluck('label')).toEqual(['hola']);
  });

  it('creates and renames lowercase, refusing only a name that is really taken', async () => {
    const tag = await TagService.create('Hola');
    expect(tag.label).toBe('hola');
    await expect(TagService.create('HOLA')).rejects.toThrow('Tag "hola" already exists');

    expect((await TagService.rename(tag.id, 'Mundo')).label).toBe('mundo');
    expect((await TagService.rename(tag.id, 'MUNDO')).label).toBe('mundo');
  });

  it('lowercases tags in a workflow file instead of rejecting repeats', () => {
    const parsed = taskSchema.parse({ name: 'Flow', description: 'Test', tags: ['Urgent', 'urgent', 'API'], pipeline: { actions: [] } });
    expect(parsed.tags).toEqual(['urgent', 'api']);
  });
});
