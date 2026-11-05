import { shallowRef, watch, type Ref } from 'vue';
import type { AppSource } from '@tipeline/schemas';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import type { WorkflowCatalog } from '@/utils/appProblems';

/**
 * Name and variables of every workflow an app declares, loaded as aliases appear —
 * null for an identifier that isn't installed. Used by the builder's problem checks.
 */
export function useWorkflowCatalog(source: Ref<AppSource | null>) {
  const catalog = shallowRef<WorkflowCatalog>(new Map());
  const requested = new Set<string>();

  async function load(identifier: string) {
    let info: { name: string; variables: any[] } | null = null;
    try {
      const task = await invokeCore(SEND.TASK_DETAIL, { identifier });
      if (task?.source) {
        const variables = JSON.parse(task.source)?.pipeline?.variables;
        info = {
          name: task.name ?? identifier,
          variables: Array.isArray(variables) ? variables : [],
        };
      }
    } catch {
      info = null;
    }
    catalog.value = new Map(catalog.value).set(identifier, info);
  }

  watch(
    () => Object.values(source.value?.workflows ?? {}).map((w) => w.identifier),
    (identifiers) => {
      for (const id of identifiers) {
        if (requested.has(id)) continue;
        requested.add(id);
        void load(id);
      }
    },
    { immediate: true }
  );

  /** Reloads everything — e.g. after editing a workflow in another window. */
  function refresh() {
    requested.clear();
    catalog.value = new Map();
    for (const id of Object.values(source.value?.workflows ?? {}).map(
      (w) => w.identifier
    )) {
      requested.add(id);
      void load(id);
    }
  }

  return { catalog, refresh };
}
