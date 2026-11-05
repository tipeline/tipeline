export function useActionManipulation() {
  const findAndUpdateActionById = (
    actions: any[],
    actionIdentifier: string,
    updateData: any = {}
  ) => {
    // Create a deep copy to avoid mutating the original
    const actionsCopy = JSON.parse(JSON.stringify(actions));

    // Helper function to recursively find and update a action by ID
    function findActionRecursive(actionsArray: any[]): any {
      for (let i = 0; i < actionsArray.length; i++) {
        const action = actionsArray[i];

        // Check if current action matches the ID
        if (action.identifier === actionIdentifier) {
          // Loop body actions reuse the same identifier on every iteration, and
          // core only emits a completion event (no per-iteration "start"). So an
          // already-finished action completing again is itself the signal that a
          // new iteration has begun — reset its siblings back to pending so the
          // loop body visibly re-runs instead of staying green after iteration 1.
          if (action.finished && updateData.finished) {
            for (const sibling of actionsArray) {
              if (sibling !== action) {
                delete sibling.finished;
                delete sibling.running;
                delete sibling.error;
              }
            }
          }

          // Update the action with the provided data
          Object.assign(action, updateData);
          return action;
        }

        // If this action has nested actions, search recursively
        if (
          action.params &&
          action.params.actions &&
          Array.isArray(action.params.actions)
        ) {
          const found = findActionRecursive(action.params.actions);
          if (found) return found;
        }
      }
      return null;
    }

    // const foundAction = findActionRecursive(actionsCopy);
    const foundAction = findActionRecursive(actions);

    return {
      updatedActions: actionsCopy,
      foundAction: foundAction,
      success: !!foundAction,
    };
  };

  return {
    findAndUpdateActionById,
    // future: findActionById, removeAction, etc.
  };
}
