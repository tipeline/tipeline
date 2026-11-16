/**
 * Reading a workflow's source for the phone: which inputs to ask for, which steps to show.
 * The rules follow Desktop's Overview tab (TaskOverviewTab.vue): a run form shows the public
 * variables that are not outputs, minus types that can't be typed in.
 */

export interface WorkflowVariable {
  type: string;
  name: string;
  label?: string;
  description?: string;
  value?: unknown;
  required?: boolean;
  readonly?: boolean;
  secret?: boolean;
  visibility?: 'public' | 'protected' | 'private';
  output?: boolean;
  valueFromEnv?: string;
  valueFromGlobal?: string;
}

export interface WorkflowSource {
  name?: string;
  description?: string;
  pipeline?: {
    variables?: WorkflowVariable[];
    actions?: Array<{ identifier?: string; label?: string; group?: string; name?: string }>;
  };
}

/** Types a run form never shows (packages/schemas NON_EDITABLE_FIELD_TYPES). */
const NON_EDITABLE = new Set(['browser', 'sshConnection', 'dbConnection', 'workbook', 'image', 'audio', 'video']);

/** Types the phone form can fill in; others show as "Set on Desktop" for now. */
const PHONE_EDITABLE = new Set(['string', 'number', 'boolean', 'date', 'array', 'object']);

export type InputKind = 'text' | 'number' | 'boolean' | 'date' | 'json' | 'desktopOnly';

export interface RunInput {
  variable: WorkflowVariable;
  kind: InputKind;
  label: string;
}

export function parseSource(source: unknown): WorkflowSource | null {
  if (source && typeof source === 'object') return source as WorkflowSource;
  if (typeof source !== 'string') return null;
  try {
    return JSON.parse(source) as WorkflowSource;
  } catch {
    return null;
  }
}

/** The inputs a run asks for, in source order. */
export function runInputs(source: WorkflowSource | null): RunInput[] {
  const variables = source?.pipeline?.variables ?? [];
  return variables
    .filter(
      (v) =>
        !NON_EDITABLE.has(v.type) &&
        (v.visibility ?? 'private') === 'public' &&
        !v.output &&
        // Filled in by Core from the environment or a global: anything typed here is ignored.
        !v.valueFromEnv &&
        !v.valueFromGlobal
    )
    .map((variable) => ({
      variable,
      label: variable.label || variable.name,
      kind: kindFor(variable.type),
    }));
}

function kindFor(type: string): InputKind {
  if (!PHONE_EDITABLE.has(type)) return 'desktopOnly';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'date') return 'date';
  if (type === 'array' || type === 'object') return 'json';
  return 'text';
}

/** What the form starts with for each input. JSON inputs are edited as text. */
export function initialValues(inputs: RunInput[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const { variable, kind } of inputs) {
    const value = variable.value;
    if (kind === 'json') values[variable.name] = value === undefined || value === '' ? '' : JSON.stringify(value, null, 2);
    else if (kind === 'boolean') values[variable.name] = value === true || value === 'true';
    else values[variable.name] = value ?? '';
  }
  return values;
}

export type FormProblem = { name: string; problem: 'required' | 'invalidJson' };

/** Turns the form into run variables, or lists what's wrong. Desktop-only inputs are left out
 *  so the workflow keeps its saved value. */
export function toRunVariables(
  inputs: RunInput[],
  values: Record<string, unknown>
): { variables: Record<string, unknown>; problems: FormProblem[] } {
  const variables: Record<string, unknown> = {};
  const problems: FormProblem[] = [];

  for (const { variable, kind } of inputs) {
    if (kind === 'desktopOnly' || variable.readonly) continue;
    const raw = values[variable.name];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');

    if (empty) {
      if (variable.required && kind !== 'boolean') problems.push({ name: variable.name, problem: 'required' });
      continue;
    }
    if (kind === 'json') {
      try {
        variables[variable.name] = JSON.parse(String(raw));
      } catch {
        problems.push({ name: variable.name, problem: 'invalidJson' });
      }
      continue;
    }
    if (kind === 'number') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (Number.isNaN(n)) problems.push({ name: variable.name, problem: 'required' });
      else variables[variable.name] = n;
      continue;
    }
    variables[variable.name] = kind === 'boolean' ? raw === true : raw;
  }
  return { variables, problems };
}

export interface StepInfo {
  identifier: string;
  label: string;
}

/** The top-level steps, with the labels people gave them. */
export function stepsFromSource(source: WorkflowSource | null): StepInfo[] {
  return (source?.pipeline?.actions ?? [])
    .filter((a) => a.identifier)
    .map((a) => ({
      identifier: a.identifier as string,
      label: a.label || [a.group, a.name].filter(Boolean).join('.') || (a.identifier as string),
    }));
}

/** The outputs a person may read: public variables marked `output`. */
export function outputVariables(source: WorkflowSource | null): WorkflowVariable[] {
  return (source?.pipeline?.variables ?? []).filter((v) => v.output && (v.visibility ?? 'private') === 'public');
}

/**
 * What a finished run shows: the workflow's outputs, or, when it declares none, its public
 * variables that aren't secret. The same rule Core uses for the Assistant's answers
 * (reportedOutputNames), kept to public ones like Desktop's Overview.
 */
export function resultVariables(source: WorkflowSource | null): WorkflowVariable[] {
  const outputs = outputVariables(source);
  if (outputs.length > 0) return outputs;
  return (source?.pipeline?.variables ?? []).filter((v) => (v.visibility ?? 'private') === 'public' && !v.secret);
}

/** First plain line of a Markdown description, for lists. */
export function descriptionLine(description: unknown): string {
  if (typeof description !== 'string') return '';
  const line = description
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('```')) ?? '';
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~>]/g, '')
    .replace(/^[-+]\s+/, '')
    .trim();
}

/** Runs that only exist to feed other workflows don't belong in the phone's list. */
export function isListed(workflow: { helper?: unknown }): boolean {
  return !workflow.helper;
}
