import { describe, expect, it } from 'vitest';
import * as os from 'os';
import { parseParams } from '@utils/parseParams';
import { coreInfo, runInfo, toStartedBy, type RunContext, type RunInfoSource } from '@utils/runInfo';
import { Task } from '@task/Task';

function source(overrides: Partial<Record<keyof RunInfoSource, unknown>> = {}): RunInfoSource {
  return {
    getIdentifier: () => 'wf-1',
    getName: () => 'Nightly report',
    getTrigger: () => null,
    getParentRun: () => null,
    getStartedBy: () => null,
    getStartedAt: () => '2026-11-22T10:00:00.000Z',
    getPipeline: () => ({ getIdentifier: () => 'run-1' }),
    ...(overrides as object),
  } as RunInfoSource;
}

const context: RunContext = {
  run: runInfo(source({ getStartedBy: () => ({ trigger: 'schedule' }) })),
  core: { id: 'worker-2', host: 'box', platform: 'linux', version: '1.2.3' },
};

describe('runInfo', () => {
  it('is a manual run by default', () => {
    expect(runInfo(source())).toEqual({
      id: 'run-1',
      workflow: 'wf-1',
      workflowName: 'Nightly report',
      trigger: 'manual',
      user: '',
      parentId: '',
      startedAt: '2026-11-22T10:00:00.000Z',
    });
  });

  it('takes the trigger and user it was started with', () => {
    const info = runInfo(source({ getStartedBy: () => ({ trigger: 'webhook', user: 'a@b.c' }) }));
    expect(info.trigger).toBe('webhook');
    expect(info.user).toBe('a@b.c');
  });

  it('is an app run when an app started it, keeping the Server user', () => {
    const info = runInfo(
      source({ getTrigger: () => ({ type: 'app' }), getStartedBy: () => ({ user: 'a@b.c' }) })
    );
    expect(info.trigger).toBe('app');
    expect(info.user).toBe('a@b.c');
  });

  it('is a workflow run with its parent when a workflow started it', () => {
    const info = runInfo(
      source({
        getParentRun: () => ({ pipelineIdentifier: 'parent-run' }),
        getStartedBy: () => ({ trigger: 'schedule' }),
      })
    );
    expect(info.trigger).toBe('workflow');
    expect(info.parentId).toBe('parent-run');
  });

  it('reads a Task', () => {
    const task = new Task();
    task.setIdentifier('wf-9');
    task.setName('Nine');
    task.setStartedBy({ trigger: 'mcp' });
    const { run, core } = task.getRunContext();
    expect(run).toMatchObject({ workflow: 'wf-9', workflowName: 'Nine', trigger: 'mcp', id: '' });
    expect(Number.isNaN(Date.parse(run.startedAt))).toBe(false);
    expect(core).toBe(coreInfo());
  });
});

describe('coreInfo', () => {
  it('names the host and platform', () => {
    const core = coreInfo();
    expect(core.host).toBe(os.hostname());
    expect(['mac', 'windows', 'linux']).toContain(core.platform);
    expect(core.id).toBe(process.env.TIPELINE_CORE_NAME?.trim() || os.hostname());
    expect(typeof core.version).toBe('string');
  });
});

describe('toStartedBy', () => {
  it('keeps known triggers and a user', () => {
    expect(toStartedBy({ trigger: 'schedule', user: ' a@b.c ' })).toEqual({ trigger: 'schedule', user: 'a@b.c' });
  });

  it('drops what it does not know', () => {
    expect(toStartedBy({ trigger: 'root', user: 42 })).toBeUndefined();
    expect(toStartedBy('manual')).toBeUndefined();
    expect(toStartedBy(null)).toBeUndefined();
    expect(toStartedBy({ trigger: 'nope', user: 'a@b.c' })).toEqual({ user: 'a@b.c' });
  });
});

describe('_run and _core in params', () => {
  it('renders them in text', () => {
    const params = { text: '{{ _run.workflowName }} ({{ _run.trigger }}) on {{ _core.id }}' };
    parseParams(params, [], undefined, undefined, context);
    expect(params.text).toBe('Nightly report (schedule) on worker-2');
  });

  it('hands over the objects and fields with {= =}', () => {
    const params = { run: '{= _run =}', core: '{= _core =}', id: '{= _run.id =}' };
    parseParams(params, [], undefined, undefined, context);
    expect(params.run).toEqual(context.run);
    expect(params.core).toEqual(context.core);
    expect(params.id).toBe('run-1');
  });

  it('works in tags', () => {
    const params = { text: "{% if _run.trigger == 'schedule' %}auto{% else %}by hand{% endif %}" };
    parseParams(params, [], undefined, undefined, context);
    expect(params.text).toBe('auto');
  });

  it('leaves a {= =} reference alone without a run context (as before)', () => {
    const params = { id: '{= _run.id =}', text: '[{{ _run.id }}]' };
    parseParams(params, []);
    expect(params.id).toBe('{= _run.id =}');
    expect(params.text).toBe('[]');
  });
});
