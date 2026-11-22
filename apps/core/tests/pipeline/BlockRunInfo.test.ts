import { describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: { getAll: vi.fn(async () => []) },
}));

import { Block } from '@pipeline/Block';
import { Task } from '@task/Task';
import { ActionFactory } from '@action/ActionFactory';
import { coreInfo } from '@utils/runInfo';

// A step reads `_run` and `_core` the real way: through a Block, with a real action.
describe('_run and _core in a running step', () => {
  it('resolves them from the task running it', async () => {
    const task = new Task();
    task.setCorrelationId(`run-info-${Math.random()}`);
    task.setIdentifier('nightly');
    task.setName('Nightly');
    task.setStartedBy({ trigger: 'schedule' });
    await task.loadVariables([{ name: 'seen', type: 'string', value: '', required: false }]);
    const step = await ActionFactory.create({
      identifier: 's0',
      group: 'variable',
      name: 'set',
      params: { name: 'seen', value: '{{ _run.workflow }}/{{ _run.trigger }}@{{ _core.id }}' },
    });

    await new Block([step], task, 0).run();

    expect(task.getPipeline().getVariableByName('seen')?.getValue()).toBe(
      `nightly/schedule@${coreInfo().id}`
    );
  });
});
