import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: { getAll: vi.fn(async () => []) },
}));

import { Block } from '@pipeline/Block';
import { Task } from '@task/Task';
import { ActionFactory } from '@action/ActionFactory';
import { coreEvents } from '@engine/CoreEvents';
import { GlobalVariableService } from '@database/services/GlobalVariableService';

// The steps inside a flow step, run the real way: through a Block, with real actions.
async function runSteps(steps: any[], onFailedStep?: (name: string) => void) {
  const task = new Task();
  const correlationId = `nested-${Math.random()}`;
  task.setCorrelationId(correlationId);
  await task.loadVariables(
    ['problem', 'seen'].map((name) => ({ name, type: 'string', value: '', required: false }))
  );
  const listener = (event: { name: string }) => onFailedStep?.(event.name);
  coreEvents.on(`actionError:${correlationId}`, listener);
  const actions = [];
  for (const [index, step] of steps.entries()) {
    actions.push(await ActionFactory.create({ identifier: `s${index}`, ...step }));
  }
  const value = (name: string) => task.getPipeline().getVariableByName(name)?.getValue();
  try {
    await new Block(actions, task, 0).run();
    return { value, error: undefined };
  } catch (error: any) {
    return { value, error: error.message as string };
  } finally {
    coreEvents.off(`actionError:${correlationId}`, listener);
  }
}

const setProblem = { group: 'variable', name: 'set', identifier: 'in1', params: { name: 'problem', value: 'boom' } };
const readProblem = { group: 'variable', name: 'set', identifier: 'in2', params: { name: 'seen', value: 'got: {{ problem }}' } };
const body = [setProblem, readProblem];
const condition = (matches: boolean) => ({
  firstOperand: 'a',
  compareAs: 'string',
  operator: 'eq',
  secondOperand: matches ? 'a' : 'b',
});
const flow = (name: string, params: any) => ({ group: 'flow', name, params });

const email = {
  group: 'email',
  name: 'send',
  identifier: 'mail',
  params: {
    host: '{{ _global.SMTP_HOST }}',
    port: '{= _global.SMTP_PORT =}',
    user: 'me',
    pass: 'secret',
    from: 'me@acme.com',
    to: 'you@acme.com',
    subject: 'Hello',
    text: '{{ problem }}',
  },
};

beforeEach(() => {
  vi.mocked(GlobalVariableService.getAll).mockReset();
  vi.mocked(GlobalVariableService.getAll).mockResolvedValue([]);
});

describe('steps inside a flow step', () => {
  it.each([
    ['If', [flow('ifConditional', { ...condition(true), actions: body })]],
    [
      'Else If',
      [
        flow('ifConditional', { ...condition(false), actions: [] }),
        flow('elseIfConditional', { ...condition(true), actions: body }),
      ],
    ],
    [
      'Else',
      [
        flow('ifConditional', { ...condition(false), actions: [] }),
        flow('elseConditional', { actions: body }),
      ],
    ],
    [
      'Case',
      [
        flow('switchConditional', { expression: 'a' }),
        flow('caseConditional', { match: 'a', actions: body }),
      ],
    ],
    [
      'Default',
      [
        flow('switchConditional', { expression: 'a' }),
        flow('caseConditional', { match: 'b', actions: [] }),
        flow('defaultConditional', { actions: body }),
      ],
    ],
    [
      'Conditional Loop',
      [
        flow('conditionalLoop', {
          firstOperand: '{{ problem }}',
          compareAs: 'string',
          operator: 'empty',
          actions: body,
        }),
      ],
    ],
    ['Simple Loop', [flow('simpleLoop', { indexValue: 0, indexEndValue: 1, incrementBy: 1, actions: body })]],
  ])('see what an earlier step in the same %s set', async (_name, steps) => {
    const { value, error } = await runSteps(steps);
    expect(error).toBeUndefined();
    expect(value('seen')).toBe('got: boom');
  });

  it('see what an earlier step in an outer branch set, through an inner branch', async () => {
    const inner = flow('ifConditional', { ...condition(true), actions: [readProblem] });
    const { value } = await runSteps([
      flow('ifConditional', { ...condition(true), actions: [setProblem, { identifier: 'nested', ...inner }] }),
    ]);
    expect(value('seen')).toBe('got: boom');
  });

  it('still decide the condition from the values when the step starts', async () => {
    const { value } = await runSteps([
      setProblem,
      flow('ifConditional', {
        firstOperand: '{{ problem }}',
        compareAs: 'string',
        operator: 'eq',
        secondOperand: 'boom',
        actions: [readProblem],
      }),
    ]);
    expect(value('seen')).toBe('got: boom');
  });

  it('fail as themselves, after the steps before them ran', async () => {
    vi.mocked(GlobalVariableService.getAll).mockResolvedValue([
      { name: 'SMTP_HOST', value: '' },
      { name: 'SMTP_PORT', value: '' },
    ] as any);
    const failed: string[] = [];
    const { value, error } = await runSteps(
      [flow('ifConditional', { ...condition(true), actions: [setProblem, email] })],
      (name) => failed.push(name)
    );
    expect(error).toContain('host');
    expect(failed[0]).toBe('email.send');
    expect(value('problem')).toBe('boom');
  });

  it('are not touched when their branch does not run', async () => {
    const broken = { ...setProblem, params: { name: 'problem', value: 'a {= not_alone =} b' } };
    const { error } = await runSteps([flow('ifConditional', { ...condition(false), actions: [broken] })]);
    expect(error).toBeUndefined();
  });
});

describe('a global variable that does not exist', () => {
  const read = (text: string, extra = {}) => ({
    group: 'system',
    name: 'message',
    params: { text },
    ...extra,
  });

  it('stops the step, naming it', async () => {
    const { error } = await runSteps([read('{{ _global.SMTP_HOST }}')]);
    expect(error).toContain(`Global variable "SMTP_HOST" doesn't exist`);
  });

  it('names every missing one and fails on the step that reads them, not its If', async () => {
    const failed: string[] = [];
    const { value, error } = await runSteps(
      [flow('ifConditional', { ...condition(true), actions: [setProblem, email] })],
      (name) => failed.push(name)
    );
    expect(error).toContain('"SMTP_HOST", "SMTP_PORT"');
    expect(failed[0]).toBe('email.send');
    expect(value('problem')).toBe('boom');
  });

  it('is fine in a branch that does not run', async () => {
    const { error } = await runSteps([flow('ifConditional', { ...condition(false), actions: [email] })]);
    expect(error).toBeUndefined();
  });

  it('is fine when it exists but is empty', async () => {
    vi.mocked(GlobalVariableService.getAll).mockResolvedValue([{ name: 'EMPTY', value: null }] as any);
    const { error } = await runSteps([read('[{{ _global.EMPTY }}]')]);
    expect(error).toBeUndefined();
  });

  it('is fine with a default filter', async () => {
    const { error } = await runSteps([
      { ...setProblem, params: { name: 'seen', value: "{{ _global.NOPE | default: 'fallback' }}" } },
    ]);
    expect(error).toBeUndefined();
  });

  it('is fine in a step that may fail (onError: continue)', async () => {
    const { value, error } = await runSteps([
      { ...setProblem, identifier: 'optional', onError: 'continue', params: { name: 'seen', value: '[{{ _global.NOPE }}]' } },
    ]);
    expect(error).toBeUndefined();
    expect(value('seen')).toBe('[]');
  });
});
