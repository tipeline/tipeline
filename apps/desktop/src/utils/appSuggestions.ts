import type { AppAction, AppPage, AppSource } from '@tipeline/schemas';

export interface BindingSuggestion {
  path: string;
  /** Short hint shown next to the path (what it is). */
  detail: string;
}

/**
 * Every path a binding on `pageId` can reference, for autocomplete. `handler` adds the
 * values only available inside a runnable's On success / On error actions. `itemScopes`
 * are the list views whose item names apply (by default every one on the page), with
 * the fields their items are known to have (`record.<field>`).
 */
/** A list view's item names and its items' known fields, for suggestions. */
export interface ItemSuggestionScope {
  itemName: string;
  indexName: string;
  fields: string[];
}

export function bindingSuggestions(
  source: AppSource | null,
  pageId: string | null,
  options: { handler?: boolean; itemScopes?: ItemSuggestionScope[] } = {}
): BindingSuggestion[] {
  const page: AppPage | undefined = source?.pages.find((p) => p.id === pageId);
  if (!source || !page) return [];
  const out: BindingSuggestion[] = [];
  const add = (path: string, detail: string) => out.push({ path, detail });

  // App state: declared defaults plus keys any setState writes.
  const stateKeys = new Set(Object.keys(source.state ?? {}));
  for (const p of source.pages) {
    const lists: AppAction[][] = [p.events?.load ?? []];
    for (const c of p.components)
      lists.push(
        ...Object.values((c.events ?? {}) as Record<string, AppAction[]>)
      );
    for (const r of Object.values(p.runnables)) {
      lists.push(r.onSuccess ?? [], r.onError ?? []);
      if (r.mode === 'run') lists.push(r.onPaused ?? []);
    }
    for (const a of lists.flat())
      if (a.type === 'setState') stateKeys.add(a.key);
  }
  for (const key of [...stateKeys].sort()) add(`state.${key}`, 'state');

  for (const [name, r] of Object.entries(page.runnables)) {
    if (r.mode === 'run')
      for (const output of r.outputs ?? [])
        add(`runnables.${name}.outputs.${output}`, 'output');
    else add(`runnables.${name}.data`, 'rows');
    add(`runnables.${name}.isRunning`, 'true / false');
    add(`runnables.${name}.error`, 'error message');
  }

  for (const c of page.components) {
    const props = c.props as Record<string, any>;
    switch (c.type) {
      case 'input':
      case 'checkbox':
        add(`${c.id}.value`, c.type);
        break;
      case 'select':
        add(`${c.id}.value`, c.type);
        add(`${c.id}.selectedOptions`, 'chosen { label, value }');
        if (props.search === 'remote') add(`${c.id}.search`, 'text searched');
        break;
      case 'dateRange':
        add(`${c.id}.from`, 'first day');
        add(`${c.id}.to`, 'last day');
        add(`${c.id}.value`, '{ from, to }');
        break;
      case 'form':
        for (const field of Array.isArray(props.fields) ? props.fields : [])
          add(`${c.id}.values.${field.name}`, field.type ?? 'text');
        add(`${c.id}.values`, 'all values');
        break;
      case 'fileDrop':
        add(`${c.id}.value`, props.multiple === false ? 'file path' : 'file paths');
        add(`${c.id}.files`, '{ name, path, size, type } each');
        break;
      case 'pdf':
        add(`${c.id}.page`, 'page in view');
        add(`${c.id}.pages`, 'page count');
        break;
      case 'calendar':
        add(`${c.id}.selectedEvent`, 'clicked event’s row');
        add(`${c.id}.selectedDate`, 'clicked day');
        add(`${c.id}.selectedStart`, 'selection start');
        add(`${c.id}.selectedEnd`, 'selection end');
        add(`${c.id}.from`, 'first day shown');
        add(`${c.id}.to`, 'last day shown');
        break;
      case 'tree':
        add(`${c.id}.selectedNode`, 'clicked node (its row)');
        add(`${c.id}.selectedId`, 'its id');
        add(`${c.id}.checked`, 'ids of ticked nodes');
        add(`${c.id}.checkedLeaves`, 'ticked leaves (rows)');
        break;
      case 'pagination':
        add(`${c.id}.page`, 'page shown (from 1)');
        add(`${c.id}.pageSize`, 'rows per page');
        add(`${c.id}.offset`, 'rows before this page (from 0)');
        break;
      case 'avatar':
        add(`${c.id}.selectedItem`, 'clicked person (their row)');
        add(`${c.id}.selectedIndex`, 'their position (from 0)');
        break;
      case 'gallery':
        add(`${c.id}.selectedItem`, 'clicked picture (its row)');
        add(`${c.id}.index`, 'carousel picture shown (from 0)');
        break;
      case 'custom':
        add(`${c.id}.lastEvent.payload`, 'what its last event sent');
        add(`${c.id}.lastEvent.name`, 'its last event');
        add(`${c.id}.value`, 'what its code set with setValue');
        break;
      case 'media':
        add(`${c.id}.playing`, 'true / false');
        add(`${c.id}.currentTime`, 'seconds played');
        add(`${c.id}.duration`, 'length in seconds');
        add(`${c.id}.ended`, 'true / false');
        break;
      case 'timeline':
        add(`${c.id}.selectedItem`, 'clicked event (its row)');
        break;
      case 'kanban':
        add(`${c.id}.lastMove.card.id`, 'moved card (its row)');
        add(`${c.id}.lastMove.to`, 'column it went to');
        add(`${c.id}.lastMove.index`, 'its place there (from 0)');
        add(`${c.id}.selectedCard`, 'clicked card');
        break;
      case 'embed':
        add(`${c.id}.message`, 'last message from the page');
        break;
      case 'map':
        add(`${c.id}.selectedMarker`, 'clicked marker’s row');
        add(`${c.id}.selectedIndex`, 'its position (from 0)');
        break;
      case 'chat':
        add(`${c.id}.message`, 'text just sent');
        add(`${c.id}.messages`, 'the conversation');
        add(`${c.id}.reply`, 'the last answer');
        break;
      case 'buttonGroup':
        add(`${c.id}.clicked`, 'id of the last button clicked');
        break;
      case 'timer':
        add(`${c.id}.ticks`, 'ticks so far');
        add(`${c.id}.lastTick`, 'last tick (ISO time)');
        add(`${c.id}.running`, 'true / false');
        break;
      case 'chart':
        add(`${c.id}.selectedPoint`, 'clicked row');
        break;
      case 'listView':
        add(`${c.id}.selectedItem`, 'clicked item');
        add(`${c.id}.selectedIndex`, 'its position (from 0)');
        break;
      case 'tabs':
        add(`${c.id}.activeTab`, props.display === 'steps' ? 'step id' : props.display === 'accordion' ? 'section id' : 'tab id');
        break;
      case 'runs':
        add(`${c.id}.selectedRun.status`, 'clicked run');
        add(`${c.id}.selectedRun.pipelineIdentifier`, 'its id');
        add(`${c.id}.selectedRun.workflowName`, 'its workflow');
        break;
      case 'approvals':
        add(`${c.id}.lastDecision.approved`, 'true / false');
        add(`${c.id}.lastDecision.comment`, 'comment');
        add(`${c.id}.lastDecision.title`, 'request');
        break;
      case 'table':
        add(`${c.id}.selectedRow`, 'row');
        for (const col of props.columns ?? [])
          add(`${c.id}.selectedRow.${col.key}`, 'column');
        if (props.pageSize) {
          add(`${c.id}.page`, 'page number');
          add(`${c.id}.pageSize`, 'rows per page');
        }
        if (props.multiSelect || (props.bulkActions ?? []).length) {
          add(`${c.id}.selectedRows`, 'checked rows');
        }
        if (props.allowAdd || props.allowDelete || (props.columns ?? []).some((col: any) => col?.editable)) {
          add(`${c.id}.changes`, 'added / updated / deleted rows');
          add(`${c.id}.changes.added`, 'new rows');
          add(`${c.id}.changes.updated`, 'edited rows');
          add(`${c.id}.changes.deleted`, 'deleted rows');
          add(`${c.id}.hasChanges`, 'true / false');
        }
        break;
    }
  }

  add('page.params', 'navigation params');
  // Inside a list view's item template (and what its buttons run), by its names.
  const scopes =
    options.itemScopes ??
    page.components
      .filter((c) => c.type === 'listView')
      .map((c) => ({
        itemName: (c.props as any).itemName || 'item',
        indexName: (c.props as any).indexName || 'index',
        fields: [],
      }));
  for (const s of scopes) {
    add(s.itemName, 'the list item');
    for (const field of s.fields) add(`${s.itemName}.${field}`, 'item field');
    add(s.indexName, 'its position (from 0)');
  }
  if (options.handler) {
    add('result.outputs', 'run outputs');
    add('result.data', 'history rows');
    add('error.message', 'error');
  }
  return out;
}
