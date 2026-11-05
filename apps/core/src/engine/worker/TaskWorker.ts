import { workerData, parentPort } from 'worker_threads';
import { Model } from 'objection';
import { DatabaseManager } from '@database/DatabaseManager.js';
import { coreEvents } from '@engine/CoreEvents.js';
import { DebugController } from '@engine/DebugController.js';
import { executeJob } from '@engine/worker/JobExecutor.js';
import { PluginLoader } from '@/plugin/PluginLoader.js';
import type { JobPayload } from '@engine/runner/IJobRunner.js';

const job = workerData as JobPayload;

// Each worker thread gets its own DB connection (WAL mode allows concurrent access).
const knex = DatabaseManager.init();
Model.knex(knex);

// Every job can be stopped (canceled, or the debugger's Stop); stepMode also starts in
// stepping (pause after each action).
// A debugger run (debugMode) also pauses at a failed step and at its breakpoints.
DebugController.enable(job.correlationId, job.stepMode ?? false, {
  debugMode: job.debugMode ?? false,
  breakpoints: job.breakpoints,
});

// Forward task events to the main thread so IpcTaskListener can relay them over IPC.
for (const eventType of ['action', 'taskStart', 'taskEnd', 'onTaskError', 'onTaskEndAll']) {
  coreEvents.on(`${eventType}:${job.correlationId}`, (data: unknown) => {
    parentPort?.postMessage({ type: eventType, data });
  });
}

// Forward debug-specific events to the main thread.
coreEvents.on(`paused:${job.correlationId}`, (data: unknown) => {
  parentPort?.postMessage({ type: 'paused', data });
});
coreEvents.on(`actionError:${job.correlationId}`, (data: unknown) => {
  parentPort?.postMessage({ type: 'actionError', data });
});

// Receive debug and cancel commands sent by BreeRunner and re-emit them on the local
// coreEvents so DebugController (running in this worker) can react.
parentPort?.on('message', (msg: any) => {
  if (
    typeof msg === 'object' &&
    typeof msg.type === 'string' &&
    (msg.type.startsWith('debug:') || msg.type === 'run:cancel')
  ) {
    coreEvents.emit(`${msg.type}:${job.correlationId}`, msg.data);
  }
});

PluginLoader.load()
  .catch((err) => console.error('[TaskWorker] PluginLoader failed:', err))
  .then(() => executeJob(job))
  .finally(() => knex.destroy())
  .then(() => parentPort?.postMessage('done'))
  .catch((err: any) =>
    parentPort?.postMessage({ type: 'error', message: err?.message ?? String(err) })
  );
