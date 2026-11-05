import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@database/services/TaskService', () => ({
  TaskService: { getByIdentifier: vi.fn(), getAllWithSource: vi.fn() },
}));

import { TaskService } from '@database/services/TaskService';
import {
  capabilityIndex,
  capabilityReport,
  capabilitySummary,
  combinedCapabilityReport,
} from '@engine/WorkflowCapabilities';

const notify = {
  name: 'Notify',
  pipeline: { actions: [{ group: 'system', name: 'runApplication', params: {} }] },
};
const cleanup = {
  name: 'Clean up',
  pipeline: {
    actions: [
      { group: 'file', name: 'remove', params: {} },
      { group: 'subtask', name: 'exec', params: { identifier: 'notify' } },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(TaskService.getByIdentifier).mockImplementation(async (identifier: string) =>
    identifier === 'notify'
      ? ({ identifier, name: 'Notify', source: JSON.stringify(notify) } as any)
      : undefined
  );
});

describe('capabilityReport', () => {
  it('names each step the way the builder does and finds installed sub-workflows', async () => {
    expect(await capabilityReport(JSON.stringify(cleanup))).toEqual({
      capabilities: [
        {
          capability: 'programs',
          review: true,
          steps: [
            { action: 'system.runApplication', label: 'Run Application', workflow: 'Notify' },
          ],
        },
        {
          capability: 'files.write',
          review: true,
          steps: [{ action: 'file.remove', label: 'Remove' }],
        },
      ],
      unknownWorkflows: [],
    });
  });
});

describe('combinedCapabilityReport', () => {
  it("names every step's workflow, finds sub-workflows in the set first, and lists each step once", async () => {
    const report = await combinedCapabilityReport([
      { identifier: 'cleanup', name: 'Clean up', source: cleanup },
      // Also in the archive, under another name than the installed one: the archive's wins.
      { identifier: 'notify', name: 'Notify (from backup)', source: notify },
    ]);
    expect(report.capabilities).toEqual([
      {
        capability: 'programs',
        review: true,
        steps: [
          {
            action: 'system.runApplication',
            label: 'Run Application',
            workflow: 'Notify (from backup)',
          },
        ],
      },
      {
        capability: 'files.write',
        review: true,
        steps: [{ action: 'file.remove', label: 'Remove', workflow: 'Clean up' }],
      },
    ]);
    expect(TaskService.getByIdentifier).not.toHaveBeenCalled();
  });
});

describe('capabilitySummary', () => {
  it('is short: steps as group.name, with the sub-workflow they are in', async () => {
    expect(await capabilitySummary(cleanup)).toEqual([
      { capability: 'programs', review: true, steps: ['system.runApplication (in Notify)'] },
      { capability: 'files.write', review: true, steps: ['file.remove'] },
    ]);
  });
});

describe('capabilityIndex', () => {
  it('maps every workflow to its capabilities with one read of all sources', async () => {
    vi.mocked(TaskService.getAllWithSource).mockResolvedValue([
      { identifier: 'cleanup', name: 'Clean up', source: JSON.stringify(cleanup) },
      { identifier: 'notify', name: 'Notify', source: JSON.stringify(notify) },
      {
        identifier: 'sum',
        name: 'Sum',
        source: JSON.stringify({ pipeline: { actions: [{ group: 'math', name: 'sum' }] } }),
      },
      { identifier: 'broken', name: 'Broken', source: null },
    ]);
    expect(await capabilityIndex()).toEqual({
      cleanup: ['programs', 'files.write'],
      notify: ['programs'],
      sum: [],
      broken: [],
    });
    expect(TaskService.getByIdentifier).not.toHaveBeenCalled();
  });
});
