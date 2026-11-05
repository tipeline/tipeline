export interface VisibilityDeclaration {
  name: string;
  visibility?: string;
  output?: boolean;
}

/**
 * Throws if any prop key targets a variable that is private (`visibility: 'private'`, or no
 * visibility at all, which is private too) or an output of the workflow — the same rule
 * Task.updateVariablesFromProps enforces against an already-instantiated Variable[],
 * but usable before a Task/Variable object exists at all (e.g. against raw YAML/JSON
 * variable declarations). This lets a caller reject a bad `props` payload before doing
 * any other work — in particular, before submitting a subtask.exec(async: true) job,
 * where no in-process child Task is ever built to run this check against afterward.
 */
export function assertPropsVisibility(
  declaredVariables: VisibilityDeclaration[],
  props: Record<string, unknown>
): void {
  for (const key of Object.keys(props)) {
    const declared = declaredVariables.find((v) => v.name === key);
    if (!declared) continue;
    if ((declared.visibility ?? 'private') === 'private') {
      throw new Error(`Variable "${key}" is private and cannot be overridden by a parent workflow.`);
    }
    if (declared.output) {
      throw new Error(`Variable "${key}" is an output of the workflow and cannot be set by a parent workflow.`);
    }
  }
}

/** Throws for a typed-in value the workflow wouldn't take, naming the ones it does. */
export function assertRunVariables(
  declaredVariables: VisibilityDeclaration[],
  values: Record<string, unknown>,
  options: { allowPrivate?: boolean } = {}
): void {
  const settable = (v: VisibilityDeclaration) => options.allowPrivate || (v.visibility ?? 'private') !== 'private';
  for (const key of Object.keys(values)) {
    const declared = declaredVariables.find((v) => v.name === key);
    if (!declared) {
      const names = declaredVariables.filter(settable).map((v) => v.name);
      throw new Error(`This workflow has no variable "${key}". It takes: ${names.join(', ') || 'no variables'}.`);
    }
    if (!settable(declared)) {
      throw new Error(`Variable "${key}" is private, so it can't be set from outside. Make it public to allow that.`);
    }
  }
}
