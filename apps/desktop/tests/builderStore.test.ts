import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { coreValidations } from '@tipeline/schemas';

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/components/ui/sonner', () => ({ toast }));
vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import { useBuilderStore } from '@/store/builderStore';
import { invokeCore } from '@/utils/invoke';

const source = {
  schemaVersion: 2,
  workflows: { approval: { identifier: 'task-approve' } },
  state: {},
  pages: [
    {
      id: 'home',
      name: 'Home',
      showInMenu: true,
      events: { load: [{ type: 'run', runnable: 'approve' }] },
      runnables: {
        approve: {
          mode: 'run',
          workflow: 'approval',
          trigger: 'manual',
          inputs: {},
          outputs: [],
          persist: true,
          onSuccess: [{ type: 'navigate', page: 'details' }],
          onError: [],
        },
      },
      components: [
        {
          id: 'button1',
          type: 'button',
          name: 'Approve',
          layout: { x: 0, y: 0, w: 3, h: 1 },
          props: { label: 'Approve' },
          events: {
            click: [
              { type: 'run', runnable: 'approve' },
              { type: 'toast', message: 'ok', variant: 'default' },
            ],
          },
        },
      ],
    },
    {
      id: 'details',
      name: 'Details',
      showInMenu: false,
      events: {},
      runnables: {},
      components: [],
    },
  ],
};

async function loaded() {
  vi.mocked(invokeCore).mockImplementation(async (channel: string) =>
    channel === 'appDetail'
      ? {
          identifier: 'app-1',
          name: 'Invoices',
          source: JSON.stringify(source),
          source_error: null,
        }
      : {}
  );
  const store = useBuilderStore();
  await store.load('app-1');
  return store;
}

/** The source the store would save must always pass the v2 schema. */
function expectValid(store: ReturnType<typeof useBuilderStore>) {
  expect(() =>
    coreValidations.appObject.parseAppSource(
      JSON.parse(JSON.stringify(store.source))
    )
  ).not.toThrow();
}

describe('builderStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.mocked(invokeCore).mockReset();
    toast.error.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('loads the app and selects its first page', async () => {
    const store = await loaded();
    expect(store.appName).toBe('Invoices');
    expect(store.selectedPage?.id).toBe('home');
  });

  it('shows source errors instead of loading a broken app', async () => {
    vi.mocked(invokeCore).mockResolvedValue({
      identifier: 'x',
      name: 'X',
      source: '{}',
      source_error: 'app.validationFailed\nbad',
    });
    const store = useBuilderStore();
    await store.load('x');
    expect(store.loadError).toBe('app.validationFailed\nbad');
    expect(store.source).toBeNull();
  });

  it('deleting a runnable also removes every action that runs it', async () => {
    const store = await loaded();
    store.deleteRunnable('approve');

    const page = store.source!.pages[0];
    expect(page.events.load).toEqual([]);
    expect((page.components[0].events as any).click).toEqual([
      { type: 'toast', message: 'ok', variant: 'default' },
    ]);
    expectValid(store);
  });

  it('renaming a runnable also updates onPaused handlers', async () => {
    const store = await loaded();
    const approve = store.source!.pages[0].runnables.approve as any;
    store.saveRunnable('approve', 'approve', {
      ...approve,
      onPaused: [{ type: 'run', runnable: 'approve' }],
    });
    store.saveRunnable('approve', 'approveInvoice', {
      ...store.source!.pages[0].runnables.approve,
    });

    expect(
      (store.source!.pages[0].runnables.approveInvoice as any).onPaused
    ).toEqual([{ type: 'run', runnable: 'approveInvoice' }]);
    expectValid(store);
  });

  it('renaming a runnable updates the actions that run it', async () => {
    const store = await loaded();
    store.saveRunnable('approve', 'approveInvoice', {
      ...store.source!.pages[0].runnables.approve,
    });

    const page = store.source!.pages[0];
    expect(Object.keys(page.runnables)).toEqual(['approveInvoice']);
    expect(page.events.load).toEqual([
      { type: 'run', runnable: 'approveInvoice' },
    ]);
    expectValid(store);
  });

  it('deleting a page removes navigations to it and keeps at least one page', async () => {
    const store = await loaded();
    store.deletePage('details');
    expect(store.source!.pages.map((p) => p.id)).toEqual(['home']);
    expect(store.source!.pages[0].runnables.approve.onSuccess).toEqual([]);
    expectValid(store);

    store.deletePage('home');
    expect(store.source!.pages).toHaveLength(1);
  });

  it('moves a page, as one undo step, and ignores out-of-range moves', async () => {
    const store = await loaded();
    store.movePage('details', 0);
    expect(store.source!.pages.map((p) => p.id)).toEqual(['details', 'home']);
    expectValid(store);
    await Promise.resolve();

    store.movePage('details', 99);
    expect(store.source!.pages.map((p) => p.id)).toEqual(['home', 'details']);
    store.movePage('missing', 0);
    expect(store.source!.pages.map((p) => p.id)).toEqual(['home', 'details']);

    await Promise.resolve();
    store.undo();
    expect(store.source!.pages.map((p) => p.id)).toEqual(['details', 'home']);
  });

  it('reuses a workflow alias, and derives a unique alias for a new workflow', async () => {
    const store = await loaded();
    expect(store.ensureWorkflowAlias('task-approve', 'Whatever')).toBe(
      'approval'
    );
    expect(store.ensureWorkflowAlias('task-list', 'List open invoices')).toBe(
      'listOpenInvoices'
    );
    expect(store.ensureWorkflowAlias('task-2', '2024 report')).toBe(
      'workflow2024Report'
    );
    expect(store.source!.workflows.listOpenInvoices).toEqual({
      identifier: 'task-list',
    });
  });

  it('validates component ids on rename', async () => {
    const store = await loaded();
    store.addComponent(
      'table',
      { x: 0, y: 1, w: 12, h: 4 },
      { name: 'Table', props: {} }
    );
    expect(store.selectedComponentId).toBe('table1');

    expect(store.renameComponent('table1', 'button1')).toBe(
      'builder.errors.duplicateId'
    );
    expect(store.renameComponent('table1', 'state')).toBe(
      'builder.errors.reservedName'
    );
    expect(store.renameComponent('table1', '1bad')).toBe(
      'builder.errors.namePattern'
    );
    expect(store.renameComponent('table1', 'invoiceTable')).toBeNull();
    expect(store.selectedComponentId).toBe('invoiceTable');
    expectValid(store);
  });

  it('autosaves after a pause, drops unused workflow aliases, and queues edits made during a save', async () => {
    const store = await loaded();
    vi.mocked(invokeCore).mockClear();
    let finishSave!: () => void;
    vi.mocked(invokeCore).mockImplementation(
      (channel: string) =>
        new Promise((resolve) => {
          if (channel === 'appUpdateSource') finishSave = () => resolve({});
        }) as any
    );

    store.ensureWorkflowAlias('task-unused', 'Unused');
    store.updatePage({ name: 'Start' });
    expect(store.isDirty).toBe(true);
    expect(invokeCore).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(invokeCore).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(
      (vi.mocked(invokeCore).mock.calls[0][1] as any).source
    );
    expect(saved.pages[0].name).toBe('Start');
    expect(Object.keys(saved.workflows)).toEqual(['approval']);

    // An edit while the first save is in flight is saved right after it.
    store.updatePage({ name: 'Start again' });
    await vi.advanceTimersByTimeAsync(500);
    expect(invokeCore).toHaveBeenCalledTimes(1);
    finishSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(invokeCore).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse((vi.mocked(invokeCore).mock.calls[1][1] as any).source)
        .pages[0].name
    ).toBe('Start again');
  });

  it('a rejected save keeps the app dirty and reports the error', async () => {
    const store = await loaded();
    vi.mocked(invokeCore).mockRejectedValue(
      new Error('app.validationFailed\npages[0]: bad')
    );

    store.updatePage({ name: 'X' });
    await vi.advanceTimersByTimeAsync(500);

    expect(store.isDirty).toBe(true);
    expect(toast.error).toHaveBeenCalled();
  });

  describe('undo / redo', () => {
    it('undoes and redoes edits, one step per interaction', async () => {
      const store = await loaded();

      store.updatePage({ name: 'One' });
      await Promise.resolve();
      // two changes in the same tick → one step
      store.updatePage({ name: 'Two' });
      store.updatePage({ icon: 'Star' });
      await Promise.resolve();

      expect(store.canUndo).toBe(true);
      store.undo();
      expect(store.selectedPage?.name).toBe('One');
      expect(store.selectedPage?.icon).toBeUndefined();
      store.undo();
      expect(store.selectedPage?.name).toBe('Home');
      expect(store.canUndo).toBe(false);

      store.redo();
      store.redo();
      expect(store.selectedPage).toMatchObject({ name: 'Two', icon: 'Star' });
      expect(store.canRedo).toBe(false);
    });

    it('a new edit after undo clears redo, and undo keeps the selection valid', async () => {
      const store = await loaded();
      store.addComponent(
        'text',
        { x: 0, y: 5, w: 4, h: 1 },
        { name: 'T', props: {} }
      );
      await Promise.resolve();
      expect(store.selectedComponentId).toBe('text1');

      store.undo();
      expect(store.selectedComponentId).toBeNull();
      expect(store.canRedo).toBe(true);

      store.updatePage({ name: 'Changed' });
      await Promise.resolve();
      expect(store.canRedo).toBe(false);
    });

    it('undo schedules a save of the restored source', async () => {
      const store = await loaded();
      vi.mocked(invokeCore).mockClear();
      vi.mocked(invokeCore).mockResolvedValue({});
      store.updatePage({ name: 'X' });
      await vi.advanceTimersByTimeAsync(500);
      store.undo();
      await vi.advanceTimersByTimeAsync(500);

      const lastSaved = JSON.parse(
        (vi.mocked(invokeCore).mock.calls.at(-1)![1] as any).source
      );
      expect(lastSaved.pages[0].name).toBe('Home');
    });
  });

  describe('renames follow into bindings', () => {
    it('renaming a component rewrites bindings that use it', async () => {
      const store = await loaded();
      store.addComponent(
        'table',
        { x: 0, y: 5, w: 12, h: 4 },
        { name: 'Table', props: {} }
      );
      const page = store.source!.pages[0];
      (page.runnables.approve as any).inputs = {
        id: '{= table1.selectedRow.id =}',
      };
      store.updateComponent('button1', {
        props: { label: 'Approve {{ table1.selectedRow.name }}' },
      });

      store.renameComponent('table1', 'invoices');

      expect((page.runnables.approve as any).inputs).toEqual({
        id: '{= invoices.selectedRow.id =}',
      });
      expect((store.source!.pages[0].components[0].props as any).label).toBe(
        'Approve {{ invoices.selectedRow.name }}'
      );
      expectValid(store);
    });

    it('renaming a runnable rewrites runnables.<name> bindings', async () => {
      const store = await loaded();
      store.updateComponent('button1', {
        props: { label: '{{ runnables.approve.outputs.record.name }}' },
      });

      store.saveRunnable('approve', 'approveRecord', {
        ...store.source!.pages[0].runnables.approve,
      });

      expect((store.source!.pages[0].components[0].props as any).label).toBe(
        '{{ runnables.approveRecord.outputs.record.name }}'
      );
    });
  });

  describe('duplicate / copy / paste', () => {
    it('duplicates below everything with a new id, keeping its own references', async () => {
      const store = await loaded();
      const dropped = store.duplicateComponent('button1');
      const page = store.source!.pages[0];
      const copy = page.components.at(-1)!;

      expect(dropped).toBe(0);
      expect(copy).toMatchObject({
        id: 'button1Copy',
        name: 'Approve (copy)',
        layout: { x: 0, y: 1, w: 3, h: 1 },
      });
      expect(store.selectedComponentId).toBe('button1Copy');
      expect((copy.events as any).click[0]).toEqual({
        type: 'run',
        runnable: 'approve',
      });
      expect(store.duplicateComponent('button1')).toBe(0);
      expect(page.components.at(-1)!.id).toBe('button1Copy1');
      expectValid(store);
    });

    it('pasting into another page drops actions that point at things missing there', async () => {
      const store = await loaded();
      store.copyComponent('button1');
      store.selectPage('details');

      const dropped = store.pasteComponent();
      const pasted = store.source!.pages[1].components[0];

      expect(dropped).toBe(1); // the run of "approve", which only exists on "home"
      expect((pasted.events as any).click).toEqual([
        { type: 'toast', message: 'ok', variant: 'default' },
      ]);
      expectValid(store);
    });
  });

  it('replaceSource swaps the whole app in one undo step', async () => {
    const store = await loaded();
    const next = JSON.parse(JSON.stringify(store.source));
    next.pages = [next.pages[1]];
    store.replaceSource(next);
    await Promise.resolve();

    expect(store.selectedPageId).toBe('details');
    store.undo();
    expect(store.source!.pages).toHaveLength(2);
  });
});

describe('builderStore: list views', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.mocked(invokeCore).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const layout = { x: 0, y: 0, w: 6, h: 10 };
  async function withList() {
    const store = await loaded();
    store.addComponent('listView', { x: 0, y: 2, w: 12, h: 40 }, { name: 'List', props: {} });
    store.addComponent('text', layout, { name: 'Title', props: {} }, { id: 'listView1' });
    store.addComponent('input', { ...layout, y: 50 }, { name: 'Search', props: {} });
    return store;
  }
  const ids = (store: ReturnType<typeof useBuilderStore>) => store.source!.pages[0].components.map((c) => c.id);
  const byId = (store: ReturnType<typeof useBuilderStore>, id: string) =>
    store.source!.pages[0].components.find((c) => c.id === id);

  it('takes value-less components into the template, and refuses the others', async () => {
    const store = await withList();
    expect(byId(store, 'text1')!.parent).toEqual({ id: 'listView1' });
    store.addComponent('table', layout, { name: 'T', props: {} }, { id: 'listView1' });
    expect(ids(store)).not.toContain('table1');
    expectValid(store);
  });

  it('moving a value component — or a container holding one — into the template is refused', async () => {
    const store = await withList();
    expect(store.moveComponent('input1', { id: 'listView1' })).toBe(false);
    expect(byId(store, 'input1')!.parent).toBeUndefined();

    store.addComponent('container', { ...layout, y: 60 }, { name: 'Box', props: {} });
    store.addComponent('select', layout, { name: 'Pick', props: {} }, { id: 'container1' });
    expect(store.moveComponent('container1', { id: 'listView1' })).toBe(false);
    expect(store.moveComponent('ghost', { id: 'listView1' })).toBe(false); // no such component
    expect(store.moveComponent('text1', null)).toBe(true);
    expectValid(store);
  });

  it('renaming the item / index follows into the template and runnables', async () => {
    const store = await withList();
    store.updateComponent('text1', { props: { content: '{{ item.name }} #{{ index }}' } });
    store.source!.pages[0].runnables.approve = {
      ...(store.source!.pages[0].runnables.approve as any),
      inputs: { id: '{= item.id =}' },
    };
    store.updateComponent('listView1', { props: { itemName: 'record', indexName: 'position' } });
    expect((byId(store, 'text1')!.props as any).content).toBe('{{ record.name }} #{{ position }}');
    expect((store.source!.pages[0].runnables.approve as any).inputs).toEqual({ id: '{= record.id =}' });

    // swapping the two names renames each once
    store.updateComponent('listView1', { props: { itemName: 'position', indexName: 'record' } });
    expect((byId(store, 'text1')!.props as any).content).toBe('{{ position.name }} #{{ record }}');
    expectValid(store);
  });

  it('remembers the fields of the items a list showed in Preview', async () => {
    const store = await withList();
    store.recordListSample('home', 'listView1', [{ id: 1, name: 'a' }, { id: 2, status: 'x' }]);
    store.recordListSample('home', 'other', []);
    expect(store.listSamples).toEqual({ 'home/listView1': ['id', 'name', 'status'] });
  });

  it('a pasted value component lands on the page instead of in the template', async () => {
    const store = await withList();
    store.copyComponent('input1');
    store.selectComponent('text1');
    // a copy keeps its parent only where it is allowed: simulate copying from inside
    store.clipboard = [{ ...JSON.parse(JSON.stringify(byId(store, 'input1'))), parent: { id: 'listView1' } }];
    store.pasteComponent();
    expect(byId(store, 'input1Copy')!.parent).toBeUndefined();
    expectValid(store);
  });
});

describe('builderStore: table actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.mocked(invokeCore).mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('removing a row or bulk action removes its event handlers too', async () => {
    const store = await loaded();
    store.addComponent('table', { x: 0, y: 2, w: 12, h: 30 }, { name: 'Table', props: {} });
    const handler = [{ type: 'toast', message: 'ok', variant: 'default' }] as any;
    store.updateComponent('table1', {
      props: {
        rowActions: [{ id: 'edit', label: 'Edit' }],
        bulkActions: [
          { id: 'close', label: 'Close' },
          { id: 'remove', label: 'Delete' },
        ],
      },
      events: { 'action:edit': handler, 'bulk:close': handler, 'bulk:remove': handler },
    });
    expectValid(store);

    store.updateComponent('table1', { props: { bulkActions: [{ id: 'close', label: 'Close' }] } });
    const table = store.source!.pages[0].components.find((c) => c.id === 'table1')!;
    expect(Object.keys(table.events ?? {}).sort()).toEqual(['bulk:close']);
    expectValid(store);
  });
});

describe('builderStore: containers and tabs', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.mocked(invokeCore).mockReset();
  });

  afterEach(() => vi.useRealTimers());

  const layout = { x: 0, y: 0, w: 6, h: 2 };
  const TABS = {
    tabs: [
      { id: 'tab1', label: 'One' },
      { id: 'tab2', label: 'Two' },
    ],
  };

  /** home: tabs1 › tab2 › container1 › input1 (reset by button1's click). */
  async function nested() {
    const store = await loaded();
    store.addComponent('tabs', { x: 0, y: 1, w: 12, h: 6 }, { name: 'Tabs', props: TABS });
    store.addComponent('container', layout, { name: 'Box', props: {} }, { id: 'tabs1', tab: 'tab2' });
    store.addComponent('input', layout, { name: 'Name', props: {} }, { id: 'container1' });
    store.updateComponent('button1', {
      events: { click: [{ type: 'reset', component: 'input1' }] },
    });
    return store;
  }

  const byId = (store: ReturnType<typeof useBuilderStore>, id: string) =>
    store.source!.pages[0].components.find((c) => c.id === id);

  it('adds components inside a tab and a container', async () => {
    const store = await nested();
    expect(byId(store, 'container1')!.parent).toEqual({ id: 'tabs1', tab: 'tab2' });
    expect(byId(store, 'input1')!.parent).toEqual({ id: 'container1' });
    expectValid(store);
  });

  it('selecting a component opens the tabs around it in the editor', async () => {
    const store = await nested();
    store.selectComponent(null);
    store.setEditorTab('tabs1', 'tab1');
    store.selectComponent('input1');
    expect(store.editorTabs.tabs1).toBe('tab2');
  });

  it('removing a container removes everything inside it, and resets that target them', async () => {
    const store = await nested();
    store.removeComponent('tabs1');
    expect(store.source!.pages[0].components.map((c) => c.id)).toEqual(['button1']);
    expect((byId(store, 'button1')!.events as any).click).toEqual([]);
    expectValid(store);
  });

  it('renaming a container keeps its children inside it', async () => {
    const store = await nested();
    expect(store.renameComponent('container1', 'filters')).toBeNull();
    expect(byId(store, 'input1')!.parent).toEqual({ id: 'filters' });
    expect(store.renameComponent('tabs1', 'sections')).toBeNull();
    expect(byId(store, 'filters')!.parent).toEqual({ id: 'sections', tab: 'tab2' });
    expectValid(store);
  });

  it('components of a removed tab move to the first tab', async () => {
    const store = await nested();
    store.updateComponent('tabs1', { props: { tabs: [{ id: 'tab1', label: 'One' }] } });
    expect(byId(store, 'container1')!.parent).toEqual({ id: 'tabs1', tab: 'tab1' });
    expectValid(store);
  });

  it('moves a component between grids, below what is there, but never into itself', async () => {
    const store = await nested();
    store.moveComponent('input1', null);
    expect(byId(store, 'input1')!.parent).toBeUndefined();
    expect(byId(store, 'input1')!.layout.y).toBe(7); // below tabs1 (y 1 + h 6)

    store.moveComponent('input1', { id: 'tabs1', tab: 'tab1' });
    expect(byId(store, 'input1')!.parent).toEqual({ id: 'tabs1', tab: 'tab1' });
    expect(store.editorTabs.tabs1).toBe('tab1');

    store.moveComponent('tabs1', { id: 'container1' }); // container1 is inside tabs1
    store.moveComponent('container1', { id: 'container1' });
    store.moveComponent('container1', { id: 'button1' }); // not a container
    expect(byId(store, 'tabs1')!.parent).toBeUndefined();
    expect(byId(store, 'container1')!.parent).toEqual({ id: 'tabs1', tab: 'tab2' });
    expectValid(store);
  });

  it('a component dragged onto another grid lands where it was dropped', async () => {
    const store = await nested();
    store.moveComponent('button1', { id: 'container1' }, { x: 6, y: 3, w: 4, h: 1 });
    expect(byId(store, 'button1')).toMatchObject({ parent: { id: 'container1' }, layout: { x: 6, y: 3, w: 4, h: 1 } });
    store.moveComponent('input1', null, { x: 2, y: 0, w: 6, h: 2 });
    expect(byId(store, 'input1')).toMatchObject({ layout: { x: 2, y: 0, w: 6, h: 2 } });
    expect(byId(store, 'input1')!.parent).toBeUndefined();
    expectValid(store);
  });

  it('duplicating a container copies what is inside it, with references following the copies', async () => {
    const store = await nested();
    store.updateComponent('input1', { props: { default: '{{ container1.title }}' } });
    store.updateComponent('container1', {
      events: {},
    });
    store.addComponent('button', layout, { name: 'Clear', props: {} }, { id: 'container1' });
    store.updateComponent('button2', { events: { click: [{ type: 'reset', component: 'input1' }] } });

    expect(store.duplicateComponent('container1')).toBe(0);
    const copy = byId(store, 'container1Copy')!;
    expect(copy.parent).toEqual({ id: 'tabs1', tab: 'tab2' });
    expect(copy.layout.y).toBe(2); // below container1 in the same tab
    expect(byId(store, 'input1Copy')).toMatchObject({
      name: 'Name',
      parent: { id: 'container1Copy' },
      props: { default: '{{ container1Copy.title }}' },
    });
    expect((byId(store, 'button2Copy')!.events as any).click).toEqual([{ type: 'reset', component: 'input1Copy' }]);
    expect(store.selectedComponentId).toBe('container1Copy');
    expectValid(store);
  });

  it('pasting a container on a page without its parent puts it on the page grid', async () => {
    const store = await nested();
    store.copyComponent('container1');
    store.selectPage('details');
    expect(store.pasteComponent()).toBe(0);
    const pasted = store.source!.pages[1].components;
    expect(pasted.map((c) => c.id)).toEqual(['container1Copy', 'input1Copy']);
    expect(pasted[0].parent).toBeUndefined();
    expect(pasted[1].parent).toEqual({ id: 'container1Copy' });
    expectValid(store);
  });
});
