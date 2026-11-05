import { fileURLToPath } from 'url';
import path from 'path';
import Bree from 'bree';
import { coreEvents } from '@engine/CoreEvents.js';
import { ScheduleService } from '@database/services/ScheduleService.js';
import { PipelineService } from '@database/services/PipelineService.js';
import { cronHasSeconds } from '@tipeline/utils';
import {
  assertCanEnable,
  onceFireDate,
  parseScheduleVariables,
  toScheduleEntry,
} from '@engine/runner/scheduleTiming.js';
import type { Schedule } from '@database/models/Schedule.js';
import { TaskStreamListener } from '@engine/TaskStreamListener.js';
import IPCMessage from '@engine/IPCMessage.js';
import type {
  IJobRunner,
  JobPayload,
  ScheduleEntry,
  ScheduleOptions,
} from '@engine/runner/IJobRunner.js';

const WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../worker/TaskWorker.js'
);

type PendingJob = { resolve: () => void; reject: (err: Error) => void };

// How long running jobs get to end after being canceled, before they're ended for them.
const STOP_GRACE_MS = 5000;

export class BreeRunner implements IJobRunner {
  private bree: Bree;
  private pending = new Map<string, PendingJob>();
  private broadcastFn: ((event: string, data: any) => void) | null = null;
  // Listeners we create ourselves for jobs with no orchestrator-side caller already
  // holding one — cron jobs (self-triggered by Bree) and detached subtask jobs
  // (submitted from inside another job's action code via submitDetachedJob).
  private streamListeners = new Map<string, TaskStreamListener>();
  // Jobs running now (correlationId → the runs they started: the workflow's, then any
  // sync sub-workflow's), so a run can be canceled by its pipelineIdentifier.
  private running = new Map<string, Set<string>>();
  // Bree job names of one-time schedules: removed from Bree once their run ends.
  private onceJobs = new Set<string>();

  setBroadcast(fn: (event: string, data: any) => void): void {
    this.broadcastFn = fn;
  }

  constructor(_concurrency = 10) {
    this.bree = new Bree({ root: false, jobs: [] });

    const workerErrors = new Map<string, Error>();

    // correlationId → cleanup function for debug event forwarding
    const debugCleanups = new Map<string, () => void>();

    (this.bree as any).on('worker created', (name: string) => {
      const worker = (this.bree as any).workers.get(name);
      if (!worker) return;

      const correlationId = name.replace(/^job-/, '');
      const runs = new Set<string>();
      this.running.set(correlationId, runs);

      // For cron jobs: wire a TaskStreamListener so events reach IPC/WS clients.
      if (name.startsWith('cron-') && this.broadcastFn) {
        const listener = new TaskStreamListener(correlationId, this.broadcastFn);
        listener.bind();
        this.streamListeners.set(name, listener);
      }
      // A schedule fired: note when (a one-time schedule also turns itself off).
      if (name.startsWith('cron-')) {
        ScheduleService.markLastRun(name.slice('cron-'.length)).catch((err: Error) =>
          console.error(`[BreeRunner] Failed to record the run of ${name}:`, err)
        );
      }

      // An uncaught error in the job (a step's server failing to listen, say) kills the
      // thread without an 'error' message: remember it so the run doesn't count as done.
      worker.on('error', (err: Error) => {
        if (!workerErrors.has(name)) workerErrors.set(name, err);
      });

      worker.on('message', (msg: any) => {
        if (msg.type === 'action') {
          coreEvents.emit(`action:${correlationId}`, msg.data);
        } else if (msg.type === 'taskStart') {
          if (msg.data?.pipelineIdentifier) runs.add(msg.data.pipelineIdentifier);
          coreEvents.emit(`taskStart:${correlationId}`, msg.data);
        } else if (msg.type === 'taskEnd') {
          coreEvents.emit(`taskEnd:${correlationId}`, msg.data);
        } else if (msg.type === 'paused') {
          coreEvents.emit(`paused:${correlationId}`, msg.data);
        } else if (msg.type === 'actionError') {
          coreEvents.emit(`actionError:${correlationId}`, msg.data);
        } else if (msg.type === 'error') {
          workerErrors.set(name, new Error(msg.message ?? 'Worker error'));
          // The worker keeps a live 'message' listener on parentPort for debug-command
          // forwarding, which refs the thread and prevents it from exiting on its own.
          // Bree only force-terminates on the literal 'done' message (its happy path),
          // so on error we must terminate explicitly or 'worker deleted' never fires and
          // the pending submit() promise hangs forever.
          worker.terminate();
        } else if (msg.type === 'submitJob') {
          // A subtask.exec(async: true) call inside this worker's action code — hands
          // its detached child off to its own new worker thread via SubmitDetachedJob.ts.
          // Deliberately not tracked in `this.pending`: nothing awaits a detached job.
          //
          // Nobody generated this correlationId in the orchestrator process ahead of
          // time (unlike a top-level exec/run/resume request), so nobody else will ever
          // bind a TaskStreamListener for it — wire one here, same as the cron branch
          // above, so its progress still reaches IPC/WS clients live.
          const childCorrelationId = msg.payload.correlationId;
          if (this.broadcastFn) {
            const listener = new TaskStreamListener(childCorrelationId, this.broadcastFn);
            listener.bind();
            this.streamListeners.set(`job-${childCorrelationId}`, listener);
          }
          this.submit(msg.payload).catch((err: Error) => {
            console.error('[BreeRunner] Failed to submit detached job:', err);
            // No caller is awaiting this submission to catch and broadcast the failure
            // the way taskHandlers.ts does for a top-level request — do it here instead,
            // otherwise a failed detached job would never show as failed live.
            this.broadcastFn?.(
              'onTaskError',
              IPCMessage.failure(err.message ?? String(err), childCorrelationId)
            );
          });
        }
      });

      // Forward debug and cancel commands from the main process to the worker thread.
      const debugTypes = ['debug:next', 'debug:run', 'debug:pause', 'debug:stop', 'debug:command', 'run:cancel'] as const;
      const handlers: Array<() => void> = debugTypes.map((evt) => {
        const handler = (data?: unknown) => worker.postMessage({ type: evt, data });
        coreEvents.on(`${evt}:${correlationId}`, handler);
        return () => coreEvents.off(`${evt}:${correlationId}`, handler);
      });
      debugCleanups.set(correlationId, () => handlers.forEach((off) => off()));
    });

    // Fires when a worker exits — either after receiving 'done' or after a natural exit.
    // This is the single place we settle the pending promise for submit() jobs.
    (this.bree as any).on('worker deleted', (name: string) => {
      const correlationId = name.replace(/^job-/, '');
      const runs = [...(this.running.get(correlationId) ?? [])];
      this.running.delete(correlationId);
      debugCleanups.get(correlationId)?.();
      debugCleanups.delete(correlationId);

      // Clean up a self-created stream listener (cron or detached subtask job) if one exists.
      const streamListener = this.streamListeners.get(name);
      if (streamListener) {
        streamListener.unbind();
        this.streamListeners.delete(name);
      }

      // A one-time schedule's job is done for good.
      if (this.onceJobs.delete(name)) {
        (this.bree as any).remove(name).catch(() => {});
      }

      const err = workerErrors.get(name);
      workerErrors.delete(name);

      // A run that ended normally already says so; one still running lost its worker
      // (a crash) and would otherwise show as running forever, with nothing to cancel.
      const message = `The run stopped unexpectedly${err?.message ? `: ${err.message}` : ''}`;
      const ended = PipelineService.failAbandoned(runs, message).catch((error: Error) => {
        console.error(`[BreeRunner] Failed to end the runs of ${name}:`, error);
        return [] as string[];
      });

      const pending = this.pending.get(name);
      if (!pending) return;
      this.pending.delete(name);

      void ended.then((abandoned) => {
        if (err) pending.reject(err);
        else if (abandoned.length) pending.reject(new Error(message));
        else pending.resolve();
      });
    });
  }

  /**
   * Adds a schedule's job to Bree (not started): a cron — with seconds when it has 6
   * fields — or, for a one-time schedule, a date.
   */
  private async register(schedule: Schedule, taskIdentifier: string): Promise<string> {
    const name = `cron-${schedule.identifier}`;
    const timing = schedule.run_at
      ? { date: onceFireDate(schedule.run_at) }
      : schedule.every_seconds
        ? // First run one interval after it's turned on, then every interval.
          { interval: schedule.every_seconds * 1000 }
        : { cron: schedule.cron, hasSeconds: cronHasSeconds(schedule.cron ?? '') };
    if (schedule.run_at) this.onceJobs.add(name);
    else this.onceJobs.delete(name);
    await (this.bree as any).add({
      name,
      path: WORKER_PATH,
      ...timing,
      worker: {
        workerData: {
          type: 'exec',
          identifier: taskIdentifier,
          correlationId: `cron-${schedule.identifier}-${Date.now()}`,
          variables: parseScheduleVariables(schedule.variables),
        } satisfies JobPayload,
      },
    });
    return name;
  }

  private async startJob(name: string): Promise<void> {
    await (this.bree as any)
      .start(name)
      .catch((err: Error) => console.error(`[BreeRunner] Failed to start ${name}:`, err));
  }

  async start(): Promise<void> {
    const schedules = await ScheduleService.list();
    for (const schedule of schedules) {
      if (schedule.task) await this.register(schedule, schedule.task.identifier);
    }
    await (this.bree as any).start();
  }

  /**
   * Re-registers every enabled cron schedule from scratch, discarding whatever
   * timer state Bree currently holds. Intended to be called after a detected
   * system sleep/wake, where in-process timers can silently fail to re-arm.
   */
  async resync(): Promise<void> {
    const schedules = await ScheduleService.list();
    for (const schedule of schedules) {
      if (!schedule.task) continue;
      await (this.bree as any).remove(`cron-${schedule.identifier}`).catch(() => {});
      await this.startJob(await this.register(schedule, schedule.task.identifier));
    }
  }

  /** Bree only waits for jobs to end, so interrupting cancels them, and ends any that ignore that. */
  async stop(options: { interrupt?: boolean } = {}): Promise<void> {
    const bree = this.bree as any;
    const allEnded: Promise<void> = bree.stop();
    if (options.interrupt) {
      for (const correlationId of this.running.keys()) this.cancel(correlationId, 'Tipeline');
      await Promise.race([allEnded, new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS))]);
      for (const worker of bree.workers.values()) worker.terminate();
    }
    await allEnded;
    for (const [, { reject }] of this.pending) {
      reject(new Error('Runner stopped'));
    }
    this.pending.clear();
  }

  activeJobs(): number {
    return (this.bree as any).workers.size;
  }

  cancel(correlationId: string, canceledBy: string): boolean {
    if (!this.running.has(correlationId)) return false;
    coreEvents.emit(`run:cancel:${correlationId}`, { canceledBy });
    return true;
  }

  findJob(pipelineIdentifier: string): string | null {
    for (const [correlationId, runs] of this.running) {
      if (runs.has(pipelineIdentifier)) return correlationId;
    }
    return null;
  }

  async submit(job: JobPayload): Promise<void> {
    if (!job.correlationId || job.correlationId.trim() === '') {
      throw new Error('BreeRunner.submit: correlationId must be non-empty');
    }
    const jobName = `job-${job.correlationId}`;

    await (this.bree as any).add({
      name: jobName,
      path: WORKER_PATH,
      worker: { workerData: job },
    });

    return new Promise<void>((resolve, reject) => {
      this.pending.set(jobName, { resolve, reject });
      (this.bree as any).run(jobName).catch(reject);
    });
  }

  async scheduleTask(taskIdentifier: string, options: ScheduleOptions): Promise<string> {
    const schedule = await ScheduleService.create(
      taskIdentifier,
      { cron: options.cron, runAt: options.runAt, everySeconds: options.everySeconds },
      options.variables ?? {}
    );
    await this.startJob(await this.register(schedule, taskIdentifier));
    return schedule.identifier;
  }

  async removeSchedule(scheduleIdentifier: string): Promise<void> {
    await ScheduleService.remove(scheduleIdentifier);
    // Stop and remove from Bree non-blockingly — the DB delete above already prevents
    // re-registration on restart, so a running worker can finish naturally.
    (this.bree as any)
      .remove(`cron-${scheduleIdentifier}`)
      .catch((err: Error) => console.error('[BreeRunner] Failed to remove schedule:', err));
  }

  async toggleSchedule(scheduleIdentifier: string, enabled: boolean): Promise<void> {
    const jobName = `cron-${scheduleIdentifier}`;
    if (enabled) {
      const schedule = await ScheduleService.getByIdentifier(scheduleIdentifier);
      if (!schedule) throw new Error(`Schedule "${scheduleIdentifier}" not found`);
      assertCanEnable(schedule);
      await ScheduleService.toggle(scheduleIdentifier, true);
      if (!schedule.task) return;
      // Remove any stale registration before re-adding (handles sleep/restart edge cases)
      await (this.bree as any).remove(jobName).catch(() => {});
      await this.startJob(await this.register(schedule, schedule.task.identifier));
    } else {
      await ScheduleService.toggle(scheduleIdentifier, false);
      this.onceJobs.delete(jobName);
      (this.bree as any)
        .remove(jobName)
        .catch((err: Error) => console.error('[BreeRunner] Failed to remove schedule:', err));
    }
  }

  async listSchedules(): Promise<ScheduleEntry[]> {
    const schedules = await ScheduleService.listAll();
    return schedules.map((s) => toScheduleEntry(s));
  }
}
