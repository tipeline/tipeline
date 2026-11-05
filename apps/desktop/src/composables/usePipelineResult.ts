import { ref } from 'vue';

export function usePipelineResult(response: any, timelineActions: any) {
  const source = response?.value?.source || response?.source;
  const executionActions = response?.value?.actions || response?.actions;

  if (!source || !executionActions) {
    console.warn('Missing source or execution actions in response');
    return timelineActions;
  }

  try {
    const parsedSource = JSON.parse(source);
    const pipelineActions = parsedSource?.pipeline?.actions || [];

    // Map of execution results by identifier. A loop body's actions run once
    // per iteration, each in its own block, but keep the same static
    // identifier — so a given identifier can have several records here, one
    // per iteration, ordered by the block they ran in (i.e. execution order).
    const executionMap = new Map<string, any[]>();
    executionActions.forEach((action: any) => {
      const records = executionMap.get(action.identifier) ?? [];
      records.push({
        status: action.status,
        result: action.result,
        params: action.params,
        error: action.error,
        started_at: action.started_at,
        finished_at: action.finished_at,
        // Served from the result cache (stored as 0/1).
        cached: !!action.cached,
        blockId: action.block_id,
        iteration: action.block?.iteration ?? null,
      });
      executionMap.set(action.identifier, records);
    });
    executionMap.forEach((records) =>
      records.sort((a, b) => (a.blockId ?? 0) - (b.blockId ?? 0))
    );

    // Recursive function to enrich actions with execution data
    function enrichActionsWithExecutionData(actions: any[]): any[] {
      return actions
        .filter((action) => !action.disabled)
        .map((action) => {
          // Clone the action to avoid mutating original data
          const enrichedAction = { ...action };

          // Add execution data if available. When there are multiple records
          // (a loop body action), the top-level fields reflect the latest
          // iteration for backward compatibility, and `iterations` carries
          // every pass for the UI to show on request.
          const records = executionMap.get(action.identifier);
          const executionData = records?.[records.length - 1];
          if (executionData) {
            enrichedAction.status = executionData.status;
            enrichedAction.result = executionData.result;
            enrichedAction.error = executionData.error;
            enrichedAction.started_at = executionData.started_at;
            enrichedAction.finished_at = executionData.finished_at;
            enrichedAction.cached = executionData.cached;
            // Prefer the resolved params persisted after execution over the
            // pristine `{{ }}`/`{= =}` templates from the pipeline source.
            if (
              executionData.params !== undefined &&
              executionData.params !== null
            ) {
              enrichedAction.params = executionData.params;
            }
            if (records!.length > 1) {
              enrichedAction.iterations = records!.map((record, idx) => ({
                index: record.iteration ?? idx + 1,
                status: record.status,
                result: record.result,
                params: record.params,
                error: record.error,
                started_at: record.started_at,
                finished_at: record.finished_at,
              }));
            }
          } else {
            // Default status if no execution data found
            enrichedAction.status = 'pending';
          }

          // Handle nested actions (e.g., in loops or conditional blocks)
          if (action.params?.actions && Array.isArray(action.params.actions)) {
            enrichedAction.params = {
              ...enrichedAction.params,
              actions: enrichActionsWithExecutionData(action.params.actions),
            };
          }

          return enrichedAction;
        });
    }

    // Enrich the pipeline actions with execution data
    timelineActions.value = enrichActionsWithExecutionData(pipelineActions);
  } catch (e) {
    console.error('Failed to parse or process pipeline data:', e);
    timelineActions.value = [];
  }

  return timelineActions;
}
