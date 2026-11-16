import { describe, expect, it, vi } from 'vitest';
import { PushNotifier, messageFor } from '../src/push/PushNotifier.js';
import { DEFAULT_PREFERENCES, type PushRecipient } from '../src/push/PushDeviceService.js';
import { LogSender } from '../src/push/senders.js';

const device = (user: { id: string; email: string; role: string }, over: Partial<PushRecipient> = {}): PushRecipient => ({
  id: `d-${user.id}`,
  userId: user.id,
  platform: 'ios',
  token: `tok-${user.id}`,
  locale: 'en',
  preferences: { ...DEFAULT_PREFERENCES },
  createdAt: '',
  lastSeenAt: '',
  user,
  ...over,
});
const ana = { id: 'u-ana', email: 'ana@acme.com', role: 'admin' };
const ed = { id: 'u-ed', email: 'ed@acme.com', role: 'editor' };
const vi_ = { id: 'u-vi', email: 'vi@acme.com', role: 'viewer' };
const boss = { id: 'u-boss', email: 'boss@acme.com', role: 'viewer' };

function setUp(over: Partial<ConstructorParameters<typeof PushNotifier>[0]> = {}) {
  const log = new LogSender();
  const all = [device(ana), device(ed), device(vi_), device(boss, { platform: 'android', locale: 'es-CR' })];
  const notifier = new PushNotifier(
    {
      senders: { ios: log, android: log },
      recipients: async (ids) => (ids ? all.filter((d) => ids.includes(d.user.id)) : all),
      forgetToken: vi.fn(async () => {}),
      getApproval: async () => ({ pipelineIdentifier: 'p1', taskIdentifier: 'wf', title: 'Pay INV-2041', approvers: null, allowSelfApproval: true }),
      getOwner: async () => ({ user_id: 'u-ana', visibility: 'shared' }),
      getRequester: async () => ({ id: 'u-ed', email: 'ed@acme.com' }),
      ...over,
    },
    0
  );
  const run = async (endData: Record<string, unknown>, children = false) => {
    await notifier.onCoreEvent('onTaskStart', { correlationId: 'c1', data: { pipelineIdentifier: 'p1' } });
    if (children) {
      await notifier.onCoreEvent('onTaskStart', { correlationId: 'c1', data: { pipelineIdentifier: 'child' } });
      await notifier.onCoreEvent('onTaskEnd', { correlationId: 'c1', data: { pipelineIdentifier: 'child', name: 'Sub', status: 'failed' } });
    }
    await notifier.onCoreEvent('onTaskEnd', { correlationId: 'c1', data: { pipelineIdentifier: 'p1', taskIdentifier: 'wf', name: 'Supplier payments', ...endData } });
  };
  return { log, run, all };
}
const tokens = (log: LogSender) => log.sent.map((s) => s.token);

describe('PushNotifier', () => {
  it('tells everyone who may decide when a run waits at an approval (editors and admins by default)', async () => {
    const { log, run } = setUp();
    await run({ status: 'paused' });
    expect(tokens(log)).toEqual(['tok-u-ana', 'tok-u-ed']);
    expect(log.sent[0].message).toMatchObject({ title: 'Approval needed', body: 'A run is waiting for your decision.', data: { kind: 'approval', pipelineIdentifier: 'p1' } });
  });

  it('follows the approvers a request names, the four-eyes rule and private workflows', async () => {
    const named = setUp({
      getApproval: async () => ({ pipelineIdentifier: 'p1', taskIdentifier: 'wf', approvers: ['boss@acme.com'], allowSelfApproval: false }),
    });
    await named.run({ status: 'paused' });
    expect(tokens(named.log)).toEqual(['tok-u-ana', 'tok-u-boss']);

    const fourEyes = setUp({
      getApproval: async () => ({ pipelineIdentifier: 'p1', taskIdentifier: 'wf', approvers: null, allowSelfApproval: false }),
    });
    await fourEyes.run({ status: 'paused' });
    expect(tokens(fourEyes.log)).toEqual(['tok-u-ana']); // ed started it

    const hidden = setUp({ getOwner: async () => ({ user_id: 'u-boss', visibility: 'private' }) });
    await hidden.run({ status: 'paused' });
    expect(tokens(hidden.log)).toEqual(['tok-u-ana']); // ed can't see boss's private workflow
  });

  it('announces an approval once', async () => {
    const { log, run } = setUp();
    await run({ status: 'paused' });
    await run({ status: 'paused' });
    expect(log.sent).toHaveLength(2);
  });

  it('tells whoever started a run that it failed, or the owner when nobody did', async () => {
    const started = setUp();
    await started.run({ status: 'failed' });
    expect(tokens(started.log)).toEqual(['tok-u-ed']);

    const scheduled = setUp({ getRequester: async () => null });
    await scheduled.run({ status: 'failed' });
    expect(tokens(scheduled.log)).toEqual(['tok-u-ana']);
  });

  it('tells about finished runs only when the device asked, and never about canceled ones', async () => {
    const off = setUp();
    await off.run({});
    await off.run({ status: 'canceled' });
    expect(off.log.sent).toEqual([]);

    const on = setUp();
    on.all[1].preferences.finished = true;
    await on.run({});
    expect(tokens(on.log)).toEqual(['tok-u-ed']);
  });

  it('only counts the run a request started, not its sub-workflows', async () => {
    const { log, run } = setUp();
    await run({}, true);
    expect(log.sent).toEqual([]);
  });

  it('forgets a device whose token is dead', async () => {
    const forgetToken = vi.fn(async () => {});
    const notifier = new PushNotifier(
      {
        senders: { ios: { send: async () => 'invalid' } },
        recipients: async () => [device(ed)],
        forgetToken,
        getApproval: async () => null,
        getOwner: async () => null,
        getRequester: async () => ({ id: 'u-ed', email: '' }),
      },
      0
    );
    await notifier.onCoreEvent('onTaskStart', { correlationId: 'c', data: { pipelineIdentifier: 'p' } });
    await notifier.onCoreEvent('onTaskEnd', { correlationId: 'c', data: { pipelineIdentifier: 'p', status: 'failed' } });
    expect(forgetToken).toHaveBeenCalledWith('tok-u-ed');
  });
});

describe('messageFor', () => {
  const run = { pipelineIdentifier: 'p1', workflowName: 'Supplier payments', approvalTitle: 'Pay INV-2041' };
  it('keeps workflow names off the lock screen unless the device turned details on', () => {
    const plain = messageFor('approval', { locale: 'en', preferences: { ...DEFAULT_PREFERENCES } }, run);
    expect(JSON.stringify([plain.title, plain.body])).not.toContain('Supplier');
    const detailed = messageFor('approval', { locale: 'en', preferences: { ...DEFAULT_PREFERENCES, details: true } }, run);
    expect(detailed.body).toBe('Supplier payments: Pay INV-2041');
  });

  it("speaks the phone's language", () => {
    expect(messageFor('failed', { locale: 'es-CR', preferences: { ...DEFAULT_PREFERENCES, details: true } }, run)).toMatchObject({
      title: 'Una ejecución falló',
      body: 'Supplier payments falló',
    });
  });
});
