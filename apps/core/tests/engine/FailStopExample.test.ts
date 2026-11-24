import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// examples/workflows/fail-and-stop.yml: the example for flow.fail and flow.stop.
const file = path.resolve(__dirname, '../../../../examples/workflows/fail-and-stop.yml');

// The unknown-action check asks the database whether a group is a plugin; tests have none.
vi.mock('@database/services/PluginService', () => ({
  PluginService: { getByGroup: vi.fn(async () => undefined) },
}));
vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: { getAll: vi.fn(async () => []) },
}));
import { checkWorkflowYaml } from '@engine/WorkflowAuthoring';
import { TaskFactory } from '@task/TaskFactory';
import { RunStoppedSignal } from '@utils/errors';
import { coreEvents } from '@engine/CoreEvents';

// Runs the example without saving (runClean), the way a preview run does.
async function run(scenario: string) {
  const correlationId = `fail-stop-example-${scenario}`;
  const task = await TaskFactory.fromContent(fs.readFileSync(file, 'utf8'), 'fail-and-stop', correlationId, {
    scenario,
  });
  task.setShouldSave(false);
  let end: any;
  const onEnd = (event: any) => (end = event);
  coreEvents.on(`taskEnd:${correlationId}`, onEnd);
  try {
    await task.runClean();
    return { end, error: undefined as any, summary: task.getPipeline().getVariableByName('summary')?.getValue() };
  } catch (error: any) {
    return { end, error, summary: task.getPipeline().getVariableByName('summary')?.getValue() };
  } finally {
    coreEvents.off(`taskEnd:${correlationId}`, onEnd);
  }
}

describe('fail-and-stop example', () => {
  it('passes the check with no warnings', async () => {
    const yaml = fs.readFileSync(file, 'utf8');
    expect(await checkWorkflowYaml(yaml)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('ok: processes the items and completes', async () => {
    const result = await run('ok');
    expect(result.error).toBeUndefined();
    expect(result.end).not.toHaveProperty('status');
    expect(result.summary).toContain('invoice-101');
  });

  it("error: fails with the lookup's error", async () => {
    const result = await run('error');
    expect(result.error?.message).toBe('Lookup failed: Quota exceeded');
    expect(result.end.status).toBe('failed');
    expect(result.summary).toBe('');
  });

  it('empty: stops early as completed; the steps after the stop never run', async () => {
    const result = await run('empty');
    expect(result.error).toBeUndefined();
    expect(result.error).not.toBeInstanceOf(RunStoppedSignal);
    expect(result.end).not.toHaveProperty('status');
    expect(result.summary).toBe('');
  });

  it('an unknown scenario fails and says which ones exist', async () => {
    const result = await run('nope');
    expect(result.error?.message).toBe('Unknown scenario "nope": use ok, error or empty.');
  });
});
