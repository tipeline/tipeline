#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'bullmq';
import { initializeDatabase } from '@database/initDatabase.js';
import { JOB_QUEUE_NAME } from '@engine/runner/IJobRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// After build: dist/engine/worker/WorkerServer.js — BullMQWorker.js is in the same folder.
const WORKER_PATH = path.resolve(__dirname, 'BullMQWorker.js');

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL environment variable is required');

const concurrency = parseInt(process.env.WORKER_CONCURRENCY ?? '4', 10);
const workerId = process.env.WORKER_ID ?? 'worker';

(async () => {
  try {
    await initializeDatabase();

    const worker = new Worker(JOB_QUEUE_NAME, WORKER_PATH, {
      connection: { url: redisUrl },
      concurrency,
    });

    worker.on('completed', (job) => console.log(`[${workerId}] Job ${job?.id} completed`));
    worker.on('failed', (job, err) =>
      console.error(`[${workerId}] Job ${job?.id} failed:`, err.message)
    );

    console.log(
      `Tipeline Worker [${workerId}] started — queue: ${JOB_QUEUE_NAME}, concurrency: ${concurrency}`
    );

    const shutdown = async () => {
      await worker.close();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('Failed to initialize worker:', err);
    process.exit(1);
  }
})();
