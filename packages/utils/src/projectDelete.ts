/** An app or workflow that uses a workflow. */
export type ProjectItemUser = { identifier: string; name: string; project_name?: string | null };

/** A project workflow with what uses it, as Core's projectDeletePreview returns it. */
export type ProjectDeleteWorkflow = {
  identifier: string;
  name: string;
  apps: ProjectItemUser[];
  workflows: ProjectItemUser[];
};

/** The workflows and apps chosen for deletion. */
export type DeleteSelection = { workflows: Set<string>; apps: Set<string> };

/**
 * The apps and workflows that would still use a workflow after the delete: everything
 * that uses it and isn't being deleted too. That covers other projects, no project,
 * and items of this project that are being kept.
 */
export function outsideUsers<U extends ProjectItemUser>(
  usage: { apps: U[]; workflows: U[] },
  selection: DeleteSelection
): { apps: U[]; workflows: U[] } {
  return {
    apps: usage.apps.filter((app) => !selection.apps.has(app.identifier)),
    workflows: usage.workflows.filter((w) => !selection.workflows.has(w.identifier)),
  };
}

/**
 * What's chosen when deleting a project's contents: every app, and every workflow
 * that nothing outside the deletion uses. Keeping a workflow can make another one
 * used again (the kept one runs it), so this goes round until nothing changes.
 */
export function defaultDeleteSelection(preview: {
  workflows: ProjectDeleteWorkflow[];
  apps: { identifier: string }[];
}): DeleteSelection {
  const selection: DeleteSelection = {
    workflows: new Set(preview.workflows.map((w) => w.identifier)),
    apps: new Set(preview.apps.map((a) => a.identifier)),
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const workflow of preview.workflows) {
      if (!selection.workflows.has(workflow.identifier)) continue;
      const outside = outsideUsers(workflow, selection);
      if (outside.apps.length + outside.workflows.length > 0) {
        selection.workflows.delete(workflow.identifier);
        changed = true;
      }
    }
  }
  return selection;
}
