// App runs in progress, kept while their `appRun` request is open (which lasts exactly
// as long as the run). Lets a window that opens an app page mid-run — another window,
// or the same one after navigating away and back — show the run instead of an idle
// form. In memory only: a run doesn't outlive the core process that runs it.

export interface ActiveAppRun {
  /** The appRun request's correlationId — the run's events go out on it. */
  correlationId: string;
  appIdentifier: string;
  pageId: string;
  runnable: string;
  /** Empty until the workflow has started. */
  pipelineIdentifier: string;
  startedAt: number;
  /** Workflow steps finished so far (sub-workflow steps included). */
  steps: number;
  /** The step that last finished. */
  lastStep: string;
}

const runs = new Map<string, ActiveAppRun>();

export const ActiveAppRuns = {
  add(run: Omit<ActiveAppRun, 'pipelineIdentifier' | 'steps' | 'lastStep'>): ActiveAppRun {
    const entry: ActiveAppRun = { ...run, pipelineIdentifier: '', steps: 0, lastStep: '' };
    runs.set(run.correlationId, entry);
    return entry;
  },

  remove(correlationId: string): void {
    runs.delete(correlationId);
  },

  /** Runs of an app (optionally one page), oldest first. */
  list(params: { appIdentifier: string; pageId?: string }): ActiveAppRun[] {
    return [...runs.values()]
      .filter(
        (r) =>
          r.appIdentifier === params.appIdentifier && (!params.pageId || r.pageId === params.pageId)
      )
      .map((r) => ({ ...r }));
  },
};
