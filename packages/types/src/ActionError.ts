export interface ActionErrorIssue {
  path: string;
  message: string;
  code?: string;
}

export interface ActionErrorData {
  __type: 'ActionError';
  group: string;
  action: string;
  message: string;
  issues: ActionErrorIssue[];
}

export function isActionErrorData(value: unknown): value is ActionErrorData {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any).__type === 'ActionError'
  );
}
