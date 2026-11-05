import path from 'path';
import { fileURLToPath } from 'url';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { coreEvents } from '@engine/CoreEvents.js';
import { ScheduleService } from '@database/services/ScheduleService.js';
import {
  assertCanEnable,
  onceFireDate,
  parseScheduleVariables,
  toScheduleEntry,
} from '@engine/runner/scheduleTiming.js';
import type { Schedule } from '@database/models/Schedule.js';
import {
  JOB_QUEUE_NAME,
  type IJobRunner,
  type JobPayload,
  type ScheduleEntry,
  type ScheduleOptions,
} from '@engine/runner/IJobRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolves to dist/engine/worker/BullMQWorker.js after tsc compilation.
const WORKER_PATH = path.resolve(__dirname, '../../../dist/engine/worker/BullMQWorker.js');

export class BullMQRunner implements IJobRunner {
  private queue: Queue;
  // null when concurrency === 0 (orchestrator-only mode — remote workers process jobs).
  private worker: Worker | null = null;
  private queueEvents: QueueEvents;

  constructor(redisUrl: string, concurrency = 4) {
    const connection = { url: redisUrl };

    this.queue = new Queue(JOB_QUEUE_NAME, { connection });

    if (concurrency > 0) {
      // Mirrored into process.env so a sandboxed job's child process (which inherits
      // process.env via child_process.fork) can open its own Queue connection to submit
      // a detached job — see SubmitDetachedJob.ts. Same variable WorkerServer.ts already
      // expects for its own (unrelated) standalone-worker deployment, so this unifies
      // rather than collides.
      process.env.REDIS_URL = redisUrl;
      // Sandboxed processor: each job runs in a separate child process for crash isolation.
      this.worker = new Worker(JOB_QUEUE_NAME, WORKER_PATH, { connection, concurrency });
    }

    // QueueEvents subscribes via Redis pub/sub — receives events from workers on any machine.
    this.queueEvents = new QueueEvents(JOB_QUEUE_NAME, { connection });

    // Re-emit task progress events (action / taskStart / taskEnd) onto coreEvents so
    // IpcTaskListener can forward them to the CLI/Desktop without any changes.
    this.queueEvents.on('progress', ({ data }: any) => {
      const { type, correlationId, data: eventData } = data ?? {};
      if (type && correlationId) {
        coreEvents.emit(`${type}:${correlationId}`, eventData);
      }
    });
  }

  async start(): Promise<void> {
    // THIS NEEDS TO BE TESTED
    /*
    const redisJobs = await this.queue.getRepeatableJobs();
    const redisKeys = new Set(redisJobs.map((j) => j.key));

    const schedules = await ScheduleService.list();
    for (const schedule of schedules) {
      if (!schedule.task) continue;
      const expectedKey = `cron-${schedule.identifier}`;
      const alreadyInRedis = redisJobs.some((j) => j.key.includes(schedule.identifier));
      if (!alreadyInRedis) {
        let variables: Record<string, any> = {};
        try { variables = JSON.parse(schedule.variables ?? '{}'); } catch { variables = {}; }
        await this.queue.add(
          'task',
          { type: 'exec', identifier: schedule.task.identifier, correlationId: '', variables },
          { repeat: { pattern: schedule.cron }, jobId: `cron-${schedule.identifier}` }
        );
      }
    }
    */
  }

  async stop(): Promise<void> {
    if (this.worker) await this.worker.close();
    await this.queue.close();
    await this.queueEvents.close();
  }

  async submit(job: JobPayload): Promise<void> {
    // waitUntilFinished checks completion state before subscribing, so it handles the
    // race where the job completes before the pending map entry could be set.
    const added = await this.queue.add('task', job);
    await added.waitUntilFinished(this.queueEvents);
  }

  /**
   * Queues a schedule's job: a repeatable one for a cron (BullMQ reads 6-field crons
   * with seconds too), a delayed one for a one-time schedule.
   */
  private async enqueue(schedule: Schedule, taskIdentifier: string): Promise<void> {
    const data = {
      type: 'exec',
      identifier: taskIdentifier,
      correlationId: '',
      variables: parseScheduleVariables(schedule.variables),
    } satisfies JobPayload;
    const jobId = `cron-${schedule.identifier}`;
    if (schedule.run_at) {
      const delay = onceFireDate(schedule.run_at).getTime() - Date.now();
      await this.queue.add('task', data, { delay, jobId });
    } else if (schedule.every_seconds) {
      await this.queue.add('task', data, { repeat: { every: schedule.every_seconds * 1000 }, jobId });
    } else {
      await this.queue.add('task', data, { repeat: { pattern: schedule.cron! }, jobId });
    }
  }

  private async dequeue(scheduleIdentifier: string): Promise<void> {
    const jobs = await this.queue.getRepeatableJobs();
    const match = jobs.find((j) => j.key.includes(scheduleIdentifier));
    if (match) await this.queue.removeRepeatableByKey(match.key);
    await this.queue.remove(`cron-${scheduleIdentifier}`).catch(() => {});
  }

  async scheduleTask(taskIdentifier: string, options: ScheduleOptions): Promise<string> {
    const schedule = await ScheduleService.create(
      taskIdentifier,
      { cron: options.cron, runAt: options.runAt, everySeconds: options.everySeconds },
      options.variables ?? {}
    );
    await this.enqueue(schedule, taskIdentifier);
    return schedule.identifier;
  }

  async removeSchedule(scheduleIdentifier: string): Promise<void> {
    await this.dequeue(scheduleIdentifier);
    await ScheduleService.remove(scheduleIdentifier);
  }

  async toggleSchedule(scheduleIdentifier: string, enabled: boolean): Promise<void> {
    if (enabled) {
      const schedule = await ScheduleService.getByIdentifier(scheduleIdentifier);
      if (!schedule) throw new Error(`Schedule "${scheduleIdentifier}" not found`);
      assertCanEnable(schedule);
      await ScheduleService.toggle(scheduleIdentifier, true);
      if (schedule.task) await this.enqueue(schedule, schedule.task.identifier);
    } else {
      await ScheduleService.toggle(scheduleIdentifier, false);
      await this.dequeue(scheduleIdentifier);
    }
  }

  async listSchedules(): Promise<ScheduleEntry[]> {
    const schedules = await ScheduleService.listAll();
    return schedules.map((s) => toScheduleEntry(s));
  }
}
