import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { GroupSubtask } from '@/action/actions/subtask/actions';
import { TaskFactory } from '@task/TaskFactory';
import { Task } from '@task/Task';
import { Variable } from '@variable/Variable';

// Real child runs against an in-memory database: a cached sub-workflow must hand the
// parent the same values a real run would.
let knex: Knex;

beforeAll(async () => {
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);
});
afterAll(() => knex.destroy());

const child = (cache?: unknown) => ({
  name: 'Greeting',
  description: 'Says hello',
  ...(cache ? { cache } : {}),
  pipeline: {
    variables: [
      { name: 'who', type: 'string', value: 'world', visibility: 'public' },
      { name: 'greeting', type: 'string', value: '', visibility: 'public' },
    ],
    actions: [{ group: 'variable', name: 'set', params: { name: 'greeting', value: 'Hello {{ who }}' } }],
  },
});

beforeEach(async () => {
  await knex('cache_entries').del();
  await knex('task').del();
  vi.restoreAllMocks();
});

function parent(mode?: 'use' | 'refresh') {
  const task = new Task();
  task.setIdentifier('parent');
  task.setCorrelationId('corr-parent');
  task.setCacheMode(mode);
  task.getPipeline().setVariables([new Variable({ name: 'text', type: 'string', value: '' } as any)]);
  return task;
}

const call = (task: Task, who: string) =>
  GroupSubtask.exec({ identifier: 'greet', props: { who }, outputs: { text: 'greeting' } } as any, task);

describe('subtask.exec — workflow cache', () => {
  it('hands back the stored outputs for the same props without running the child', async () => {
    await knex('task').insert({ identifier: 'greet', name: 'Greeting', source: JSON.stringify(child({ ttl: '5m' })) });
    const build = vi.spyOn(TaskFactory, 'fromSource');

    const first = parent();
    await call(first, 'Ada');
    expect(first.getPipeline().getVariableByName('text')?.getValue()).toBe('Hello Ada');

    const second = parent();
    const result = await call(second, 'Ada');
    expect(second.getPipeline().getVariableByName('text')?.getValue()).toBe('Hello Ada');
    expect(result).toMatchObject({ taskIdentifier: 'greet', cached: true });
    expect(build).toHaveBeenCalledTimes(1);

    await call(parent(), 'Grace');
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('runs the child every time when it has no cache setting, or when refreshing', async () => {
    await knex('task').insert({ identifier: 'greet', name: 'Greeting', source: JSON.stringify(child()) });
    const build = vi.spyOn(TaskFactory, 'fromSource');
    await call(parent(), 'Ada');
    await call(parent(), 'Ada');
    expect(build).toHaveBeenCalledTimes(2);

    await knex('task').update({ source: JSON.stringify(child({ ttl: '5m' })) });
    await call(parent(), 'Ada');
    await call(parent('refresh'), 'Ada');
    expect(build).toHaveBeenCalledTimes(4);
  });
});
