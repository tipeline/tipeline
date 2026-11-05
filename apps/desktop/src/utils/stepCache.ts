/** How a run uses the result cache, as the Run menu and the debugger offer it. */
export type RunCacheChoice = 'use' | 'bypass' | 'refresh';

/**
 * Whether any step (nested ones included) has a `cache` setting — only then does
 * running without the cache, or refreshing it, change anything. The workflow's own
 * `cache` doesn't count: a run from the Desktop asks for no outputs, so it always runs.
 */
export function hasStepCache(actions: any[] | undefined): boolean {
  return (actions ?? []).some(
    (action) =>
      !!action?.cache ||
      hasStepCache(action?.params?.actions) ||
      (action?.params?.statements ?? []).some((statement: any) => hasStepCache(statement?.actions))
  );
}
