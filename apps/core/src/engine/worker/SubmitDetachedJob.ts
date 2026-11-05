import { parentPort } from 'worker_threads';
import { Queue } from 'bullmq';
import { JOB_QUEUE_NAME, type JobPayload } from '@engine/runner/IJobRunner.js';

// Lazily constructed and reused for the life of this process — a sandboxed BullMQ
// job process handles jobs for its own lifetime, so a single persistent connection
// is correct here, not one opened/closed per detached-job submission.
let bullmqQueue: Queue | null = null;

function getBullMQQueue(): Queue {
  if (!bullmqQueue) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error(
        'submitDetachedJob: REDIS_URL is not set in this process — cannot submit a ' +
          'detached job under the BullMQ runner. Expected BullMQRunner to have mirrored ' +
          'it into process.env before forking this worker.'
      );
    }
    bullmqQueue = new Queue(JOB_QUEUE_NAME, { connection: { url: redisUrl } });
  }
  return bullmqQueue;
}

/**
 * Hands a job off to the job infrastructure and resolves once it's enqueued — never
 * awaits the job's own completion. Used by subtask.exec(async: true) to run a detached
 * child in its own worker thread/process instead of the caller's, so the two can't
 * collide over process-global state the way two same-process actions can (see
 * execution-flow.md's "Async Subtasks" section for the Lighthouse bug that motivated
 * this).
 *
 * Discriminates purely on `parentPort`: action code (and therefore this function) only
 * ever runs inside a Bree worker_thread (TaskWorker.ts, where `parentPort` is always
 * non-null) or a BullMQ sandboxed child process (BullMQWorker.ts, forked via
 * child_process, so `parentPort` is always null) — there is no third case.
 */
export async function submitDetachedJob(job: JobPayload): Promise<void> {
  if (parentPort) {
    // Fire-and-forget: BreeRunner.ts's worker.on('message', ...) picks this up and
    // calls its own submit() on our behalf. Messages on one MessagePort are delivered
    // in order, and this worker always sends 'submitJob' before it later sends 'done'
    // (which is what triggers Bree to terminate it) — so there's no ordering race to
    // guard against here.
    parentPort.postMessage({ type: 'submitJob', payload: job });
    return;
  }

  await getBullMQQueue().add('task', job);
}
