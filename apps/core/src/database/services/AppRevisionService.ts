import type { Knex } from 'knex';
import { AppRevision } from '@database/models/AppRevision';
import {
  RevisionHistory,
  parseSource,
  type RevisionListItem,
  type RevisionOrigin,
} from '@database/services/RevisionHistory';

/** What changed from the version before, shown on each row of an app's Versions tab. */
export interface AppRevisionSummary {
  pagesAdded: string[]; // page names
  pagesRemoved: string[];
  added: string[]; // component labels ("orders (table)"), at most SUMMARY_NAMES of them
  removed: string[];
  addedCount: number;
  removedCount: number;
  changed: number; // components kept but edited or moved
  workflows: boolean; // the workflows the app declares
  details: boolean; // state, page settings (name, icon, menu, runnables, load events), page order
}

const SUMMARY_NAMES = 5;

const pagesOf = (app: any): any[] => (Array.isArray(app?.pages) ? app.pages : []);
const componentsOf = (page: any): any[] => (Array.isArray(page?.components) ? page.components : []);
const componentLabel = (component: any) =>
  component?.id && component?.type ? `${component.id} (${component.type})` : String(component?.id ?? component?.type ?? '?');

/** Components by page and id, so one moved to another page counts as removed + added. */
const componentMap = (app: any) => {
  const map = new Map<string, any>();
  for (const page of pagesOf(app)) {
    componentsOf(page).forEach((component, index) => {
      map.set(`${page?.id}/${component?.id ?? `#${index}`}`, component);
    });
  }
  return map;
};

/**
 * Saved versions of an app's source (`app_revision`). AppService records one on every
 * write of a source, so builder edits, hub updates and backup restores all show up in
 * the app's Versions tab.
 */
export class AppRevisionService {
  static summarize(previous: string | null | undefined, next: string): AppRevisionSummary | null {
    const before = parseSource(previous);
    const after = parseSource(next);
    if (!before || !after) return null;

    const beforePages = new Map(pagesOf(before).map((page) => [page?.id, page]));
    const afterPages = new Map(pagesOf(after).map((page) => [page?.id, page]));
    const pagesAdded = [...afterPages].filter(([id]) => !beforePages.has(id)).map(([, page]) => String(page?.name ?? page?.id));
    const pagesRemoved = [...beforePages]
      .filter(([id]) => !afterPages.has(id))
      .map(([, page]) => String(page?.name ?? page?.id));

    const beforeComponents = componentMap(before);
    const afterComponents = componentMap(after);
    const added: string[] = [];
    let changed = 0;
    for (const [key, component] of afterComponents) {
      const old = beforeComponents.get(key);
      if (!old) added.push(componentLabel(component));
      else if (JSON.stringify(old) !== JSON.stringify(component)) changed++;
    }
    const removed = [...beforeComponents]
      .filter(([key]) => !afterComponents.has(key))
      .map(([, component]) => componentLabel(component));

    // Everything but the components and the declared workflows; pages added or removed
    // already have their own line, so only the pages in both are compared.
    const rest = (app: any, others: Map<any, any>) =>
      JSON.stringify({
        ...app,
        workflows: undefined,
        pages: pagesOf(app)
          .filter((page) => others.has(page?.id))
          .map((page) => ({ ...page, components: undefined })),
      });

    return {
      pagesAdded,
      pagesRemoved,
      added: added.slice(0, SUMMARY_NAMES),
      removed: removed.slice(0, SUMMARY_NAMES),
      addedCount: added.length,
      removedCount: removed.length,
      changed,
      workflows: JSON.stringify(before.workflows ?? {}) !== JSON.stringify(after.workflows ?? {}),
      details: rest(before, afterPages) !== rest(after, beforePages),
    };
  }

  static record(
    app: { id: number; source?: string | null; updated_at?: unknown },
    source: string,
    origin: RevisionOrigin,
    options: { restoredFrom?: number; trx?: Knex.Transaction } = {}
  ) {
    return history.record(app, source, origin, options);
  }

  static list(appId: number): Promise<RevisionListItem<AppRevisionSummary>[]> {
    return history.list(appId);
  }

  static get(appId: number, revisionId: number) {
    return history.get(appId, revisionId);
  }
}

const history = new RevisionHistory<AppRevisionSummary>(AppRevision, 'app_id', (previous, next) =>
  AppRevisionService.summarize(previous, next)
);
