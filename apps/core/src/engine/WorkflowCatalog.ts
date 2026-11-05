import { NON_EDITABLE_FIELD_TYPES } from '@tipeline/schemas';
import { descriptionSummary } from '@tipeline/utils';

/** An input of a workflow: what a caller can fill in before a run. */
export interface WorkflowInput {
  name: string;
  type: string;
  label?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
}

/** An output of a workflow: what a run fills in and returns. */
export interface WorkflowOutput {
  name: string;
  type: string;
  label?: string;
  description?: string;
}

/** Where a workflow that isn't installed yet can be installed from. */
export interface WorkflowHubSource {
  id: string;
  name: string;
  itemIdentifier: string;
  version: string;
}

/** How the agent sees one workflow: enough to pick it and fill in its inputs, never its steps. */
export interface WorkflowSummary {
  identifier: string;
  name: string;
  description?: string;
  tags?: string[];
  inputs: WorkflowInput[];
  /** The variables marked `output: true`; left out when the workflow marks none. */
  outputs?: WorkflowOutput[];
  /** Set for a hub workflow that isn't installed: the user installs it before it can run. */
  hub?: WorkflowHubSource;
  /** Run by other workflows for its data: drafts reuse it, the assistant never proposes it as a run. */
  helper?: true;
}

export interface WorkflowSearchResult {
  /** False when no workflow matched a keyword and `workflows` is the start of the whole library instead. */
  matched: boolean;
  total: number;
  workflows: WorkflowSummary[];
}

const DEFAULT_LIMIT = 10;
// Sent when no keyword matches, so the model can still recognise a workflow by meaning ("salary" → "Payroll").
const UNMATCHED_LIMIT = 25;

function parseSource(source: unknown): any {
  if (!source) return null;
  if (typeof source === 'object') return source;
  try {
    return JSON.parse(String(source));
  } catch {
    return null;
  }
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  );
}

// A variable without a visibility is private, as the engine treats it.
const isPublic = (v: any) => (v?.visibility ?? 'private') === 'public';
// The assistant is a caller, like a parent workflow or an app: it sees public and protected
// variables. Protected ones stay off the person's run form on the Overview.
const isCallerVisible = (v: any) => (v?.visibility ?? 'private') !== 'private';

/**
 * The variables a caller may set before a run: public or protected, editable types only.
 * Outputs, secret variables and ones filled in from the environment or a global are left
 * out, and so is any default that could hold a credential.
 */
export function workflowInputs(source: any): WorkflowInput[] {
  const variables: any[] = source?.pipeline?.variables ?? [];
  return variables
    .filter(
      (v) =>
        v?.name &&
        isCallerVisible(v) &&
        !v.output &&
        !(NON_EDITABLE_FIELD_TYPES as readonly string[]).includes(v.type) &&
        !v.secret &&
        !v.valueFromEnv &&
        !v.valueFromEnvFile &&
        !v.valueFromGlobal
    )
    .map((v) => ({
      name: v.name,
      type: v.type ?? 'string',
      ...(v.label ? { label: v.label } : {}),
      ...(v.description ? { description: v.description } : {}),
      ...(v.required ? { required: true } : {}),
      ...(!isEmpty(v.value) ? { default: v.value } : {}),
    }));
}

/** The public or protected, non-secret variables marked `output: true`, as the assistant sees them. */
export function workflowOutputs(source: any): WorkflowOutput[] {
  const variables: any[] = source?.pipeline?.variables ?? [];
  return variables
    .filter((v) => v?.name && v.output && isCallerVisible(v) && !v.secret)
    .map((v) => ({
      name: v.name,
      type: v.type ?? 'string',
      ...(v.label ? { label: v.label } : {}),
      ...(v.description ? { description: v.description } : {}),
    }));
}

/**
 * Names of the variables a run reports back: the outputs (public or protected) when the
 * workflow marks any, otherwise every public variable that isn't secret. The fallback stays
 * public-only, so protected helper values don't crowd an answer nobody marked up.
 */
export function reportedOutputNames(source: any): string[] {
  const outputs = workflowOutputs(source).map((o) => o.name);
  if (outputs.length > 0) return outputs;
  const variables: any[] = source?.pipeline?.variables ?? [];
  return variables.filter((v) => v?.name && isPublic(v) && !v.secret).map((v) => v.name);
}

/** What the AI that writes a run's answer is told about each returned variable. */
export function outputDetails(source: any): Record<string, { label?: string; description?: string }> {
  const names = new Set(reportedOutputNames(source));
  const variables: any[] = source?.pipeline?.variables ?? [];
  return Object.fromEntries(
    variables
      .filter((v) => names.has(v?.name) && (v.label || v.description))
      .map((v) => [
        v.name,
        { ...(v.label ? { label: v.label } : {}), ...(v.description ? { description: v.description } : {}) },
      ])
  );
}

const HUB_PREFIX = 'hub:';

/** The identifier a hub workflow goes by until it's installed (and gets its own). */
export function hubWorkflowId(hubId: string, itemIdentifier: string): string {
  return `${HUB_PREFIX}${hubId}:${itemIdentifier}`;
}

export function parseHubWorkflowId(identifier: string): { hubId: string; itemIdentifier: string } | null {
  if (!identifier.startsWith(HUB_PREFIX)) return null;
  const rest = identifier.slice(HUB_PREFIX.length);
  const split = rest.indexOf(':');
  if (split <= 0 || split === rest.length - 1) return null;
  return { hubId: rest.slice(0, split), itemIdentifier: rest.slice(split + 1) };
}

/** Every action group a workflow's steps use, including steps nested in loops and conditions. */
export function actionGroups(actions: any[]): string[] {
  if (!Array.isArray(actions)) return [];
  const groups = new Set<string>();
  const walk = (list: any[]) => {
    for (const action of list) {
      if (action?.group) groups.add(action.group);
      if (Array.isArray(action?.params?.actions)) walk(action.params.actions);
      if (Array.isArray(action?.params?.statements)) {
        for (const stmt of action.params.statements) {
          if (Array.isArray(stmt?.actions)) walk(stmt.actions);
        }
      }
    }
  };
  walk(actions);
  return [...groups];
}

export function toWorkflowSummary(task: { identifier: string; name: string; source?: unknown }): WorkflowSummary {
  const source = parseSource(task.source);
  const description = descriptionSummary(source?.description ?? '');
  const tags = Array.isArray(source?.tags) ? source.tags.map(String) : [];
  const outputs = workflowOutputs(source);
  return {
    identifier: task.identifier,
    name: task.name ?? source?.name ?? task.identifier,
    ...(description ? { description } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    inputs: workflowInputs(source),
    ...(outputs.length > 0 ? { outputs } : {}),
    ...(source?.helper === true ? { helper: true as const } : {}),
  };
}

// Words that say nothing about which workflow is meant.
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'give', 'get', 'show', 'run', 'make', 'please', 'can', 'you',
  'all', 'any', 'this', 'that', 'what', 'which', 'how', 'into', 'about', 'our', 'your', 'their',
  // Every workflow is one, so the word picks none of them out.
  'workflow', 'workflows', 'task', 'tasks',
]);

// Endings cut so a word matches its stem: "deployment" and "deployed" find "Deploy app".
const ENDINGS = /(ments?|ings?|ed|ations?|ions?)$/;
const MIN_STEM = 4;

function stem(word: string): string {
  const plain = word.replace(/ies$/, 'y').replace(/(?<=[^sui])s$/, '');
  const cut = plain.replace(ENDINGS, '');
  return cut.length >= MIN_STEM ? cut : plain;
}

/**
 * Lower-cased words of three letters or more, cut to a stem for matching:
 * plurals drop their ending ("reports" → "report"; "status" keeps its s), and
 * -ment, -ing, -ed, -ation, -ion go when at least four letters remain
 * ("deployment" → "deploy", "greeting" → "greet").
 */
export function keywords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
    .map(stem);
}

// Breaks ties toward what's already installed: it runs now, without an install step.
const INSTALLED_BONUS = 0.5;
// Breaks ties toward workflows that answer a request: a helper shares their words
// ("Data: Views and visits API") but only feeds them. Drafts still find it.
const NOT_HELPER_BONUS = 0.25;

function score(workflow: WorkflowSummary, words: string[]): number {
  // The identifier is left out: installed workflows get a random one, which can contain a keyword by chance.
  const name = workflow.name.toLowerCase();
  const tags = (workflow.tags ?? []).join(' ').toLowerCase();
  const description = (workflow.description ?? '').toLowerCase();
  // Inputs and outputs count by name, label and description: "Which month's sales to report" finds "sales".
  const inputs = [...workflow.inputs, ...(workflow.outputs ?? [])]
    .map((i) => `${i.name} ${i.label ?? ''} ${i.description ?? ''}`)
    .join(' ')
    .toLowerCase();

  let total = 0;
  for (const word of words) {
    if (name.includes(word)) total += 3;
    if (tags.includes(word)) total += 2;
    if (description.includes(word)) total += 1;
    if (inputs.includes(word)) total += 1;
  }
  if (total === 0) return 0;
  return total + (workflow.hub ? 0 : INSTALLED_BONUS) + (workflow.helper ? 0 : NOT_HELPER_BONUS);
}

/**
 * Ranks workflows by the keywords of a request. Matching is plain substring
 * search; when nothing matches, the first workflows by name come back marked
 * `matched: false` so the model can still choose by meaning. Installed
 * workflows come before hub ones on a tie, and in the unmatched list; helpers
 * come after the rest the same way.
 */
export function searchWorkflows(
  workflows: WorkflowSummary[],
  query: string | undefined,
  limit = DEFAULT_LIMIT
): WorkflowSearchResult {
  const byName = [...workflows].sort(
    (a, b) =>
      Number(!!a.hub) - Number(!!b.hub) ||
      Number(!!a.helper) - Number(!!b.helper) ||
      a.name.localeCompare(b.name)
  );
  const words = keywords(query ?? '');

  if (words.length > 0) {
    const ranked = byName
      .map((workflow) => ({ workflow, score: score(workflow, words) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked.length > 0) {
      return { matched: true, total: ranked.length, workflows: ranked.slice(0, limit).map((e) => e.workflow) };
    }
  }

  return { matched: words.length === 0, total: byName.length, workflows: byName.slice(0, UNMATCHED_LIMIT) };
}

// ---------------------------------------------------------------------
// How findable a workflow is
// ---------------------------------------------------------------------

/**
 * Something about a workflow that makes the assistant less likely to find it, or
 * to fill in its inputs well:
 *   hidden     — it won't be offered at all (a draft)
 *   important  — it will be hard to find (no description, a generic name)
 *   minor      — it can be found, but matching or filling is weaker
 */
export interface FindabilityIssue {
  code: 'draft' | 'noDescription' | 'genericName' | 'shortDescription' | 'noTags' | 'inputsNeedDetail';
  severity: 'hidden' | 'important' | 'minor';
  /** For inputsNeedDetail: the inputs missing a label or a description. */
  inputs?: string[];
}

export interface WorkflowFindability {
  identifier: string;
  name: string;
  issues: FindabilityIssue[];
}

// Names the builder or a copy gives, which say nothing about what the workflow does.
const GENERIC_NAME = /^(new workflow|untitled( workflow)?|workflow( \d+)?|test( \d+)?|copy of .+|.+ \(copy\))$/i;
const SHORT_DESCRIPTION_WORDS = 4;
const SEVERITY_ORDER = { hidden: 0, important: 1, minor: 2 } as const;

/**
 * What the search and the assistant would miss about one workflow. The search
 * reads the name, the description's first paragraph, tags and each input's and
 * output's name, label and description; the model reads the same to fill in values.
 */
export function findabilityIssues(task: { name: string; source?: unknown; metadata?: unknown }): FindabilityIssue[] {
  const source = parseSource(task.source);
  const issues: FindabilityIssue[] = [];

  let metadata: any = task.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }
  if (metadata?.draft === true) issues.push({ code: 'draft', severity: 'hidden' });

  const description = descriptionSummary(source?.description ?? '');
  if (!description) issues.push({ code: 'noDescription', severity: 'important' });
  else if (description.split(/\s+/).length < SHORT_DESCRIPTION_WORDS) {
    issues.push({ code: 'shortDescription', severity: 'minor' });
  }

  if (GENERIC_NAME.test((task.name ?? '').trim())) issues.push({ code: 'genericName', severity: 'important' });

  const tags = Array.isArray(source?.tags) ? source.tags : [];
  if (tags.length === 0) issues.push({ code: 'noTags', severity: 'minor' });

  const needDetail = workflowInputs(source)
    .filter((input) => !input.label || !input.description)
    .map((input) => input.label || input.name);
  if (needDetail.length > 0) issues.push({ code: 'inputsNeedDetail', severity: 'minor', inputs: needDetail });

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
