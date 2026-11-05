import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/TaskService', () => ({
  TaskService: { install: vi.fn() },
}));

import Core from '@engine/Core';
import { ActionFactory } from '@action/ActionFactory';
import { TaskService } from '@database/services/TaskService';
import { Parser } from '@utils/Parser';
import { TaskValidator } from '@validation/TaskValidation';

const workflow = (actions: unknown[]) =>
  JSON.stringify({
    name: 'Check',
    version: '1.0.0',
    author: 'Test',
    description: 'Check',
    pipeline: { actions },
  });

const message = (text: string) => ({ group: 'system', name: 'message', params: { text } });

beforeEach(() => {
  vi.mocked(TaskService.install)
    .mockReset()
    .mockImplementation(async (data: any) => ({ identifier: 'wf-1', name: data.name }) as any);
  vi.spyOn(ActionFactory, 'actionTypeIsKnown').mockResolvedValue(true);
});

describe('installing a workflow checks its step params', () => {
  it('installs valid steps', async () => {
    await Core.taskInstallFromContent(workflow([message('hello')]));
    expect(TaskService.install).toHaveBeenCalledTimes(1);
  });

  it('refuses a condition without compareAs, with a readable message', async () => {
    const content = workflow([
      {
        group: 'flow',
        name: 'ifConditional',
        params: { firstOperand: '{{ a }}', operator: 'eq', secondOperand: 'b', actions: [] },
      },
    ]);

    const error: Error = await Core.taskInstallFromContent(content).catch((e) => e);

    expect(error.message).toContain('flow.ifConditional at pipeline.actions[0]');
    expect(error.message).toContain('compareAs: Required.');
    expect(error.message).not.toContain('condition.compareAs');
    expect(TaskService.install).not.toHaveBeenCalled();
  });

  it('finds a bad step nested inside a block', async () => {
    const content = workflow([
      {
        group: 'flow',
        name: 'ifConditional',
        params: {
          firstOperand: '{{ a }}',
          compareAs: 'string',
          operator: 'eq',
          secondOperand: 'b',
          actions: [{ group: 'file', name: 'read', params: { path: '/tmp/wrong-name.txt' } }],
        },
      },
    ]);

    await expect(Core.taskInstallFromContent(content)).rejects.toThrow(
      'file.read at pipeline.actions[0].params.actions[0]'
    );
    expect(TaskService.install).not.toHaveBeenCalled();
  });

  it('refuses before installing any sub-workflow', async () => {
    const taskInstall = vi.spyOn(Core, 'taskInstall');
    const content = workflow([
      { group: 'subtask', name: 'exec', params: { path: './child.yml' } },
      { group: 'file', name: 'read', params: { path: '/tmp/wrong-name.txt' } },
    ]);

    await expect(Core.taskInstallFromContent(content, '/tmp')).rejects.toThrow('file.read');
    expect(taskInstall).not.toHaveBeenCalled();
    taskInstall.mockRestore();
  });
});

describe('shipped example workflows', () => {
  const EXAMPLES = path.resolve(__dirname, '../../../../examples');
  const workflowFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return workflowFiles(file);
      return /\.ya?ml$/.test(entry.name) ? [file] : [];
    });

  const files = workflowFiles(EXAMPLES).flatMap((file) => {
    try {
      const parsed: any = Parser.importFromFile(file);
      return Array.isArray(parsed?.pipeline?.actions)
        ? [{ name: path.relative(EXAMPLES, file), actions: parsed.pipeline.actions }]
        : [];
    } catch {
      return [];
    }
  });

  it('finds the examples', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files)('$name has valid step params', async ({ actions }) => {
    expect(await TaskValidator.validateActionTypes(actions, undefined, { params: true })).toEqual([]);
  });
});
