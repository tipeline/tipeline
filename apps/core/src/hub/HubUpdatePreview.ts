import { capabilityReport } from '@engine/WorkflowCapabilities';
import { workflowInputs, workflowOutputs } from '@engine/WorkflowCatalog';
import { TaskRevisionService } from '@database/services/TaskRevisionService';
import { WorkflowUsageService } from '@database/services/WorkflowUsageService';

interface Field {
  name: string;
  type: string;
  required?: boolean;
}

const parse = (source: unknown): any => {
  if (!source) return null;
  if (typeof source === 'object') return source;
  try {
    return JSON.parse(String(source));
  } catch {
    return null;
  }
};

// Step identifiers are generated on every install, so they'd make every step look replaced.
const withoutStepIdentifiers = (actions: any[]): any[] =>
  (actions ?? []).map(({ identifier: _identifier, ...step }) =>
    Array.isArray(step.params?.actions)
      ? { ...step, params: { ...step.params, actions: withoutStepIdentifiers(step.params.actions) } }
      : step
  );

const comparableSource = (source: any) => ({
  ...source,
  pipeline: { ...source?.pipeline, actions: withoutStepIdentifiers(source?.pipeline?.actions) },
});

function compareFields(before: Field[], after: Field[]) {
  const old = new Map(before.map((f) => [f.name, f]));
  const next = new Map(after.map((f) => [f.name, f]));
  return {
    added: after.filter((f) => !old.has(f.name)).map((f) => f.name),
    removed: before.filter((f) => !next.has(f.name)).map((f) => f.name),
    changed: after
      .filter((f) => {
        const previous = old.get(f.name);
        return previous && (previous.type !== f.type || (f.required && !previous.required));
      })
      .map((f) => f.name),
  };
}

/** What installing a new version of a workflow would change, and what depends on it. */
export async function workflowUpdateChanges(identifier: string, installedSource: unknown, newSource: unknown) {
  const before = parse(installedSource);
  const after = parse(newSource);

  const [beforeAccess, afterAccess, usage] = await Promise.all([
    capabilityReport(before),
    capabilityReport(after),
    WorkflowUsageService.usage(identifier),
  ]);
  const had = new Set(beforeAccess.capabilities.map((c) => c.capability));

  return {
    inputs: compareFields(workflowInputs(before), workflowInputs(after)),
    outputs: compareFields(workflowOutputs(before), workflowOutputs(after)),
    steps: TaskRevisionService.summarize(
      JSON.stringify(comparableSource(before)),
      JSON.stringify(comparableSource(after))
    ),
    newAccess: afterAccess.capabilities.map((c) => c.capability).filter((c) => !had.has(c)),
    usedBy: {
      apps: usage.apps.map((a) => a.name),
      workflows: usage.workflows.map((w) => w.name),
      schedules: usage.schedules.length,
    },
  };
}

/** The pages an app's new version adds and removes. */
export function appUpdateChanges(installedSource: unknown, rawApp: any) {
  const pages = (source: any): { id: string; name?: string }[] =>
    Array.isArray(source?.pages) ? source.pages : [];
  const before = pages(parse(installedSource));
  const after = pages(rawApp);
  const label = (page: { id: string; name?: string }) => page.name ?? page.id;
  return {
    pages: {
      added: after.filter((p) => !before.some((b) => b.id === p.id)).map(label),
      removed: before.filter((p) => !after.some((a) => a.id === p.id)).map(label),
    },
  };
}
