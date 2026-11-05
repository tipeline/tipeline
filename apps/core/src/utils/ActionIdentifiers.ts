import { generateIdentifier } from '@tipeline/utils';

/**
 * Assigns a fresh identifier to every action (and recursively to nested
 * `params.actions`), overwriting any existing ones. Every task-install path
 * (local file, pasted content, hub) must run this before persisting a task's
 * source — `pipeline_action` rows are keyed uniquely by (block_id, identifier),
 * so actions sharing a block without distinct identifiers collide the moment
 * the task runs.
 */
export function addActionsIdentifiers(actions: any[]): any[] {
  if (!Array.isArray(actions)) {
    return actions;
  }

  return actions.map((action) => {
    const actionWithId = {
      ...action,
      identifier: generateIdentifier(),
    };

    if (actionWithId.params?.actions && Array.isArray(actionWithId.params.actions)) {
      actionWithId.params = {
        ...actionWithId.params,
        actions: addActionsIdentifiers(actionWithId.params.actions),
      };
    }

    return actionWithId;
  });
}
