import { computed, ref, watch, type Ref } from 'vue';
import type { AppPage, AppSource } from '@tipeline/schemas';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { itemFields, runnableSourceOf } from '@/utils/listItemFields';

export type ItemFieldsOrigin = 'data' | 'preview' | 'history';

export interface ListItemFields {
  fields: string[];
  /** Where they were seen; null when nothing is known yet. */
  from: ItemFieldsOrigin | null;
}

/**
 * The fields of every list view's items on a page, for `item.` autocomplete — without
 * running anything. Looked for in order: items written into `data` itself, the items
 * the list showed in Preview this session, and the latest saved run of the workflow
 * its `data` is bound to (only runs kept in the history; read-only).
 */
export function useListItemFields(
  source: Ref<AppSource | null>,
  page: Ref<AppPage | null>,
  previewSamples: Ref<Record<string, string[]>>
) {
  // Latest saved run, per "workflow|output" (null: nothing saved).
  const fromHistory = ref<Record<string, string[] | null>>({});

  async function loadHistory(key: string, taskIdentifier: string, output: string | undefined, def: any) {
    fromHistory.value = { ...fromHistory.value, [key]: null };
    try {
      if (output) {
        // A run runnable's output: the variable's value in the latest saved run.
        const rows = await invokeCore<any[]>(SEND.TABLE_DATA_FETCH, {
          taskIdentifier,
          sourceType: 'variables',
          filterMode: 'latest',
          variableName: output,
        });
        const raw = rows?.[0]?.value;
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        fromHistory.value = { ...fromHistory.value, [key]: itemFields(value) };
      } else {
        // A history runnable's rows, read the way it reads them.
        const rows = await invokeCore<any[]>(SEND.TABLE_DATA_FETCH, {
          taskIdentifier,
          sourceType: def.source,
          filterMode: 'latest',
          actionIdentifier: def.actionIdentifier,
          variableName: def.variableName,
        });
        fromHistory.value = { ...fromHistory.value, [key]: itemFields(rows) };
      }
    } catch {
      // No saved run, or the workflow is gone: nothing to suggest from here.
    }
  }

  /** Each list view on the page and the runnable its data comes from, if any. */
  const lists = computed(() =>
    (page.value?.components ?? [])
      .filter((c) => c.type === 'listView')
      .map((c) => {
        const data = (c.props as any).data;
        const bound = runnableSourceOf(data);
        const def = bound ? page.value?.runnables[bound.runnable] : undefined;
        const taskIdentifier = def ? source.value?.workflows[def.workflow]?.identifier : undefined;
        const historyKey =
          bound && def && taskIdentifier ? `${taskIdentifier}|${bound.output ?? `history:${bound.runnable}`}` : null;
        return { id: c.id, data, bound, def, taskIdentifier, historyKey };
      })
  );

  watch(
    lists,
    (all) => {
      for (const l of all) {
        if (!l.historyKey || l.historyKey in fromHistory.value) continue;
        // A run runnable needs an output to read; a history runnable reads its rows.
        if (l.def?.mode === 'run' && !l.bound?.output) continue;
        void loadHistory(l.historyKey, l.taskIdentifier!, l.bound?.output, l.def);
      }
    },
    { immediate: true }
  );

  return computed(() => {
    const out: Record<string, ListItemFields> = {};
    for (const l of lists.value) {
      const literal = itemFields(l.data);
      const preview = previewSamples.value[`${page.value?.id}/${l.id}`] ?? [];
      const saved = (l.historyKey && fromHistory.value[l.historyKey]) || [];
      out[l.id] = literal.length
        ? { fields: literal, from: 'data' }
        : preview.length
          ? { fields: preview, from: 'preview' }
          : saved.length
            ? { fields: saved, from: 'history' }
            : { fields: [], from: null };
    }
    return out;
  });
}
