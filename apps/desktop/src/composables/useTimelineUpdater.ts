// composables/useTimelineUpdater.ts
import { toRaw } from 'vue';

// Deep-clones event data that may contain Vue reactive proxies (event.data
// comes from the streamStore, itself reactive). structuredClone can't clone
// a Proxy directly — toRaw() unwraps it back to the plain underlying object
// first (Vue never replaces a reactive target's own properties with proxies,
// it only wraps on access, so the raw target's whole graph is plain).
function cloneEventData(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  return structuredClone(toRaw(value));
}

// A run in one of these can still send events; any other status has ended.
const ACTIVE_RUN_STATUSES = ['pending', 'running', 'paused'];

/**
 * Live events for a run page, only while the run is going. A finished run's saved steps
 * are the record: an event's timestamp is when it reached this window, so a burst of fast
 * steps would all "finish" together and each saved duration would be replaced by the delay.
 */
export function applyLiveEvents(timelineActions: any[], events: any[], runStatus?: string) {
  if (!runStatus || !ACTIVE_RUN_STATUSES.includes(runStatus)) return;
  updateTimelineWithEvents(timelineActions, events);
}

export function updateTimelineWithEvents(
  timelineActions: any[],
  events: any[]
) {
  if (!timelineActions || !events) return;

  // Map of the latest event per identifier (used for status/progress logic
  // below, which only cares about "has this identifier's action finished").
  const eventMap = new Map();
  // Map of every event per identifier, in arrival order — a loop body action
  // fires one 'action' event per iteration under the same identifier, so this
  // is what lets the timeline show every pass instead of just the last one.
  const eventsByIdentifier = new Map<string, any[]>();

  // 'action' is a step that finished; 'action_error' is a step that failed (core sends
  // only that — no 'action' — for the step that threw).
  events.forEach((event) => {
    if ((event.type === 'action' || event.type === 'action_error') && event.data?.identifier) {
      const identifier = event.data.identifier;
      // Keep only the latest event for each identifier
      if (
        !eventMap.has(identifier) ||
        event.timestamp > eventMap.get(identifier).timestamp
      ) {
        eventMap.set(identifier, event);
      }

      const list = eventsByIdentifier.get(identifier) ?? [];
      list.push(event);
      eventsByIdentifier.set(identifier, list);
    }
  });

  // Helper function to find and mark the next pending action as running
  function markNextActionAsRunning(
    actions: any[],
    parentIsCompleted: boolean = true
  ): boolean {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      // A disabled step (the debugger lists them) never runs: look past it.
      if (action.status === 'skipped') continue;

      // If we find a pending action and all previous actions are done, mark it as running
      if (action.status === 'pending' && parentIsCompleted) {
        action.status = 'running';
        // Set started_at to the timestamp of the last completed action
        const lastEvent = Array.from(eventMap.values()).sort(
          (a, b) => b.timestamp - a.timestamp
        )[0];
        if (lastEvent) {
          action.started_at = new Date(lastEvent.timestamp).toISOString();
        }
        return true; // Found and marked one, stop searching
      }

      // If this action is completed and has nested actions, check them
      if (
        action.status === 'completed' &&
        action.params?.actions &&
        Array.isArray(action.params.actions)
      ) {
        const marked = markNextActionAsRunning(action.params.actions, true);
        if (marked) return true; // If we found one in nested actions, stop
      }

      // If this action is not completed yet, don't check further actions
      if (action.status !== 'completed') {
        break;
      }
    }
    return false;
  }

  // Recursive function to update actions with event data
  function updateActionsRecursively(actions: any[]) {
    actions.forEach((action) => {
      const event = eventMap.get(action.identifier);

      // Skip re-applying an event this action already has — both because it's
      // redundant, and because event.data.result/params come from the
      // reactive stream store: assigning them directly (rather than cloning)
      // aliases the same reactive object into the timeline's own reactive
      // tree, which can make Vue re-fire this event's watchers indefinitely.
      if (event && event.data && action._appliedEventTimestamp !== event.timestamp) {
        // Loop body actions reuse the same identifier every iteration and
        // core only emits a completion event (no per-iteration "start"). So
        // an already-completed action completing again is itself the signal
        // that a new iteration has begun — reset its siblings so the loop
        // body visibly re-runs live instead of staying green after the first
        // pass (the full history is still preserved below via `iterations`).
        // Only when an earlier *event* completed it: a step the saved run already shows as
        // completed (the tree just reloaded when the run ended) getting its events
        // re-applied is the same pass, and resetting would wipe its siblings' saved
        // statuses — a failed step that has no event of its own would read as not run.
        if (action.status === 'completed' && action._appliedEventTimestamp !== undefined) {
          for (const sibling of actions) {
            // A disabled step stays skipped; one left out in the debugger runs next pass.
            const disabled = sibling.status === 'skipped' && !sibling.skippedByUser;
            if (sibling !== action && sibling.status !== 'pending' && !disabled) {
              sibling.status = 'pending';
              delete sibling.skippedByUser;
              delete sibling.started_at;
              delete sibling.finished_at;
            }
          }
        }

        action._appliedEventTimestamp = event.timestamp;
        if (event.type === 'action_error') {
          action.status = 'failed';
          action.error = event.data.error;
        } else if (event.data.skipped) {
          // Left out in the debugger: it didn't run.
          action.status = 'skipped';
          action.skippedByUser = true;
          delete action.error;
        } else {
          action.status = 'completed';
          action.result = cloneEventData(event.data.result);
          // Served from the result cache instead of running.
          action.cached = !!event.data.cached;
          delete action.error;
        }
        action.finished_at = new Date(event.timestamp).toISOString();

        // If we don't have a started_at, estimate it (you might want to adjust this)
        if (!action.started_at) {
          // Use a small offset before finished time or the same timestamp
          action.started_at = new Date(event.timestamp - 10).toISOString();
        }

        // Update params if provided in event
        if (event.data.params) {
          // Preserve nested actions if they exist
          const existingActions = action.params?.actions;
          action.params = cloneEventData(event.data.params);
          if (existingActions && !event.data.params.actions) {
            action.params.actions = existingActions;
          }
        }
      }

      // A loop body action fires multiple events under the same identifier —
      // surface every pass, not just the latest, once more than one has arrived.
      const identifierEvents = eventsByIdentifier.get(action.identifier);
      if (
        identifierEvents &&
        identifierEvents.length > 1 &&
        action._iterationsCount !== identifierEvents.length
      ) {
        action._iterationsCount = identifierEvents.length;
        action.iterations = identifierEvents.map((e, idx) => ({
          index: idx + 1,
          status: e.type === 'action_error' ? 'failed' : e.data.skipped ? 'skipped' : 'completed',
          result: cloneEventData(e.data.result),
          error: e.type === 'action_error' ? e.data.error : undefined,
          params: cloneEventData(e.data.params),
          finished_at: new Date(e.timestamp).toISOString(),
        }));
      }

      // Recursively update nested actions
      if (action.params?.actions && Array.isArray(action.params.actions)) {
        updateActionsRecursively(action.params.actions);
      }
    });
  }

  // Update the timeline actions
  updateActionsRecursively(timelineActions);

  // Check if pipeline has ended (see useStreamListenerPipeline for why both
  // 'end' and 'end_all' are checked)
  const hasEndEvent = events.some((e) => e.type === 'end' || e.type === 'end_all' || e.type === 'error');

  if (!hasEndEvent) {
    // Pipeline is still running, mark only the next pending action as running
    markNextActionAsRunning(timelineActions);
  } else {
    // Pipeline has ended, mark any remaining 'running' actions as completed
    function finalizeActions(actions: any[]) {
      actions.forEach((action) => {
        if (action.status === 'running') {
          action.status = 'completed';
          if (!action.finished_at) {
            const endEvent = events.find((e) => e.type === 'end' || e.type === 'end_all' || e.type === 'error');
            action.finished_at = new Date(endEvent.timestamp).toISOString();
          }
        }
        if (action.params?.actions) {
          finalizeActions(action.params.actions);
        }
      });
    }
    finalizeActions(timelineActions);
  }
}
