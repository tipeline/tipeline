import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    scheduleSet: vi.fn(),
    scheduleRemove: vi.fn(),
    scheduleToggle: vi.fn(),
    scheduleList: vi.fn(),
  },
}));

import { registerScheduleHandlers } from '@engine/handlers/scheduleHandlers';
import Core from '@engine/Core';
import IPCMessage from '@engine/IPCMessage';

function createFakeTransport() {
  const handlers = new Map<string, (message: any, client: any) => void>();
  return {
    on: vi.fn((event: string, handler: any) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    broadcast: vi.fn(),
    stop: vi.fn(),
    handlers,
  };
}

describe('scheduleHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.scheduleSet).mockReset();
    vi.mocked(Core.scheduleRemove).mockReset();
    vi.mocked(Core.scheduleToggle).mockReset();
    vi.mocked(Core.scheduleList).mockReset();
    transport = createFakeTransport();
    registerScheduleHandlers(transport as any);
  });

  describe('scheduleSet', () => {
    it('calls Core.scheduleSet with identifier and { cron, variables } on a valid cron', async () => {
      vi.mocked(Core.scheduleSet).mockResolvedValue('sched-1' as any);
      const message = {
        payload: { identifier: 'task-1', cron: '0 9 * * 1-5', variables: { a: 1 } },
        correlationId: 'corr-1',
      };

      await transport.handlers.get('scheduleSet')!(message, client);

      expect(Core.scheduleSet).toHaveBeenCalledWith('task-1', {
        cron: '0 9 * * 1-5',
        runAt: null,
        everySeconds: null,
        variables: { a: 1 },
      });
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleSet',
        IPCMessage.success(
          { scheduleIdentifier: 'sched-1', taskIdentifier: 'task-1' },
          'corr-1'
        )
      );
    });

    it('rejects with a validation failure and never calls Core.scheduleSet when the cron is missing', async () => {
      const message = {
        payload: { identifier: 'task-1', cron: '', variables: {} },
        correlationId: 'corr-1',
      };

      await transport.handlers.get('scheduleSet')!(message, client);

      expect(Core.scheduleSet).not.toHaveBeenCalled();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleSet',
        IPCMessage.failure(
          'A schedule needs exactly one of: when (plain words or cron), cron, everySeconds, or runAt.',
          'corr-1'
        )
      );
    });

    it('rejects with a validation failure and never calls Core.scheduleSet when the cron is malformed', async () => {
      const message = {
        payload: { identifier: 'task-1', cron: 'not a cron', variables: {} },
        correlationId: 'corr-1',
      };

      await transport.handlers.get('scheduleSet')!(message, client);

      expect(Core.scheduleSet).not.toHaveBeenCalled();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleSet',
        IPCMessage.failure(
          'A cron expression has 5 fields, or 6 with seconds first (e.g. "0 9 * * 1-5").',
          'corr-1'
        )
      );
    });

    it('reads plain words and 6-field crons into a cron', async () => {
      vi.mocked(Core.scheduleSet).mockResolvedValue('sched-1' as any);

      await transport.handlers.get('scheduleSet')!(
        { payload: { identifier: 'task-1', when: 'every weekday at 9am' }, correlationId: 'c1' },
        client
      );
      await transport.handlers.get('scheduleSet')!(
        { payload: { identifier: 'task-1', cron: '*/20 * * * * *' }, correlationId: 'c2' },
        client
      );

      expect(Core.scheduleSet).toHaveBeenNthCalledWith(1, 'task-1', {
        cron: '0 9 * * 1-5',
        runAt: null,
        everySeconds: null,
        variables: undefined,
      });
      expect(Core.scheduleSet).toHaveBeenNthCalledWith(2, 'task-1', {
        cron: '*/20 * * * * *',
        runAt: null,
        everySeconds: null,
        variables: undefined,
      });
    });

    it('reads an interval a cron cannot keep even as everySeconds', async () => {
      vi.mocked(Core.scheduleSet).mockResolvedValue('sched-1' as any);

      await transport.handlers.get('scheduleSet')!(
        { payload: { identifier: 'task-1', when: 'every 40 seconds' }, correlationId: 'c1' },
        client
      );
      await transport.handlers.get('scheduleSet')!(
        { payload: { identifier: 'task-1', everySeconds: 5400 }, correlationId: 'c2' },
        client
      );

      expect(Core.scheduleSet).toHaveBeenNthCalledWith(1, 'task-1', { cron: null, runAt: null, everySeconds: 40, variables: undefined });
      expect(Core.scheduleSet).toHaveBeenNthCalledWith(2, 'task-1', { cron: null, runAt: null, everySeconds: 5400, variables: undefined });
    });

    it('passes a future runAt through as a one-time schedule', async () => {
      vi.mocked(Core.scheduleSet).mockResolvedValue('sched-1' as any);
      const runAt = new Date(Date.now() + 3_600_000).toISOString();

      await transport.handlers.get('scheduleSet')!(
        { payload: { identifier: 'task-1', runAt }, correlationId: 'c1' },
        client
      );

      expect(Core.scheduleSet).toHaveBeenCalledWith('task-1', { cron: null, runAt, everySeconds: null, variables: undefined });
    });

    it('refuses schedules closer than 10 seconds and times already gone', async () => {
      await transport.handlers.get('scheduleSet')!(
        { payload: { identifier: 'task-1', cron: '*/5 * * * * *' }, correlationId: 'c1' },
        client
      );
      await transport.handlers.get('scheduleSet')!(
        { payload: { identifier: 'task-1', runAt: '2020-01-01T09:00:00.000Z' }, correlationId: 'c2' },
        client
      );

      expect(Core.scheduleSet).not.toHaveBeenCalled();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleSet',
        IPCMessage.failure('Schedules can run at most every 10 seconds.', 'c1')
      );
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleSet',
        IPCMessage.failure('That time has already passed.', 'c2')
      );
    });

    it('emits a failure message when Core.scheduleSet rejects', async () => {
      vi.mocked(Core.scheduleSet).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { identifier: 'task-1', cron: '0 9 * * 1-5', variables: {} },
        correlationId: 'corr-1',
      };

      await transport.handlers.get('scheduleSet')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleSet',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('scheduleSet')!(
        { payload: { identifier: 'task-1', cron: '0 9 * * 1-5' }, correlationId: 'x' },
        undefined
      );

      expect(Core.scheduleSet).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('scheduleRemove', () => {
    it('calls Core.scheduleRemove and emits a message including the identifier', async () => {
      vi.mocked(Core.scheduleRemove).mockResolvedValue(undefined as any);
      const message = { payload: { scheduleIdentifier: 'sched-1' }, correlationId: 'corr-2' };

      await transport.handlers.get('scheduleRemove')!(message, client);

      expect(Core.scheduleRemove).toHaveBeenCalledWith('sched-1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleRemove',
        IPCMessage.success('Schedule sched-1 removed', 'corr-2')
      );
    });

    it('emits a failure message when Core.scheduleRemove rejects', async () => {
      vi.mocked(Core.scheduleRemove).mockRejectedValue(new Error('boom'));
      const message = { payload: { scheduleIdentifier: 'sched-1' }, correlationId: 'corr-2' };

      await transport.handlers.get('scheduleRemove')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleRemove',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('scheduleRemove')!(
        { payload: { scheduleIdentifier: 'sched-1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.scheduleRemove).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('scheduleToggle', () => {
    it('calls Core.scheduleToggle with scheduleIdentifier and enabled', async () => {
      vi.mocked(Core.scheduleToggle).mockResolvedValue(undefined as any);
      const message = {
        payload: { scheduleIdentifier: 'sched-1', enabled: false },
        correlationId: 'corr-3',
      };

      await transport.handlers.get('scheduleToggle')!(message, client);

      expect(Core.scheduleToggle).toHaveBeenCalledWith('sched-1', false);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleToggle',
        IPCMessage.success({ scheduleIdentifier: 'sched-1', enabled: false }, 'corr-3')
      );
    });

    it('emits a failure message when Core.scheduleToggle rejects', async () => {
      vi.mocked(Core.scheduleToggle).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { scheduleIdentifier: 'sched-1', enabled: true },
        correlationId: 'corr-3',
      };

      await transport.handlers.get('scheduleToggle')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleToggle',
        IPCMessage.failure('boom', 'corr-3')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('scheduleToggle')!(
        { payload: { scheduleIdentifier: 'sched-1', enabled: true }, correlationId: 'x' },
        undefined
      );

      expect(Core.scheduleToggle).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('scheduleList', () => {
    it('resolves with the schedule list on success', async () => {
      const sample = [{ identifier: 'sched-1' }];
      vi.mocked(Core.scheduleList).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-4' };

      await transport.handlers.get('scheduleList')!(message, client);

      expect(Core.scheduleList).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleList',
        IPCMessage.success(sample, 'corr-4')
      );
    });

    it('emits a failure message when Core.scheduleList rejects', async () => {
      vi.mocked(Core.scheduleList).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-4' };

      await transport.handlers.get('scheduleList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScheduleList',
        IPCMessage.failure('boom', 'corr-4')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('scheduleList')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(Core.scheduleList).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });
});
