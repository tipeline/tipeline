import type { Item } from '@/config/tables/HomeRecentActivity';
import type { StreamEvent } from '@/store/stream';

/**
 * Runs as loaded from core, updated with the live stream events since: new runs appear as
 * they start and finished runs get their outcome. Newest first. Shared by the Activity page
 * and the dashboard's Recent runs card so both show the same status.
 */
export function mergeRunEvents(pipelines: Item[], events: StreamEvent[]): Item[] {
  const map = new Map<string, Item>();

  for (const p of pipelines) {
    map.set(p.identifier, { ...p });
  }

  const chronological = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // 'end' fires unconditionally in a `finally` block on both success and failure —
  // it only means "this attempt is over", not "it succeeded". The real outcome is
  // signaled by a separate 'error' event that shares the same correlationId (but,
  // unlike 'end', carries no pipelineIdentifier of its own).
  const failedCorrelationIds = new Set(
    chronological.filter((e) => e.type === 'error').map((e) => e.correlationId)
  );

  for (const event of chronological) {
    const pid = event.pipelineIdentifier;
    if (!pid) continue;

    if (event.type === 'start') {
      if (!map.has(pid)) {
        map.set(pid, {
          identifier: pid,
          status: 'running',
          started_at: new Date(event.timestamp).toISOString(),
          finished_at: null,
          task_name: event.data?.name ?? event.data?.taskIdentifier,
          task_identifier: event.data?.taskIdentifier,
        });
      } else {
        const p = map.get(pid)!;
        if (p.status !== 'completed') p.status = 'running';
      }
    } else if (event.type === 'action' && !map.has(pid)) {
      map.set(pid, {
        identifier: pid,
        status: 'running',
        started_at: new Date(event.timestamp).toISOString(),
        finished_at: null,
        task_identifier: event.data?.taskIdentifier,
      });
    } else if (event.type === 'end') {
      // A run that stopped at an approval step ends this attempt as 'paused'.
      const status = failedCorrelationIds.has(event.correlationId)
        ? 'failed'
        : event.data?.status === 'paused' || event.data?.status === 'canceled'
          ? event.data.status
          : 'completed';
      const p = map.get(pid) ?? {
        identifier: pid,
        status,
        started_at: new Date(event.timestamp).toISOString(),
        finished_at: null,
        task_identifier: event.data?.taskIdentifier,
      };
      p.status = status;
      p.finished_at = new Date(event.timestamp).toISOString();
      map.set(pid, p);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
    const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
    return bTime - aTime;
  });
}
