/** Sub-workflows named by a path relative to the workflow's file, anywhere in its steps. */
export function relativeSubtaskPaths(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  return actions.flatMap((action: any) => {
    const path = action?.params?.path;
    const own = action?.group === 'subtask' && typeof path === 'string' && /^\.\.?\//.test(path) ? [path] : [];
    const statements = Array.isArray(action?.params?.statements) ? action.params.statements : [];
    return [
      ...own,
      ...relativeSubtaskPaths(action?.params?.actions),
      ...statements.flatMap((statement: any) => relativeSubtaskPaths(statement?.actions)),
    ];
  });
}

/**
 * A workflow sent as its contents has no file beside it, so a path relative to that file can
 * only mean something on the sender's machine. Looking for it here could run the wrong one.
 */
export function assertNoLocalFiles(parsedTask: any): void {
  const paths = relativeSubtaskPaths(parsedTask?.pipeline?.actions);
  if (paths.length > 0) {
    throw new Error(
      `This workflow runs sub-workflows from files next to it (${paths.join(', ')}), which this Core can't reach. ` +
        `Install them on this Core and call them by identifier, or switch back with: tipeline remote use local`
    );
  }
}
