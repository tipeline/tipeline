import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { toast } from '@/components/ui/sonner';

type Assigned = { alsoAdded?: { identifier: string; name: string }[] };

/**
 * Puts a workflow or app in a project. Core brings along the sub-workflows (an app's
 * workflows) that were in no project; a toast names them so the move isn't a surprise.
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
