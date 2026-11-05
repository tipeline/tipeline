import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_RULES,
  getGroupActionsMap,
  stepCapabilities,
  workflowCapabilities,
} from '@tipeline/schemas';

const noWorkflows = async () => null;

describe('capability rules', () => {
  it('classifies every built-in group, and only names actions that exist', () => {
    const groups = getGroupActionsMap();
    expect(Object.keys(CAPABILITY_RULES).sort()).toEqual(Object.keys(groups).sort());
    for (const [group, rule] of Object.entries(CAPABILITY_RULES)) {
      for (const name of Object.keys(rule.actions ?? {})) {
        expect(groups[group], `${group}.${name}`).toContain(name);
      }
    }
  });

  it('tags single methods, not whole groups', () => {
    expect(stepCapabilities('file', 'remove')).toEqual(['files.write']);
    expect(stepCapabilities('file', 'read')).toEqual(['files.read']);
    expect(stepCapabilities('file', 'getFilePathPart')).toEqual([]);
    expect(stepCapabilities('system', 'runApplication')).toEqual(['programs']);
    expect(stepCapabilities('system', 'message')).toEqual([]);
    expect(stepCapabilities('ssh', 'exec')).toEqual(['remote']);
    expect(stepCapabilities('ssh', 'close')).toEqual([]);
    expect(stepCapabilities('http', 'downloadFile')).toEqual(['network.send', 'files.write']);
    expect(stepCapabilities('script', 'runScript')).toEqual(['script']);
    expect(stepCapabilities('math', 'sum')).toEqual([]);
  });

  it('treats plugin steps and unknown groups as add-on code', () => {
    expect(stepCapabilities('drupal', 'get', 'plugin')).toEqual(['addon']);
    expect(stepCapabilities('nope', 'nothing')).toEqual(['addon']);
    // A plugin may reuse a built-in group name; its code is still its own.
    expect(stepCapabilities('file', 'read', 'plugin')).toEqual(['addon']);
  });
});

describe('workflowCapabilities', () => {
  it('collects nested steps in review-first order and skips disabled ones', async () => {
    const source = {
      pipeline: {
        actions: [
          { group: 'http', name: 'request', params: {} },
          {
            group: 'flow',
            name: 'ifConditional',
            params: { statements: [{ actions: [{ group: 'file', name: 'remove', params: {} }] }] },
          },
          {
            group: 'flow',
            name: 'forEachLoop',
            params: { actions: [{ group: 'file', name: 'move', params: {} }] },
          },
          { group: 'system', name: 'runApplication', params: {}, disabled: true },
          { group: 'string', name: 'trim', params: {} },
        ],
      },
    };
    const result = await workflowCapabilities(source, noWorkflows);
    expect(result.capabilities).toEqual([
      {
        capability: 'files.write',
        review: true,
        steps: [{ action: 'file.remove' }, { action: 'file.move' }],
      },
      { capability: 'network.send', review: false, steps: [{ action: 'http.request' }] },
    ]);
    expect(result.unknownWorkflows).toEqual([]);
  });

  it('is empty for a workflow that only works with data', async () => {
    const source = { pipeline: { actions: [{ group: 'math', name: 'sum', params: {} }] } };
    expect(await workflowCapabilities(source, noWorkflows)).toEqual({
      capabilities: [],
      unknownWorkflows: [],
    });
    expect(await workflowCapabilities(null, noWorkflows)).toEqual({
      capabilities: [],
      unknownWorkflows: [],
    });
  });

  it('follows sub-workflows all the way down, once each, and names where a step is', async () => {
    const installed: Record<string, any> = {
      notify: {
        name: 'Notify',
        pipeline: {
          actions: [
            { group: 'system', name: 'runApplication', params: {} },
            { group: 'subtask', name: 'exec', params: { identifier: 'upload' } },
          ],
        },
      },
      upload: {
        name: 'Upload to NAS',
        pipeline: {
          actions: [
            { group: 'ssh', name: 'exec', params: {} },
            // A loop back to the parent: visited once, no endless walk.
            { group: 'subtask', name: 'exec', params: { identifier: 'notify' } },
          ],
        },
      },
    };
    const source = {
      pipeline: {
        actions: [
          { group: 'subtask', name: 'exec', params: { identifier: 'notify' } },
          { group: 'subtask', name: 'exec', params: { identifier: 'notify' } },
        ],
      },
    };
    const result = await workflowCapabilities(source, async (id) => installed[id] ?? null);
    expect(result.capabilities).toEqual([
      {
        capability: 'programs',
        review: true,
        steps: [{ action: 'system.runApplication', workflow: 'Notify' }],
      },
      {
        capability: 'remote',
        review: true,
        steps: [{ action: 'ssh.exec', workflow: 'Upload to NAS' }],
      },
    ]);
  });

  it('reports sub-workflows it cannot look at', async () => {
    const source = {
      pipeline: {
        actions: [
          { group: 'subtask', name: 'exec', params: { identifier: 'missing' } },
          { group: 'subtask', name: 'exec', params: { identifier: '{{ which }}' } },
          { group: 'subtask', name: 'exec', params: { path: './child.yml' } },
        ],
      },
    };
    const result = await workflowCapabilities(source, noWorkflows);
    expect(result.unknownWorkflows).toEqual(['missing', '{{ which }}', './child.yml']);
  });
});
