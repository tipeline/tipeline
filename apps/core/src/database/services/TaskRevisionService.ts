import type { Knex } from 'knex';
import { TaskRevision } from '@database/models/TaskRevision';
import {
  RevisionHistory,
  parseSource as parse,
  type RevisionListItem as ListItem,
  type RevisionOrigin,
} from '@database/services/RevisionHistory';

export { MERGE_WINDOW_MS, KEEP_ALL_DAYS } from '@database/services/RevisionHistory';

/** What changed from the version before, shown on each row of the Versions tab. */
export interface RevisionSummary {
  added: string[]; // step labels ("http.request"), at most SUMMARY_NAMES of them
  removed: string[];
  addedCount: number;
  removedCount: number;
  changed: number; // steps kept but edited (or moved)
  variables: boolean;
  details: boolean; // name, description, tags, cache, …
}

export type RevisionListItem = ListItem<RevisionSummary>;

const SUMMARY_NAMES = 5;

const stepLabel = (step: any) => [step?.group, step?.name].filter(Boolean).join('.') || '?';

/**
 * Steps matched by their `identifier` (set by the builder) when they have one,
 * otherwise by group.name and how many of those came before.
 */
const stepKeys = (actions: any[]) => {
  const seen = new Map<string, number>();
  return actions.map((step) => {
    if (typeof step?.identifier === 'string' && step.identifier) return `id:${step.identifier}`;
    const label = stepLabel(step);
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    return `${label}#${n}`;
  });
};

/**
 * Saved versions of a workflow's source (`task_revision`). TaskService records one on
 * every write of a source, so the builder, metadata edits, hub updates, reloads from
 * file and backup restores all show up in the Versions tab.
 */
export class TaskRevisionService {
  static summarize(previous: string | null | undefined, next: string): RevisionSummary | null {
    const before = parse(previous);
    const after = parse(next);
    if (!before || !after) return null;

    const beforeSteps: any[] = Array.isArray(before.pipeline?.actions) ? before.pipeline.actions : [];
    const afterSteps: any[] = Array.isArray(after.pipeline?.actions) ? after.pipeline.actions : [];
    const beforeKeys = stepKeys(beforeSteps);
    const afterKeys = stepKeys(afterSteps);
    const beforeByKey = new Map(beforeKeys.map((key, i) => [key, { step: beforeSteps[i], index: i }]));
    const afterSet = new Set(afterKeys);

    const added: string[] = [];
    let changed = 0;
    afterKeys.forEach((key, i) => {
      const old = beforeByKey.get(key);
      if (!old) added.push(stepLabel(afterSteps[i]));
      else if (old.index !== i || JSON.stringify(old.step) !== JSON.stringify(afterSteps[i])) changed++;
    });
    const removed = beforeKeys.filter((key) => !afterSet.has(key)).map((key) => stepLabel(beforeByKey.get(key)!.step));

    const rest = (source: any) => {
      const { pipeline, ...details } = source;
      return JSON.stringify(details);
    };

    return {
      added: added.slice(0, SUMMARY_NAMES),
      removed: removed.slice(0, SUMMARY_NAMES),
      addedCount: added.length,
      removedCount: removed.length,
      changed,
      variables: JSON.stringify(before.pipeline?.variables ?? []) !== JSON.stringify(after.pipeline?.variables ?? []),
      details: rest(before) !== rest(after),
    };
  }

  static record(
    task: { id: number; source?: string | null; updated_at?: unknown },
    source: string,
    origin: RevisionOrigin,
    options: { restoredFrom?: number; trx?: Knex.Transaction } = {}
  ) {
    return history.record(task, source, origin, options);
  }

  static prune(taskId: number, trx?: Knex.Transaction) {
    return history.prune(taskId, trx);
  }

  static list(taskId: number): Promise<RevisionListItem[]> {
    return history.list(taskId);
  }

  static get(taskId: number, revisionId: number) {
    return history.get(taskId, revisionId);
  }
}

const history = new RevisionHistory<RevisionSummary>(TaskRevision, 'task_id', (previous, next) =>
  TaskRevisionService.summarize(previous, next)
);
