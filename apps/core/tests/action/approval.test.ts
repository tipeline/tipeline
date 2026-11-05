import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/PipelineService', () => ({
  PipelineService: {
    getById: vi.fn(),
    getByIdentifier: vi.fn(),
    mergeMetadata: vi.fn(),
    claimPaused: vi.fn(),
    getPendingApprovals: vi.fn(),
    getDecidedApprovals: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock('@database/services/PipelineActionService', () => ({
  PipelineActionService: { getByBlock: vi.fn(), updateStatus: vi.fn() },
}));
vi.mock('@database/services/PipelineRunnerService', () => ({
  PipelineRunnerService: { startPipeline: vi.fn() },
}));
vi.mock('@database/services/PipelineBlockService', () => ({
  PipelineBlockService: { startBlock: vi.fn() },
}));
vi.mock('@database/services/AppService', () => ({ AppService: { getByIdentifier: vi.fn() } }));
vi.mock('@engine/runner/JobRunnerFactory', () => ({ getJobRunner: vi.fn() }));

import { GroupApproval } from '@/action/actions/approval/actions';
import { ApprovalPendingSignal, ApprovalRejectedSignal } from '@utils/errors';
import { Block } from '@pipeline/Block';
import { Action } from '@action/Action';
import { Task } from '@task/Task';
import { coreEvents } from '@engine/CoreEvents';
import Core from '@engine/Core';
import { PipelineService } from '@database/services/PipelineService';
import { PipelineActionService } from '@database/services/PipelineActionService';
import { PipelineRunnerService } from '@database/services/PipelineRunnerService';
import { PipelineBlockService } from '@database/services/PipelineBlockService';
import { AppService } from '@database/services/AppService';
import { getJobRunner } from '@engine/runner/JobRunnerFactory';
import { ApprovalTimeoutService } from '@engine/ApprovalTimeoutService';
import { validations } from '@tipeline/schemas';

function savedTask(pipelineId = 10, blockId = 3) {
  const task = new Task();
  task.setShouldSave(true);
  task.setCorrelationId('corr-ap');
  task.setIdentifier('task-id');
  const pipeline = task.getPipeline();
  (pipeline as any).id = pipelineId;
  pipeline.setCurrentContext(blockId, 0);
  return task;
}

const action = { identifier: 'ask-1' } as any;

describe('approval.request', () => {
  beforeEach(() => vi.mocked(PipelineService.mergeMetadata).mockReset());

  it('records the request and pauses when nothing has been decided', async () => {
    vi.mocked(PipelineService.getById).mockResolvedValue({ metadata: {} } as any);

    await expect(
      GroupApproval.request({ title: 'Pay?', details: 'x' }, savedTask(), null, action)
    ).rejects.toBeInstanceOf(ApprovalPendingSignal);
    expect(PipelineService.mergeMetadata).toHaveBeenCalledWith(10, {
      approval: expect.objectContaining({
        key: '3:ask-1',
        actionIdentifier: 'ask-1',
        title: 'Pay?',
        details: 'x',
      }),
    });
  });

  it('records when a request with a timeout expires, and how it is decided then', async () => {
    vi.mocked(PipelineService.getById).mockResolvedValue({ metadata: {} } as any);
    vi.useFakeTimers({ now: new Date('2026-10-04T10:00:00Z') });
    try {
      await expect(
        GroupApproval.request({ title: 'Pay?', timeout: '48h' }, savedTask(), null, action)
      ).rejects.toBeInstanceOf(ApprovalPendingSignal);
    } finally {
      vi.useRealTimers();
    }
    expect(PipelineService.mergeMetadata).toHaveBeenCalledWith(10, {
      approval: expect.objectContaining({
        timeout: '48h',
        onTimeout: 'reject',
        expiresAt: '2026-10-06T10:00:00.000Z',
      }),
    });
  });

  it('keeps the approvers and the four-eyes setting for the server to enforce', async () => {
    vi.mocked(PipelineService.getById).mockResolvedValue({ metadata: {} } as any);
    await expect(
      GroupApproval.request(
        { title: 'Pay?', approvers: ['admin', ' finance@acme.com '], allowSelfApproval: false },
        savedTask(),
        null,
        action
      )
    ).rejects.toBeInstanceOf(ApprovalPendingSignal);
    expect(PipelineService.mergeMetadata).toHaveBeenCalledWith(10, {
      approval: expect.objectContaining({
        approvers: ['admin', 'finance@acme.com'],
        allowSelfApproval: false,
      }),
    });
  });

  it('accepts timeouts like 30m, 48h, 2d, 1w (or a template when editing) and rejects anything else', () => {
    const runtime = validations.approval.request.runtime.schema;
    const creation = validations.approval.request.creation.schema;
    for (const timeout of ['30m', '48h', '2d', '1w', ' 5 h '])
      expect(runtime.safeParse({ title: 'x', timeout }).success).toBe(true);
    for (const timeout of ['0h', '48', 'h', '2 days', '1.5h'])
      expect(runtime.safeParse({ title: 'x', timeout }).success).toBe(false);
    expect(creation.safeParse({ title: 'x', timeout: '{{ wait }}' }).success).toBe(true);
    expect(runtime.safeParse({ title: 'x', onTimeout: 'escalate' }).success).toBe(false);
  });

  it('returns the decision for this step (and block) once decided', async () => {
    const decision = { approved: true, comment: 'ok', decidedAt: 't', decidedBy: 'app:X' };
    vi.mocked(PipelineService.getById).mockResolvedValue({
      metadata: { approvals: { '3:ask-1': decision } },
    } as any);

    await expect(
      GroupApproval.request({ title: 'Pay?' }, savedTask(), null, action)
    ).resolves.toEqual(decision);
    // another loop iteration (another block) is its own request
    await expect(
      GroupApproval.request({ title: 'Pay?' }, savedTask(10, 4), null, action)
    ).rejects.toBeInstanceOf(ApprovalPendingSignal);
  });

  it('a rejection stops the run by default, saying who rejected it and why', async () => {
    const rejected = {
      approved: false,
      comment: 'too much',
      decidedAt: 't',
      decidedBy: 'ed@acme.com',
    };
    vi.mocked(PipelineService.getById).mockResolvedValue({
      metadata: { approvals: { '3:ask-1': rejected } },
    } as any);

    const error = await GroupApproval.request({ title: 'Pay?' }, savedTask(), null, action).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(ApprovalRejectedSignal);
    expect(error.message).toBe('Rejected by ed@acme.com: too much');

    vi.mocked(PipelineService.getById).mockResolvedValue({
      metadata: {
        approvals: {
          '3:ask-1': { ...rejected, decidedBy: 'timeout', comment: 'No decision within 2d' },
        },
      },
    } as any);
    await expect(
      GroupApproval.request({ title: 'Pay?' }, savedTask(), null, action)
    ).rejects.toThrow('Rejected automatically (no decision in time): No decision within 2d');
  });

  it('with onReject: continue, a rejection is returned for the workflow to handle', async () => {
    const rejected = { approved: false, comment: 'no', decidedAt: 't', decidedBy: 'ed@acme.com' };
    vi.mocked(PipelineService.getById).mockResolvedValue({
      metadata: { approvals: { '3:ask-1': rejected } },
    } as any);
    await expect(
      GroupApproval.request({ title: 'Pay?', onReject: 'continue' }, savedTask(), null, action)
    ).resolves.toEqual(rejected);
  });

  it('the real Action passes a rejection through unwrapped, even with onError: continue', async () => {
    vi.mocked(PipelineService.getById).mockResolvedValue({
      metadata: {
        approvals: { '3:ask-1': { approved: false, comment: '', decidedAt: 't', decidedBy: 'x' } },
      },
    } as any);
    for (const onError of ['throw', 'continue'] as const) {
      const real = new Action({
        group: 'approval',
        name: 'request',
        params: { title: 'Pay?' },
        identifier: 'ask-1',
        onError,
      } as any);
      await expect(real.execute(savedTask(), null)).rejects.toBeInstanceOf(ApprovalRejectedSignal);
    }
  });

  it('refuses to wait inside a sub-workflow its parent waits for', async () => {
    vi.mocked(PipelineService.getById).mockResolvedValue({ metadata: {} } as any);
    const task = savedTask();
    task.setAwaitedByParent(true);
    await expect(GroupApproval.request({ title: 'Pay?' }, task, null, action)).rejects.toThrow(
      'inside a sub-workflow'
    );
    expect(PipelineService.mergeMetadata).not.toHaveBeenCalled();
  });

  it('the real Action passes the pause through unwrapped, even with onError: continue', async () => {
    vi.mocked(PipelineService.getById).mockResolvedValue({ metadata: {} } as any);
    for (const onError of ['throw', 'continue'] as const) {
      const real = new Action({
        group: 'approval',
        name: 'request',
        params: { title: 'Pay?' },
        identifier: 'ask-1',
        onError,
      } as any);
      await expect(real.execute(savedTask(), null)).rejects.toBeInstanceOf(ApprovalPendingSignal);
    }
  });

  it('refuses to run without run history', async () => {
    const task = savedTask();
    task.setShouldSave(false);
    await expect(GroupApproval.request({ title: 'Pay?' }, task, null, action)).rejects.toThrow(
      'needs run history'
    );
  });
});

describe('Block / Pipeline with a pending approval', () => {
  let emit: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.mocked(PipelineActionService.getByBlock).mockResolvedValue([] as any);
    vi.mocked(PipelineActionService.updateStatus).mockReset();
    vi.mocked(PipelineService.updateStatus).mockReset();
    emit = vi.spyOn(coreEvents, 'emit');
  });
  afterEach(() => vi.restoreAllMocks());

  function pausingAction() {
    return {
      identifier: 'ask-1',
      disabled: false,
      group: 'approval',
      name: 'request',
      id: 1,
      onError: 'throw',
      execute: vi.fn(async () => {
        throw new ApprovalPendingSignal('Pay?');
      }),
      getDestination: vi.fn(() => ''),
      getParamsPlain: vi.fn(() => ({ title: 'Pay?' })),
      getRawParams: vi.fn(() => ({ title: 'Pay?' })),
      setParams: vi.fn(),
    } as any;
  }

  it('marks the step paused (not failed) and emits no error event', async () => {
    const task = savedTask();
    await expect(new Block([pausingAction()], task, 3).run()).rejects.toBeInstanceOf(
      ApprovalPendingSignal
    );

    const statuses = vi.mocked(PipelineActionService.updateStatus).mock.calls.map((c) => c[3]);
    expect(statuses).toEqual(['running', 'paused']);
    expect(emit.mock.calls.some(([e]) => String(e).startsWith('actionError:'))).toBe(false);
  });

  it('a run that reaches an approval ends paused, without throwing, and says so on taskEnd', async () => {
    const task = savedTask();
    task.getPipeline().setActions([pausingAction()]);
    vi.mocked(PipelineRunnerService.startPipeline).mockResolvedValue({
      id: 10,
      identifier: 'p-10',
    } as any);
    vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 3 } as any);

    await expect(task.getPipeline().run()).resolves.toBeUndefined();

    expect(vi.mocked(PipelineService.updateStatus).mock.calls.map((c) => c[1])).toEqual(['paused']);
    const end = emit.mock.calls.find(([e]) => e === 'taskEnd:corr-ap')?.[1] as any;
    expect(end).toMatchObject({ pipelineIdentifier: 'p-10', status: 'paused' });
  });

  function rejectingAction() {
    return {
      ...pausingAction(),
      execute: vi.fn(async () => {
        throw new ApprovalRejectedSignal('Pay?', 'ed@acme.com', 'too much');
      }),
    } as any;
  }

  it('a rejection cancels the step without an error event', async () => {
    const task = savedTask();
    await expect(new Block([rejectingAction()], task, 3).run()).rejects.toBeInstanceOf(
      ApprovalRejectedSignal
    );
    const statuses = vi.mocked(PipelineActionService.updateStatus).mock.calls.map((c) => c[3]);
    expect(statuses).toEqual(['running', 'canceled']);
    expect(emit.mock.calls.some(([e]) => String(e).startsWith('actionError:'))).toBe(false);
  });

  it('a resumed run whose approval was rejected ends canceled, not failed, and says so on taskEnd', async () => {
    const task = savedTask();
    task.getPipeline().setActions([rejectingAction()]);
    vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 3 } as any);

    await expect(task.getPipeline().resume(10, 'p-10')).resolves.toBeUndefined();

    const calls = vi.mocked(PipelineService.updateStatus).mock.calls;
    expect(calls.map((c) => c[1])).toEqual(['running', 'canceled']);
    expect(calls[1][2]).toMatchObject({
      metadata: { reason: 'approval_rejected', message: 'Rejected by ed@acme.com: too much' },
    });
    const end = emit.mock.calls.find(([e]) => e === 'taskEnd:corr-ap')?.[1] as any;
    expect(end).toMatchObject({ status: 'canceled' });
  });

  it('a resumed run that reaches another approval pauses again', async () => {
    const task = savedTask();
    task.getPipeline().setActions([pausingAction()]);
    vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 3 } as any);

    await expect(task.getPipeline().resume(10, 'p-10')).resolves.toBeUndefined();
    expect(vi.mocked(PipelineService.updateStatus).mock.calls.map((c) => c[1])).toEqual([
      'running',
      'paused',
    ]);
  });
});

describe('Core approvals', () => {
  const submit = vi.fn(async () => {});
  beforeEach(() => {
    submit.mockClear();
    vi.mocked(getJobRunner).mockReturnValue({ submit } as any);
    vi.mocked(PipelineService.mergeMetadata).mockReset();
  });

  const paused = {
    id: 10,
    identifier: 'p-10',
    status: 'paused',
    metadata: { approval: { key: '3:ask-1' }, approvals: { '2:old': { approved: true } } },
  };

  it('records the decision under the pending key and resumes the run', async () => {
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue(paused as any);
    vi.mocked(PipelineService.claimPaused).mockResolvedValue(true);

    await expect(
      Core.approvalDecide({
        pipelineIdentifier: 'p-10',
        approved: false,
        comment: 'no',
        decidedBy: 'me',
      })
    ).resolves.toEqual({
      pipelineIdentifier: 'p-10',
      approved: false,
    });
    expect(PipelineService.mergeMetadata).toHaveBeenCalledWith(10, {
      approval: null,
      approvals: {
        '2:old': { approved: true },
        '3:ask-1': expect.objectContaining({ approved: false, comment: 'no', decidedBy: 'me' }),
      },
    });
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'resume', pipelineIdentifier: 'p-10' })
    );
  });

  it('broadcasts the resumed run so clients see it continue and finish', async () => {
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue(paused as any);
    vi.mocked(PipelineService.claimPaused).mockResolvedValue(true);
    let resumeDone!: () => void;
    submit.mockImplementationOnce(() => new Promise<void>((r) => (resumeDone = r)));
    const broadcast = vi.fn();
    Core.setBroadcast(broadcast);
    try {
      await Core.approvalDecide({ pipelineIdentifier: 'p-10', approved: true });
      const { correlationId } = submit.mock.calls[0][0] as any;

      coreEvents.emit(`taskEnd:${correlationId}`, {
        pipelineIdentifier: 'p-10',
        taskIdentifier: 'wf',
      });
      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEnd',
        expect.objectContaining({ correlationId })
      );

      resumeDone();
      await new Promise((r) => setTimeout(r));
      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEndAll',
        expect.objectContaining({ correlationId })
      );
      expect(coreEvents.listenerCount(`taskEnd:${correlationId}`)).toBe(0);
    } finally {
      Core.setBroadcast(null);
    }
  });

  it('keeps what was asked with the decision, for the history', async () => {
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue({
      ...paused,
      metadata: {
        approval: { key: '3:ask-1', title: 'Pay INV-1?', requestedAt: '2026-10-04T09:00:00Z' },
      },
    } as any);
    vi.mocked(PipelineService.claimPaused).mockResolvedValue(true);
    await Core.approvalDecide({ pipelineIdentifier: 'p-10', approved: true });
    expect(PipelineService.mergeMetadata).toHaveBeenCalledWith(10, {
      approval: null,
      approvals: {
        '3:ask-1': expect.objectContaining({
          title: 'Pay INV-1?',
          requestedAt: '2026-10-04T09:00:00Z',
        }),
      },
    });
  });

  it('lists every decision, newest first, across runs and loop iterations', async () => {
    vi.mocked(PipelineService.getDecidedApprovals).mockResolvedValue([
      {
        identifier: 'p-1',
        task_identifier: 'wf',
        task_name: 'Pay',
        status: 'completed',
        metadata: JSON.stringify({
          trigger: { type: 'app', appName: 'Expenses' },
          approvals: {
            '3:a': {
              approved: true,
              comment: '',
              decidedAt: '2026-10-04T08:00:00Z',
              decidedBy: 'ed@acme.com',
              title: 'First?',
            },
            '4:a': {
              approved: false,
              comment: 'late',
              decidedAt: '2026-10-04T10:00:00Z',
              decidedBy: 'timeout',
              title: 'Second?',
            },
          },
        }),
      },
      {
        identifier: 'p-2',
        task_identifier: 'wf',
        task_name: 'Pay',
        status: 'running',
        metadata: {
          approvals: {
            '3:a': { approved: true, decidedAt: '2026-10-04T09:00:00Z', decidedBy: 'desktop' },
          },
        },
      },
    ] as any);

    const history = await Core.approvalHistory({ limit: 10 });

    expect(PipelineService.getDecidedApprovals).toHaveBeenCalledWith(undefined, 10);
    expect(history.map((h) => [h.pipelineIdentifier, h.title, h.approved, h.decidedBy])).toEqual([
      ['p-1', 'Second?', false, 'timeout'],
      ['p-2', '', true, 'desktop'],
      ['p-1', 'First?', true, 'ed@acme.com'],
    ]);
    expect(history[0]).toMatchObject({
      workflowName: 'Pay',
      comment: 'late',
      trigger: { type: 'app', appName: 'Expenses' },
    });
  });

  it('refuses runs that are not waiting, and a second decision', async () => {
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue({
      ...paused,
      status: 'completed',
    } as any);
    await expect(
      Core.approvalDecide({ pipelineIdentifier: 'p-10', approved: true })
    ).rejects.toThrow('Nothing is waiting');

    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue(paused as any);
    vi.mocked(PipelineService.claimPaused).mockResolvedValue(false);
    await expect(
      Core.approvalDecide({ pipelineIdentifier: 'p-10', approved: true })
    ).rejects.toThrow('already decided');
    expect(submit).not.toHaveBeenCalled();
  });

  it('an app only sees and decides approvals of the workflows it declares', async () => {
    vi.mocked(AppService.getByIdentifier).mockResolvedValue({
      name: 'Invoices',
      source: JSON.stringify({
        schemaVersion: 2,
        workflows: { pay: { identifier: 'wf-pay' } },
        pages: [{ id: 'p', name: 'P' }],
      }),
    } as any);
    vi.mocked(PipelineService.getPendingApprovals).mockImplementation(
      async (ids?: string[]) =>
        [
          {
            identifier: 'p-pay',
            task_identifier: 'wf-pay',
            task_name: 'Pay',
            metadata: { approval: { title: 'Pay?' } },
          },
          {
            identifier: 'p-other',
            task_identifier: 'wf-other',
            task_name: 'Other',
            metadata: { approval: { title: 'X' } },
          },
        ].filter((r) => !ids || ids.includes(r.task_identifier)) as any
    );

    const list = await Core.appApprovalList({ appIdentifier: 'a' });
    expect(list.map((p) => p.pipelineIdentifier)).toEqual(['p-pay']);

    await expect(
      Core.appApprovalDecide({ appIdentifier: 'a', pipelineIdentifier: 'p-other', approved: true })
    ).rejects.toThrow('Nothing is waiting');
  });

  it('records who decided through an app when the server says, and the app otherwise', async () => {
    vi.mocked(AppService.getByIdentifier).mockResolvedValue({
      name: 'Invoices',
      source: JSON.stringify({
        schemaVersion: 2,
        workflows: { pay: { identifier: 'wf-pay' } },
        pages: [{ id: 'p', name: 'P' }],
      }),
    } as any);
    vi.mocked(PipelineService.getPendingApprovals).mockResolvedValue([
      {
        identifier: 'p-pay',
        task_identifier: 'wf-pay',
        task_name: 'Pay',
        metadata: { approval: { title: 'Pay?' } },
      },
    ] as any);
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue({
      ...paused,
      identifier: 'p-pay',
    } as any);
    vi.mocked(PipelineService.claimPaused).mockResolvedValue(true);

    await Core.appApprovalDecide({
      appIdentifier: 'a',
      pipelineIdentifier: 'p-pay',
      approved: true,
      actor: 'ed@acme.com',
    });
    await Core.appApprovalDecide({
      appIdentifier: 'a',
      pipelineIdentifier: 'p-pay',
      approved: true,
    });

    const decidedBy = vi
      .mocked(PipelineService.mergeMetadata)
      .mock.calls.map(([, patch]) => (patch as any).approvals['3:ask-1'].decidedBy);
    expect(decidedBy).toEqual(['ed@acme.com (app:Invoices)', 'app:Invoices']);
  });
});

describe('ApprovalTimeoutService', () => {
  const submit = vi.fn(async () => {});
  const row = (identifier: string, approval: Record<string, unknown>) => ({
    identifier,
    task_identifier: 'wf',
    task_name: 'Pay',
    metadata: { approval: { key: '3:ask-1', title: 'Pay?', ...approval } },
  });

  beforeEach(() => {
    submit.mockClear();
    vi.mocked(getJobRunner).mockReturnValue({ submit } as any);
    vi.mocked(PipelineService.mergeMetadata).mockReset();
    vi.mocked(PipelineService.claimPaused).mockReset().mockResolvedValue(true);
  });

  it('decides only expired requests, as their onTimeout says, and resumes them', async () => {
    vi.mocked(PipelineService.getPendingApprovals).mockResolvedValue([
      row('p-expired', { timeout: '1h', onTimeout: 'reject', expiresAt: '2026-10-04T09:00:00Z' }),
      row('p-auto', { timeout: '30m', onTimeout: 'approve', expiresAt: '2026-10-04T09:30:00Z' }),
      row('p-later', { timeout: '2d', onTimeout: 'reject', expiresAt: '2026-10-06T09:00:00Z' }),
      row('p-forever', {}),
    ] as any);
    vi.mocked(PipelineService.getByIdentifier).mockImplementation(
      async (identifier: string) =>
        ({
          id: identifier === 'p-expired' ? 1 : 2,
          identifier,
          status: 'paused',
          metadata: { approval: { key: '3:ask-1' } },
        }) as any
    );

    const decided = await ApprovalTimeoutService.check(new Date('2026-10-04T10:00:00Z'));

    expect(decided).toEqual(['p-expired', 'p-auto']);
    const decisions = vi
      .mocked(PipelineService.mergeMetadata)
      .mock.calls.map(([, patch]) => (patch as any).approvals['3:ask-1']);
    expect(decisions).toEqual([
      expect.objectContaining({
        approved: false,
        decidedBy: 'timeout',
        comment: 'No decision within 1h',
      }),
      expect.objectContaining({
        approved: true,
        decidedBy: 'timeout',
        comment: 'No decision within 30m',
      }),
    ]);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('skips a request someone decided in the meantime', async () => {
    vi.mocked(PipelineService.getPendingApprovals).mockResolvedValue([
      row('p-raced', { timeout: '1h', expiresAt: '2026-10-04T09:00:00Z' }),
    ] as any);
    vi.mocked(PipelineService.getByIdentifier).mockResolvedValue({
      id: 1,
      identifier: 'p-raced',
      status: 'paused',
      metadata: { approval: { key: 'k' } },
    } as any);
    vi.mocked(PipelineService.claimPaused).mockResolvedValue(false);

    await expect(ApprovalTimeoutService.check(new Date('2026-10-04T10:00:00Z'))).resolves.toEqual(
      []
    );
    expect(submit).not.toHaveBeenCalled();
  });
});
