import { Job } from 'bullmq';
import { Model } from 'objection';
import { DatabaseManager } from '@database/DatabaseManager.js';
import { coreEvents } from '@engine/CoreEvents.js';
import { executeJob } from '@engine/worker/JobExecutor.js';
import type { JobPayload } from '@engine/runner/IJobRunner.js';

// Each worker process gets its own DB connection (WAL mode allows concurrent access).
const knex = DatabaseManager.init();
Model.knex(knex);

// BullMQ processor — exported as default so BullMQ can load this file as a sandboxed processor.
export default async function process(job: Job<JobPayload>) {
  const { correlationId } = job.data;

  // Forward task events back via updateProgress so the runner can re-emit them on
  // coreEvents in the main process and reach IpcTaskListener.
  for (const eventType of ['action', 'taskStart', 'taskEnd']) {
    coreEvents.on(`${eventType}:${correlationId}`, (data: unknown) => {
      job.updateProgress({ type: eventType, correlationId, data });
    });
  }

  await executeJob(job.data);
}
