import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { invokeCore } from '@/utils/invoke';
import { itemFields, runnableSourceOf } from '@/utils/listItemFields';
import { useListItemFields } from '@/composables/useListItemFields';
import { bindingSuggestions } from '@/utils/appSuggestions';

const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r));
};

describe('listItemFields', () => {
  it('collects the keys of the first object items', () => {
    expect(itemFields([{ id: 1, name: 'a' }, { id: 2, status: 'x' }, 'text'])).toEqual(['id', 'name', 'status']);
    expect(itemFields('{= runnables.r.outputs.rows =}')).toEqual([]);
    expect(itemFields([])).toEqual([]);
  });

  it('reads which runnable a list is bound to', () => {
    expect(runnableSourceOf('{= runnables.records.outputs.records =}')).toEqual({ runnable: 'records', output: 'records' });
    expect(runnableSourceOf('{= runnables.notes.data =}')).toEqual({ runnable: 'notes', output: undefined });
    expect(runnableSourceOf('{{ runnables.records.outputs.records }}')).toBeNull();
    expect(runnableSourceOf([{ id: 1 }])).toBeNull();
  });
});

describe('useListItemFields', () => {
  afterEach(() => vi.mocked(invokeCore).mockReset());

  const page = (data: unknown, runnables: Record<string, any> = {}) =>
    ref({
      id: 'p',
      name: 'P',
      showInMenu: true,
      events: {},
      runnables,
      components: [{ id: 'cards', type: 'listView', name: 'C', layout: { x: 0, y: 0, w: 12, h: 40 }, props: { data }, events: {} }],
    } as any);
  const source = ref({ schemaVersion: 3, workflows: { list: { identifier: 'wf-list' } }, state: {}, pages: [] } as any);
  const run = { mode: 'run', workflow: 'list', trigger: 'load', inputs: {}, outputs: ['records'], persist: false, onSuccess: [], onError: [] };

  it('prefers items written into data, then what Preview saw, then the latest saved run', async () => {
    vi.mocked(invokeCore).mockResolvedValue([{ name: 'records', value: JSON.stringify([{ id: 1, saved: true }]) }]);
    const samples = ref<Record<string, string[]>>({});

    const literal = useListItemFields(source, page([{ a: 1 }]), samples);
    expect(literal.value.cards).toEqual({ fields: ['a'], from: 'data' });

    const bound = useListItemFields(source, page('{= runnables.records.outputs.records =}', { records: run }), samples);
    await flush();
    expect(invokeCore).toHaveBeenCalledWith('tableDataFetch', {
      taskIdentifier: 'wf-list',
      sourceType: 'variables',
      filterMode: 'latest',
      variableName: 'records',
    });
    expect(bound.value.cards).toEqual({ fields: ['id', 'saved'], from: 'history' });

    samples.value = { 'p/cards': ['id', 'name', 'status'] };
    expect(bound.value.cards).toEqual({ fields: ['id', 'name', 'status'], from: 'preview' });
  });

  it('knows nothing when there is no saved run (and never runs the workflow)', async () => {
    vi.mocked(invokeCore).mockResolvedValue([]);
    const fields = useListItemFields(source, page('{= runnables.records.outputs.records =}', { records: run }), ref({}));
    await flush();
    expect(fields.value.cards).toEqual({ fields: [], from: null });
    expect(vi.mocked(invokeCore).mock.calls.every(([channel]) => channel === 'tableDataFetch')).toBe(true);
  });

  it('item fields become autocomplete suggestions, under the list’s own names', () => {
    const app = {
      schemaVersion: 3,
      workflows: {},
      state: {},
      pages: [page([]).value],
    } as any;
    const paths = bindingSuggestions(app, 'p', {
      itemScopes: [{ itemName: 'record', indexName: 'position', fields: ['id', 'name'] }],
    }).map((s) => s.path);
    expect(paths).toEqual(expect.arrayContaining(['record', 'record.id', 'record.name', 'position', 'cards.selectedItem']));
    expect(paths).not.toContain('item');
    // without scopes: every list view on the page, by its names (default item / index)
    expect(bindingSuggestions(app, 'p').map((s) => s.path)).toEqual(expect.arrayContaining(['item', 'index']));
  });
});
