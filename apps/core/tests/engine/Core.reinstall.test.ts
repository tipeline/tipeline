import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import Core from '@engine/Core';
import { TaskService } from '@database/services/TaskService';

// Installing a workflow file that is already installed, against a real database: what
// counts as a match, what counts as edited, Replace, and the silent reuse apps and
// sub-workflow steps do.
let knex: Knex;
let dir: string;

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
  await knex('task').del();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reinstall-'));
});

const workflowYaml = (name: string, text = 'hello', tags: string[] = ['example']) => `name: ${name}
description: Test
tags: [${tags.join(', ')}]
pipeline:
  variables:
    - type: string
      name: out
      value: ''
  actions:
    - group: string
      name: camelCase
      params:
        string: ${text}
      destination:
        variable: out
`;

const write = (name: string, content: string) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
};

const editSource = async (identifier: string) => {
  const task = await TaskService.getByIdentifier(identifier);
  const source = JSON.parse(task.source);
  source.description = 'Changed in the builder';
  await Core.taskUpdateSource(identifier, JSON.stringify(source));
};

describe('file install matches', () => {
  it('finds nothing the first time, then the same file as unchanged', async () => {
    const yaml = workflowYaml('Array Demo');
    expect(await Core.taskInstallMatches(yaml)).toEqual([]);

    const installed = await Core.taskInstallFromContent(yaml, dir);
    const [match] = await Core.taskInstallMatches(yaml);
    expect(match).toMatchObject({ identifier: installed.identifier, name: 'Array Demo', sameFile: true, edited: false });
  });

  it('marks the workflow as edited once it is changed after the install', async () => {
    const yaml = workflowYaml('Array Demo');
    const installed = await Core.taskInstallFromContent(yaml, dir);
    await editSource(installed.identifier);

    const [match] = await Core.taskInstallMatches(yaml);
    expect(match).toMatchObject({ identifier: installed.identifier, sameFile: true, edited: true });
  });

  it('matches by name (any case) when the file changed, and builder-made workflows too', async () => {
    const installed = await Core.taskInstallFromContent(workflowYaml('Array Demo', 'v1'), dir);
    const made = await TaskService.install({ name: 'array demo  ', source: JSON.stringify({ name: 'array demo' }) });

    const matches = await Core.taskInstallMatches(workflowYaml('Array Demo', 'v2'));
    expect(matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ identifier: installed.identifier, sameFile: false, edited: false }),
        expect.objectContaining({ identifier: made.identifier, sameFile: false, edited: null }),
      ])
    );
    expect(await Core.taskInstallMatches(workflowYaml('Something Else'))).toEqual([]);
  });

  it('a copy is still a separate workflow (install without asking)', async () => {
    const yaml = workflowYaml('Array Demo');
    const a = await Core.taskInstallFromContent(yaml, dir);
    const b = await Core.taskInstallFromContent(yaml, dir);
    expect(a.identifier).not.toBe(b.identifier);
    expect(await Core.taskInstallMatches(yaml)).toHaveLength(2);
  });
});

describe('Replace (reload from the file)', () => {
  it('keeps the identifier, takes the file contents and tags, and counts as unchanged again', async () => {
    const installed = await Core.taskInstallFromContent(workflowYaml('Array Demo', 'v1', ['old']), dir);
    await editSource(installed.identifier);

    const newer = workflowYaml('Array Demo', 'v2', ['fresh']);
    await Core.taskReloadContent(installed.identifier, newer, dir);

    const task = await TaskService.getByIdentifier(installed.identifier);
    expect(JSON.parse(task.source).pipeline.actions[0].params.string).toBe('v2');
    expect(task.tags).toEqual(['fresh']);
    const [match] = await Core.taskInstallMatches(newer);
    expect(match).toMatchObject({ identifier: installed.identifier, sameFile: true, edited: false });

    const origins = (await Core.taskRevisionList(installed.identifier)).map((r: any) => r.origin);
    expect(origins).toEqual(['reload', 'edit', 'created']);
  });

  it('without a folder (from elsewhere) still refuses files beside it', async () => {
    const installed = await Core.taskInstallFromContent(workflowYaml('Parent'), dir);
    const withChild = `name: Parent
description: Test
pipeline:
  actions:
    - group: subtask
      name: exec
      params:
        path: ./child.yml
`;
    await expect(Core.taskReloadContent(installed.identifier, withChild)).rejects.toThrow();
  });
});

describe('silent reuse for apps and sub-workflow steps', () => {
  // The real example: apps keep only the workflows their pages use.
  const DASHBOARD = path.resolve(__dirname, '../../../../examples/apps/simple-dashboard.yml');

  it('an app reuses the bundled workflow until it is edited, then installs a fresh one', async () => {
    const idOf = (app: any) => JSON.parse(app.source).workflows.listRecords.identifier;
    const first = await Core.appInstall(DASHBOARD);
    const second = await Core.appInstall(DASHBOARD);
    expect(idOf(second)).toBe(idOf(first));

    await editSource(idOf(first));
    const third = await Core.appInstall(DASHBOARD);
    expect(idOf(third)).not.toBe(idOf(first));
    // The edited one is left as it was.
    expect((await TaskService.getByIdentifier(idOf(first))).description).toBe('Changed in the builder');
  });

  it('a sub-workflow file is installed once across installs, and again after it is edited', async () => {
    write('child.yml', workflowYaml('Child'));
    const parent = write(
      'parent.yml',
      `name: Parent
description: Test
pipeline:
  actions:
    - group: subtask
      name: exec
      params:
        path: ./child.yml
`
    );
    const childOf = async (identifier: string) =>
      JSON.parse((await TaskService.getByIdentifier(identifier)).source).pipeline.actions[0].params.identifier;

    const p1 = await Core.taskInstall(parent);
    const p2 = await Core.taskInstall(parent);
    expect(await childOf(p2.identifier)).toBe(await childOf(p1.identifier));
    expect((await knex('task').where({ name: 'Child' })).length).toBe(1);

    await editSource(await childOf(p1.identifier));
    const p3 = await Core.taskInstall(parent);
    expect(await childOf(p3.identifier)).not.toBe(await childOf(p1.identifier));
  });
});
