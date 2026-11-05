import type { Ref } from 'vue';
import { computed, inject, ref } from 'vue';
import { formatDistanceToNow } from 'date-fns';
import { generateIdentifier } from '@tipeline/utils';
import { SEND } from '@/ipc-channels';

export interface TaskVariableRef {
  name: string;
  type: string;
}

// Fallback only, used for variables that have never run yet. Real values
// (fetched below) always take priority — a fabricated value can't represent
// the actual shape of a real payload (e.g. an array of report objects), so
// it only needs to be good enough to prove loops/conditionals are wired up.
export function dummyValueForType(type: string): unknown {
  switch (type) {
    case 'string':
      return 'Sample text';
    case 'number':
      return 42;
    case 'boolean':
      return true;
    case 'date':
      return new Date().toISOString();
    case 'array':
      return ['Item 1', 'Item 2'];
    case 'object':
      return { sample: 'value' };
    default:
      return `[${type}]`; // image/audio/video/connections/tokens, etc.
  }
}

/**
 * Variable values for editor previews: what the workflow's most recent run
 * recorded, falling back to a sample value by type for variables that never
 * ran (or are hidden, like secrets). Reads the `taskVariables` and
 * `taskIdentifier` the step form provides, so call it from a field's setup.
 */
export function useLastRunVariables() {
  const taskVariables = inject<Ref<TaskVariableRef[]> | null>('taskVariables', null);
  const taskIdentifier = inject<string | null>('taskIdentifier', null);

  // Keyed by bare variable name (no `_global.` prefix).
  const realValuesByName = ref<Record<string, unknown> | null>(null);
  const realDataAsOf = ref<string | null>(null);
  let fetched = false;

  // Fetched once, the first time a preview needs it — not on every
  // keystroke, since the task's run history doesn't change while editing.
  async function load() {
    if (fetched) return;
    fetched = true;
    if (!taskIdentifier) return;
    try {
      const rows = await window.ipcRenderer.invoke(SEND.TABLE_DATA_FETCH, {
        correlationId: generateIdentifier(),
        payload: {
          taskIdentifier,
          sourceType: 'variables',
          filterMode: 'latest',
        },
      });
      if (!Array.isArray(rows) || rows.length === 0) return;
      const values: Record<string, unknown> = {};
      for (const row of rows) {
        let value = row.value;
        if (typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            // plain string value, not JSON — keep as-is
          }
        }
        values[row.name] = value;
      }
      realValuesByName.value = values;
      realDataAsOf.value = rows[0]?.pipeline_started_at ?? null;
    } catch {
      // No run history yet, or core unreachable — silently fall back to dummy data.
    }
  }

  /** Every task variable (names as written, `_global.` included) → its preview value. */
  const values = computed(() => {
    const result: Record<string, unknown> = {};
    for (const v of taskVariables?.value ?? []) {
      const bareName = v.name.startsWith('_global.') ? v.name.slice('_global.'.length) : v.name;
      const real = realValuesByName.value?.[bareName];
      result[v.name] = real !== undefined ? real : dummyValueForType(v.type);
    }
    return result;
  });

  /** Names whose preview value is a sample, not real run data. */
  const sampleNames = computed(
    () =>
      new Set(
        (taskVariables?.value ?? [])
          .filter((v) => {
            const bareName = v.name.startsWith('_global.') ? v.name.slice('_global.'.length) : v.name;
            return realValuesByName.value?.[bareName] === undefined;
          })
          .map((v) => v.name)
      )
  );

  const label = computed(() =>
    realDataAsOf.value
      ? `Real data from last run — ${formatDistanceToNow(new Date(realDataAsOf.value), { addSuffix: true })}`
      : 'Sample placeholder data'
  );

  return { taskVariables, load, values, sampleNames, label };
}
