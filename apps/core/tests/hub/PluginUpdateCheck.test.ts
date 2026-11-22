import { describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/TaskService', () => ({ TaskService: { getAllWithSource: vi.fn() } }));
vi.mock('@database/services/WorkflowUsageService', () => ({ WorkflowUsageService: { usageOf: vi.fn() } }));

import { TaskService } from '@database/services/TaskService';
import { WorkflowUsageService } from '@database/services/WorkflowUsageService';
import { PluginReturnsRegistry } from '@/plugin/PluginReturnsRegistry';
import { pluginStepsIn, pluginUpdateProblems, pluginUsage, stepProblems } from '@/hub/PluginUpdateCheck';

const plugin = (over: Record<string, unknown> = {}) =>
  ({
    group: 'drupal',
    actions: { create: {}, read: {} },
    params: {
      create: [
        { name: 'bundle', type: 'string', required: true },
        { name: 'count', type: 'number' },
      ],
    },
    ...over,
  }) as any;

const step = (params: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  action: 'create',
  position: '1',
  params,
  ...over,
});

describe('pluginStepsIn', () => {
  it('finds steps at any depth, numbered by position', () => {
    const source = {
      pipeline: {
        actions: [
          { group: 'drupal', name: 'read', params: {} },
          {
            group: 'if',
            name: 'if',
            params: {
              statements: [{ actions: [{ group: 'system', name: 'message' }] }, { actions: [{ group: 'drupal', name: 'create' }] }],
            },
          },
          { group: 'loop', name: 'forEach', params: { actions: [{ group: 'drupal', name: 'create', params: { bundle: 'x' } }] } },
        ],
      },
    };
    expect(pluginStepsIn(JSON.stringify(source), 'drupal').map((s) => [s.position, s.action])).toEqual([
      ['1', 'read'],
      ['2.1', 'create'],
      ['3.1', 'create'],
    ]);
  });

  it('skips a core action that shares the group, unless the step says it is the plugin', () => {
    const source = {
      pipeline: {
        actions: [
          { group: 'file', name: 'read', params: {} },
          { group: 'file', name: 'read', source: 'plugin', params: {} },
        ],
      },
    };
    expect(pluginStepsIn(source, 'file').map((s) => s.position)).toEqual(['2']);
  });

  it('reads nothing from a broken source', () => {
    expect(pluginStepsIn('{not json', 'drupal')).toEqual([]);
  });
});

describe('stepProblems', () => {
  it('passes a step that still fits', () => {
    expect(stepProblems(step({ bundle: 'article', count: 2 }), plugin(), undefined)).toEqual([]);
  });

  it('accepts template values for typed settings', () => {
    expect(stepProblems(step({ bundle: '{{ type }}', count: '{= n =}' }), plugin(), undefined)).toEqual([]);
  });

  it('reports a removed action', () => {
    expect(stepProblems(step({}), plugin({ actions: { read: {} } }), undefined)).toEqual([{ kind: 'action_removed' }]);
  });

  it('reports a new required setting', () => {
    const problems = stepProblems(step({ count: 1 }), plugin(), undefined);
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe('invalid_settings');
    expect(problems[0].detail).toMatch(/bundle/);
  });

  it('reports settings the action no longer has', () => {
    expect(stepProblems(step({ bundle: 'a', langcode: 'en', status: 1 }), plugin(), undefined)).toEqual([
      { kind: 'setting_removed', detail: 'langcode, status' },
    ]);
  });

  it("doesn't check settings of an action without definitions", () => {
    expect(stepProblems(step({ anything: 1 }, { action: 'read' }), plugin(), undefined)).toEqual([]);
  });

  it('reports a different result type only for a step that keeps its result', () => {
    const next = plugin({ returns: { create: 'array' } });
    expect(stepProblems(step({ bundle: 'a' }, { destination: 'node' }), next, { create: 'object' })).toEqual([
      { kind: 'result_changed', detail: 'object → array' },
    ]);
    expect(stepProblems(step({ bundle: 'a' }), next, { create: 'object' })).toEqual([]);
    expect(stepProblems(step({ bundle: 'a' }, { destination: 'node' }), next, { create: 'any' })).toEqual([]);
  });
});

describe('pluginUpdateProblems', () => {
  it('lists each broken step with its workflow, using the installed result types', async () => {
    vi.mocked(TaskService.getAllWithSource).mockResolvedValue([
      {
        identifier: 'sync',
        name: 'Sync articles',
        source: JSON.stringify({
          pipeline: {
            actions: [
              { group: 'drupal', name: 'create', params: { bundle: 'a' }, destination: 'node' },
              { group: 'drupal', name: 'read', params: {} },
            ],
          },
        }),
      },
      { identifier: 'other', name: 'Other', source: JSON.stringify({ pipeline: { actions: [] } }) },
    ]);
    PluginReturnsRegistry.drupal = { create: 'object' };
    try {
      const problems = await pluginUpdateProblems(
        'drupal',
        plugin({ actions: { create: {} }, returns: { create: 'string' } })
      );
      expect(problems).toEqual([
        {
          workflow: { identifier: 'sync', name: 'Sync articles' },
          position: '1',
          action: 'drupal.create',
          kind: 'result_changed',
          detail: 'object → string',
        },
        {
          workflow: { identifier: 'sync', name: 'Sync articles' },
          position: '2',
          action: 'drupal.read',
          kind: 'action_removed',
        },
      ]);
    } finally {
      delete PluginReturnsRegistry.drupal;
    }
  });
});

describe('pluginUsage', () => {
  it('counts steps per workflow and gathers the apps and schedules that run them', async () => {
    vi.mocked(TaskService.getAllWithSource).mockResolvedValue([
      {
        identifier: 'sync',
        name: 'Sync articles',
        source: JSON.stringify({
          pipeline: { actions: [{ group: 'drupal', name: 'create' }, { group: 'drupal', name: 'read' }] },
        }),
      },
      { identifier: 'other', name: 'Other', source: JSON.stringify({ pipeline: { actions: [] } }) },
    ]);
    vi.mocked(WorkflowUsageService.usageOf).mockResolvedValue(
      new Map([
        [
          'sync',
          {
            apps: [{ identifier: 'cms', name: 'CMS', projects: [] }],
            workflows: [],
            schedules: [{ identifier: 's1' } as any, { identifier: 's2' } as any],
          },
        ],
      ])
    );
    expect(await pluginUsage('drupal')).toEqual({
      workflows: [{ identifier: 'sync', name: 'Sync articles', steps: 2 }],
      apps: ['CMS'],
      schedules: 2,
    });
    expect(WorkflowUsageService.usageOf).toHaveBeenCalledWith(['sync']);
  });
});
