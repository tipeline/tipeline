import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { toast } from '@/components/ui/sonner';

type Assigned = { alsoAdded?: { identifier: string; name: string }[] };

/** A project a workflow or app is in, as Core lists it. */
export type ProjectTag = { identifier: string; name: string; color: string | null };

/** The identifiers of the projects a workflow or app (as Core lists it) is in. */
export const projectIdsOf = (item: { projects?: ProjectTag[] | null } | null | undefined): string[] =>
  (item?.projects ?? []).map((p) => p.identifier);

/**
 * Adds a workflow or app to a project; it stays in any others. Core brings along the
 * sub-workflows (an app's workflows) that were in no project; a toast names them so
 * it isn't a surprise.
 */
export async function assignToProject(kind: 'task' | 'app', projectIdentifier: string, identifier: string) {
  const result =
    kind === 'app'
      ? await invokeCore<Assigned>(SEND.PROJECT_ASSIGN_APP, { projectIdentifier, appIdentifier: identifier })
      : await invokeCore<Assigned>(SEND.PROJECT_ASSIGN_TASK, { projectIdentifier, taskIdentifier: identifier });
  const added = result?.alsoAdded ?? [];
  if (added.length) {
    const t = i18n.global.t;
    toast.success(t('projects.alsoAdded.title', { count: added.length }, added.length), {
      description: added.map((w) => w.name).join(', '),
    });
  }
  return result;
}

/** Takes a workflow or app out of one project; it stays in any others. */
export async function removeFromProject(kind: 'task' | 'app', projectIdentifier: string, identifier: string) {
  return kind === 'app'
    ? await invokeCore(SEND.PROJECT_UNASSIGN_APP, { projectIdentifier, appIdentifier: identifier })
    : await invokeCore(SEND.PROJECT_UNASSIGN_TASK, { projectIdentifier, taskIdentifier: identifier });
}

/** Moves a workflow or app from the projects it was in to these ones. Returns whether anything changed. */
export async function setProjects(kind: 'task' | 'app', identifier: string, before: string[], after: string[]) {
  const added = after.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !after.includes(p));
  for (const project of removed) await removeFromProject(kind, project, identifier);
  for (const project of added) await assignToProject(kind, project, identifier);
  return added.length + removed.length > 0;
}
