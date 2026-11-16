import { decideBlock, type PendingApprovalItem } from '../ws/approvalAuthorization.js';
import type { PushDevice, PushPlatform, PushRecipient } from './PushDeviceService.js';
import type { PushMessage, PushSender } from './senders.js';

export type PushKind = 'approval' | 'failed' | 'finished';

export interface PushNotifierDeps {
  senders: Partial<Record<PushPlatform, PushSender>>;
  /** Devices of active users, optionally only these users. */
  recipients(userIds?: string[]): Promise<PushRecipient[]>;
  forgetToken(token: string): Promise<void>;
  /** The pending approval a run waits at (from Core's approvalList), or null. */
  getApproval(pipelineIdentifier: string): Promise<PendingApprovalItem | null>;
  getOwner(taskIdentifier: string): Promise<{ user_id: string; visibility: string } | null>;
  getRequester(pipelineIdentifier: string): Promise<{ id: string; email: string } | null>;
}

const TEXT = {
  en: {
    approval: { title: 'Approval needed', body: 'A run is waiting for your decision.', detail: (w: string, t: string) => (t ? `${w}: ${t}` : w) },
    failed: { title: 'A run failed', body: 'Open Tipeline to see what happened.', detail: (w: string) => `${w} failed` },
    finished: { title: 'A run finished', body: 'Open Tipeline to see the result.', detail: (w: string) => `${w} finished` },
  },
  es: {
    approval: { title: 'Aprobación pendiente', body: 'Una ejecución espera tu decisión.', detail: (w: string, t: string) => (t ? `${w}: ${t}` : w) },
    failed: { title: 'Una ejecución falló', body: 'Abre Tipeline para ver qué pasó.', detail: (w: string) => `${w} falló` },
    finished: { title: 'Una ejecución terminó', body: 'Abre Tipeline para ver el resultado.', detail: (w: string) => `${w} terminó` },
  },
};

/**
 * What a notification says. By default nothing on the lock screen names a workflow: run
 * names and inputs can be private. A device that turned `details` on gets the names.
 */
export function messageFor(
  kind: PushKind,
  device: Pick<PushDevice, 'locale' | 'preferences'>,
  run: { pipelineIdentifier: string; workflowName: string; approvalTitle?: string }
): PushMessage {
  const text = TEXT[device.locale?.toLowerCase().startsWith('es') ? 'es' : 'en'][kind];
  const details = device.preferences.details && run.workflowName;
  return {
    title: text.title,
    body: details ? text.detail(run.workflowName, run.approvalTitle ?? '') : text.body,
    data: { kind, pipelineIdentifier: run.pipelineIdentifier },
    threadId: kind,
  };
}

const PREFERENCE: Record<PushKind, 'approvals' | 'failures' | 'finished'> = {
  approval: 'approvals',
  failed: 'failures',
  finished: 'finished',
};

/**
 * Turns Core's run events into push notifications:
 *  - a run waiting at an approval → everyone who may decide it (the Approvals rules: who
 *    can see the workflow, the approvers it names, the four-eyes rule);
 *  - a failed run → whoever started it, or the workflow's owner for schedules and webhooks;
 *  - a finished run → whoever started it, when their device asked for those.
 * Only the run a request started counts, not the sub-workflows it calls.
 */
export class PushNotifier {
  /** correlationId → the top-level run's identifier (the first start on that stream). */
  private topRuns = new Map<string, string>();
  /** Approvals already announced, so a repeated event doesn't notify twice. */
  private announced = new Set<string>();

  constructor(
    private readonly deps: PushNotifierDeps,
    private readonly retryMs = 500
  ) {}

  /** Every event from Core goes through here; failures never reach the gateway. */
  async onCoreEvent(event: string, message: any): Promise<void> {
    try {
      await this.handle(event, message);
    } catch (err: any) {
      console.warn(`[Push] ${err?.message ?? err}`);
    }
  }

  private async handle(event: string, message: any): Promise<void> {
    const correlationId: string | undefined = message?.correlationId;
    if (!correlationId) return;
    const data = message?.data ?? {};

    if (event === 'onTaskStart') {
      if (!this.topRuns.has(correlationId) && data.pipelineIdentifier) this.topRuns.set(correlationId, data.pipelineIdentifier);
      if (this.topRuns.size > 5000) this.topRuns.delete(this.topRuns.keys().next().value!);
      return;
    }
    if (event === 'onTaskEndAll' || event === 'onTaskError') {
      // Let a run's own onTaskEnd (sent just before) finish first.
      setTimeout(() => this.topRuns.delete(correlationId), 1000).unref?.();
      return;
    }
    if (event !== 'onTaskEnd') return;
    const pipelineIdentifier: string | undefined = data.pipelineIdentifier;
    if (!pipelineIdentifier || this.topRuns.get(correlationId) !== pipelineIdentifier) return;

    const run = { pipelineIdentifier, workflowName: String(data.name ?? ''), taskIdentifier: String(data.taskIdentifier ?? '') };
    if (data.status === 'paused') return this.approvalNeeded(run);
    if (data.status === 'failed') return this.toStarter('failed', run, true);
    if (!data.status) return this.toStarter('finished', run, false);
  }

  private async approvalNeeded(run: { pipelineIdentifier: string; workflowName: string; taskIdentifier: string }) {
    const item = await this.deps.getApproval(run.pipelineIdentifier);
    if (!item) return;
    const key = `${run.pipelineIdentifier}:${(item as any).requestedAt ?? ''}`;
    if (this.announced.has(key)) return;
    this.announced.add(key);
    if (this.announced.size > 5000) this.announced.delete(this.announced.values().next().value!);

    const [devices, owner, requester] = await Promise.all([
      this.deps.recipients(),
      this.deps.getOwner(item.taskIdentifier),
      this.deps.getRequester(run.pipelineIdentifier),
    ]);
    const hiddenFrom = (userId: string, role: string) =>
      role !== 'admin' && !!owner && owner.user_id !== userId && owner.visibility === 'private';
    const chosen = devices.filter(
      (d) => !hiddenFrom(d.user.id, d.user.role) && decideBlock({ ...d.user }, item, requester) === null
    );
    await this.send('approval', chosen, { ...run, approvalTitle: String((item as any).title ?? '') });
  }

  private async toStarter(
    kind: 'failed' | 'finished',
    run: { pipelineIdentifier: string; workflowName: string; taskIdentifier: string },
    ownerWhenNoStarter: boolean
  ) {
    // A quick run can end before the Server has written down who started it: look once more.
    let requester = await this.deps.getRequester(run.pipelineIdentifier);
    if (!requester) {
      await new Promise((resolve) => setTimeout(resolve, this.retryMs));
      requester = await this.deps.getRequester(run.pipelineIdentifier);
    }
    let userId = requester?.id ?? null;
    if (!userId && ownerWhenNoStarter && run.taskIdentifier) {
      userId = (await this.deps.getOwner(run.taskIdentifier))?.user_id ?? null;
    }
    if (!userId) return;
    await this.send(kind, await this.deps.recipients([userId]), run);
  }

  private async send(kind: PushKind, devices: PushRecipient[], run: { pipelineIdentifier: string; workflowName: string; approvalTitle?: string }) {
    for (const device of devices) {
      if (!device.preferences[PREFERENCE[kind]]) continue;
      const sender = this.deps.senders[device.platform];
      if (!sender) continue;
      const result = await sender.send(device, messageFor(kind, device, run));
      if (result === 'invalid') await this.deps.forgetToken(device.token);
    }
  }
}
