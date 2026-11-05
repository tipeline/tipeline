// Authorization for the app commands that reach workflows indirectly. `appRun` and
// `appHistoryFetch` name an app runnable, not a workflow, so the workflow is read from
// the app's stored source and the same rule as `exec` applies: a private workflow
// owned by someone else is reported as not found. `tableDataFetch` names the workflow
// directly (as `taskIdentifier`) and gets the same rule.

export interface AppAuthDeps {
  /** The app's stored detail (name + source JSON), or null when it doesn't exist. */
  getApp(appIdentifier: string): Promise<{ name?: string; source?: string } | null>;
  getOwner(taskIdentifier: string): Promise<{ user_id: string; visibility: string } | null>;
}

export type AppAuthResult =
  | { allowed: true; taskIdentifier?: string; appName?: string }
  | { allowed: false; error: 'App not found' | 'Workflow not found' };

export async function isHiddenWorkflow(
  taskIdentifier: string | undefined,
  user: { id: string; role: string },
  deps: Pick<AppAuthDeps, 'getOwner'>
): Promise<boolean> {
  if (!taskIdentifier || user.role === 'admin') return false;
  const owner = await deps.getOwner(taskIdentifier);
  return !!owner && owner.user_id !== user.id && owner.visibility === 'private';
}

/** The workflow an app runnable uses, from the app's stored source. */
export async function resolveAppRunnable(
  params: any,
  deps: Pick<AppAuthDeps, 'getApp'>
): Promise<{ taskIdentifier: string; appName: string } | null> {
  if (!params?.appIdentifier || !params?.pageId || !params?.runnable) return null;
  try {
    const app = await deps.getApp(params.appIdentifier);
    if (!app?.source) return null;
    const source = JSON.parse(app.source);
    const runnable = source?.pages?.find((p: any) => p?.id === params.pageId)?.runnables?.[
      params.runnable
    ];
    const taskIdentifier = runnable
      ? source?.workflows?.[runnable.workflow]?.identifier
      : undefined;
    return taskIdentifier ? { taskIdentifier, appName: app.name ?? params.appIdentifier } : null;
  } catch {
    return null;
  }
}

/**
 * For `appRunsList`: the app's workflow aliases (those asked for, or all) whose runs
 * the user may see — a private workflow owned by someone else is left out. null when
 * the app doesn't exist.
 */
export async function visibleAppWorkflows(
  params: any,
  user: { id: string; role: string },
  deps: AppAuthDeps
): Promise<{ aliases: string[]; appName: string } | null> {
  if (!params?.appIdentifier) return null;
  let workflows: Record<string, { identifier?: string }> = {};
  let appName = String(params.appIdentifier);
  try {
    const app = await deps.getApp(params.appIdentifier);
    if (!app?.source) return null;
    workflows = JSON.parse(app.source)?.workflows ?? {};
    appName = app.name ?? appName;
  } catch {
    return null;
  }
  const asked: string[] = Array.isArray(params.workflows) && params.workflows.length
    ? params.workflows.filter((a: unknown) => typeof a === 'string')
    : Object.keys(workflows);
  const aliases: string[] = [];
  for (const alias of asked) {
    const identifier = workflows[alias]?.identifier;
    if (identifier && !(await isHiddenWorkflow(identifier, user, deps))) aliases.push(alias);
  }
  return { aliases, appName };
}

export async function authorizeAppCommand(
  event: string,
  params: any,
  user: { id: string; role: string },
  deps: AppAuthDeps
): Promise<AppAuthResult> {
  if (event === 'tableDataFetch') {
    return (await isHiddenWorkflow(params?.taskIdentifier, user, deps))
      ? { allowed: false, error: 'Workflow not found' }
      : { allowed: true };
  }
  if (event === 'appRun' || event === 'appHistoryFetch') {
    const target = await resolveAppRunnable(params, deps);
    if (!target) return { allowed: false, error: 'App not found' };
    if (await isHiddenWorkflow(target.taskIdentifier, user, deps))
      return { allowed: false, error: 'Workflow not found' };
    return { allowed: true, ...target };
  }
  return { allowed: true };
}
