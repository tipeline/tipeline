import { describe, expect, it } from 'vitest';
import { coreValidations } from '@tipeline/schemas';

const { parseAppSource, migrateAppSourceV1, migrateAppSourceV2, createEmptyAppSource } =
  coreValidations.appObject;

function v2(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    workflows: { listInvoices: { identifier: 'task-abc' } },
    state: { status: 'pending' },
    pages: [
      {
        id: 'queue',
        name: 'Queue',
        runnables: {
          invoices: {
            mode: 'run',
            workflow: 'listInvoices',
            trigger: 'load',
            persist: false,
            outputs: ['rows'],
          },
        },
        components: [
          {
            id: 'refresh',
            type: 'button',
            name: 'Refresh',
            layout: { x: 0, y: 0, w: 3, h: 1 },
            props: { label: 'Refresh' },
            events: { click: [{ type: 'run', runnable: 'invoices' }] },
          },
          {
            id: 'invoiceTable',
            type: 'table',
            name: 'Invoices',
            layout: { x: 0, y: 1, w: 12, h: 6 },
            props: { data: '{= runnables.invoices.outputs.rows =}' },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function errorLines(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e: any) {
    return e.message.split('\n');
  }
  throw new Error('expected parseAppSource to throw');
}

describe('parseAppSource', () => {
  it('accepts a valid v2 source and fills defaults', () => {
    const source = parseAppSource(v2());

    const runnable = source.pages[0].runnables.invoices;
    expect(runnable).toMatchObject({
      mode: 'run',
      inputs: {},
      onSuccess: [],
      onError: [],
      persist: false,
    });
    expect(source.pages[0].showInMenu).toBe(true);
    expect(source.pages[0].components[1].events).toEqual({});
  });

  it('accepts a JSON string', () => {
    expect(parseAppSource(JSON.stringify(v2())).pages[0].id).toBe('queue');
  });

  it('reports every broken cross-reference with its path', () => {
    const source = v2();
    const page = (source.pages as any[])[0];
    page.runnables.invoices.workflow = 'missing';
    page.components[0].events.click = [
      { type: 'run', runnable: 'nope' },
      { type: 'navigate', page: 'ghost' },
    ];

    const lines = errorLines(() => parseAppSource(source));

    expect(lines[0]).toBe('app.validationFailed');
    expect(lines).toContain(
      'pages[0].runnables.invoices.workflow: unknown workflow alias "missing" — declare it under workflows'
    );
    expect(lines).toContain(
      'pages[0].components[0].events.click[0].runnable: unknown runnable "nope" on page "queue"'
    );
    expect(lines).toContain('pages[0].components[0].events.click[1].page: unknown page "ghost"');
  });

  it('rejects duplicate and reserved component ids', () => {
    const source = v2();
    const components = (source.pages as any[])[0].components;
    components[1].id = 'refresh';
    components.push({ ...components[0], id: 'state' });

    const lines = errorLines(() => parseAppSource(source));

    expect(lines).toContain('pages[0].components[1].id: duplicate component id "refresh"');
    expect(lines).toContain('pages[0].components[2].id: "state" is a reserved name');
  });

  it('rejects layouts that overflow the 12-column grid', () => {
    const source = v2();
    (source.pages as any[])[0].components[0].layout = { x: 10, y: 0, w: 4, h: 1 };

    expect(errorLines(() => parseAppSource(source))).toContain(
      'pages[0].components[0].layout: x + w must not exceed the 12 grid columns'
    );
  });

  it('rejects events a component type does not fire, and unknown keys', () => {
    const source = v2({ extra: true });
    (source.pages as any[])[0].components[1].events = { click: [] };

    const lines = errorLines(() => parseAppSource(source));

    expect(lines.some((l) => l.startsWith('pages[0].components[1].events.click'))).toBe(true);
    expect(lines.some((l) => l.includes("Unrecognized key(s) in object: 'extra'"))).toBe(true);
  });

  it('rejects unsupported schema versions and non-objects', () => {
    expect(errorLines(() => parseAppSource({ schemaVersion: 9, pages: [] }))[1]).toBe(
      'unsupported schemaVersion 9'
    );
    expect(errorLines(() => parseAppSource('not json'))[1]).toBe('source is not valid JSON');
    expect(errorLines(() => parseAppSource([]))[1]).toBe('source must be an object');
  });

  it('createEmptyAppSource is itself valid', () => {
    expect(parseAppSource(createEmptyAppSource()).pages).toHaveLength(1);
  });
});

describe('parseAppSource — forms, inputs, dialogs (phase 3)', () => {
  function app(components: any[], extra: Record<string, unknown> = {}) {
    return {
      schemaVersion: 2,
      workflows: { save: { identifier: 't' } },
      pages: [
        {
          id: 'main',
          name: 'Main',
          runnables: { submit: { mode: 'run', workflow: 'save' } },
          components,
          ...extra,
        },
        { id: 'edit', name: 'Edit', showInMenu: false },
      ],
    };
  }
  const layout = { x: 0, y: 0, w: 6, h: 4 };

  it('accepts forms, inputs, selects, checkboxes, alerts and the new actions', () => {
    const source = parseAppSource(
      app([
        {
          id: 'customerForm',
          type: 'form',
          name: 'Form',
          layout,
          props: {
            fields: [
              { name: 'email', type: 'text', required: true },
              { name: 'plan', type: 'select', options: ['basic', { label: 'Pro', value: 'pro' }] },
              { name: 'tags', type: 'multiselect', options: '{= runnables.submit.outputs.tags =}' },
              { name: 'invoice', type: 'file' },
            ],
            resetLabel: 'Clear',
          },
          events: {
            submit: [
              { type: 'run', runnable: 'submit' },
              { type: 'reset', component: 'customerForm' },
            ],
          },
        },
        {
          id: 'search',
          type: 'input',
          name: 'Search',
          layout,
          props: { inputType: 'text' },
          events: { change: [{ type: 'run', runnable: 'submit' }] },
        },
        {
          id: 'region',
          type: 'select',
          name: 'Region',
          layout,
          props: { options: ['EU'], multiple: true },
        },
        { id: 'active', type: 'checkbox', name: 'Active', layout, props: { default: true } },
        {
          id: 'errorBanner',
          type: 'alert',
          name: 'Error',
          layout,
          props: { message: '{{ runnables.submit.error }}', variant: 'error' },
        },
        {
          id: 'list',
          type: 'table',
          name: 'List',
          layout,
          props: {
            rowActions: [{ id: 'edit', label: 'Edit' }],
            searchable: true,
            exportable: true,
          },
          events: {
            'action:edit': [
              { type: 'openModal', page: 'edit', params: { id: '{= list.selectedRow.id =}' } },
            ],
          },
        },
      ])
    );

    expect(source.pages[0].components).toHaveLength(6);
    expect((source.pages[0].components[1].props as any).inputType).toBe('text');
  });

  it('accepts a form whose fields are one binding (checked when the page runs)', () => {
    const source = parseAppSource(
      app([
        {
          id: 'nodeForm',
          type: 'form',
          name: 'Node',
          layout,
          props: { fields: '{= runnables.type.outputs.fields =}' },
        },
      ])
    );
    expect((source.pages[0].components[0].props as any).fields).toBe('{= runnables.type.outputs.fields =}');
  });

  it('reports dialogs to missing pages, resets of non-inputs, unknown row-action events and duplicate fields', () => {
    const lines = errorLines(() =>
      parseAppSource(
        app([
          { id: 'title', type: 'text', name: 'T', layout, props: { content: 'x' } },
          {
            id: 'f',
            type: 'form',
            name: 'F',
            layout,
            props: { fields: [{ name: 'a' }, { name: 'a' }] },
            events: {
              submit: [
                { type: 'openModal', page: 'ghost' },
                { type: 'reset', component: 'title' },
              ],
            },
          },
          {
            id: 'list',
            type: 'table',
            name: 'L',
            layout,
            props: { rowActions: [{ id: 'edit', label: 'Edit' }] },
            events: { 'action:delete': [] },
          },
          { id: 'bad', type: 'table', name: 'B', layout, events: { hover: [] } },
        ])
      )
    );

    expect(lines).toContain('pages[0].components[1].events.submit[0].page: unknown page "ghost"');
    expect(lines).toContain(
      'pages[0].components[1].events.submit[1].component: "title" is not an input or form on page "main"'
    );
    expect(lines).toContain('pages[0].components[1].props.fields: duplicate field name');
    expect(lines).toContain(
      'pages[0].components[2].events.action:delete: no row action "delete" on this table'
    );
    expect(lines.some((l) => l.includes('unknown table event'))).toBe(true);
  });
});

describe('parseAppSource — table pagination (phase 4)', () => {
  const table = (props: Record<string, unknown>, events: Record<string, unknown> = {}) => ({
    schemaVersion: 2,
    workflows: { list: { identifier: 'w' } },
    pages: [
      {
        id: 'p',
        name: 'P',
        runnables: { load: { mode: 'run', workflow: 'list', inputs: { page: '{= t.page =}' } } },
        components: [
          { id: 't', type: 'table', name: 'T', layout: { x: 0, y: 0, w: 12, h: 4 }, props, events },
        ],
      },
    ],
  });

  it('accepts client and server pagination with a pageChange handler', () => {
    expect(() => parseAppSource(table({ pageSize: 25 }))).not.toThrow();
    expect(() =>
      parseAppSource(
        table(
          { pageSize: 25, pagination: 'server', total: '{= runnables.load.outputs.total =}' },
          { pageChange: [{ type: 'run', runnable: 'load' }] }
        )
      )
    ).not.toThrow();
  });

  it('accepts an approvals inbox, and rejects workflow aliases the app does not declare', () => {
    const withInbox = (props: Record<string, unknown>) => {
      const source = v2() as any;
      source.pages[0].components.push({
        id: 'inbox',
        type: 'approvals',
        name: 'Inbox',
        layout: { x: 0, y: 7, w: 6, h: 5 },
        props,
        events: { decided: [{ type: 'run', runnable: 'invoices' }] },
      });
      return source;
    };
    expect(() => parseAppSource(withInbox({}))).not.toThrow();
    expect(() =>
      parseAppSource(withInbox({ title: 'Waiting', workflows: ['listInvoices'] }))
    ).not.toThrow();
    expect(errorLines(() => parseAppSource(withInbox({ workflows: ['payInvoices'] })))).toContain(
      'pages[0].components[2].props.workflows: unknown workflow alias "payInvoices" — declare it under workflows'
    );
  });

  it('checks onPaused handlers like the other handlers', () => {
    const source = v2() as any;
    source.pages[0].runnables.invoices.onPaused = [{ type: 'run', runnable: 'nope' }];
    expect(errorLines(() => parseAppSource(source))).toContain(
      'pages[0].runnables.invoices.onPaused[0].runnable: unknown runnable "nope" on page "queue"'
    );
    source.pages[0].runnables.invoices.onPaused = [{ type: 'toast', message: 'Waiting' }];
    expect(parseAppSource(source).pages[0].runnables.invoices).toMatchObject({
      onPaused: [{ type: 'toast' }],
    });
  });

  it('requires a pageSize for server pagination', () => {
    expect(errorLines(() => parseAppSource(table({ pagination: 'server' })))).toContain(
      'pages[0].components[0].props.pageSize: server pagination needs a pageSize'
    );
  });
});

describe('migrateAppSourceV1', () => {
  const v1 = {
    version: '1.0.0',
    variables: [{ name: 'region', type: 'string', value: 'EU' }],
    pages: [
      {
        id: 'overview',
        name: 'Overview',
        showInMenu: true,
        icon: 'file',
        events: { ready: [{ type: 'setVar', taskIdentifier: 'T-kpi', targetVariable: 'totals' }] },
        components: [
          {
            id: 'kpi-revenue',
            type: 'kpi',
            name: 'Revenue',
            layout: { position: { x: 0, y: 0 }, size: { w: 3, h: 3 } },
            properties: {
              label: 'Revenue',
              value: '{{totals.revenue}}',
              trend: '8.3',
              trendDirection: 'up',
            },
          },
          {
            id: 'component-1700000000-12',
            type: 'button',
            name: 'Run',
            layout: { position: { x: 3, y: 0 }, size: { w: 3, h: 2 } },
            properties: {
              label: 'Run',
              variant: 'outline',
              events: {
                click: [
                  { type: 'exec', taskIdentifier: 'T-run' },
                  { type: 'navigate', targetPageId: 'details' },
                ],
              },
            },
          },
          {
            id: 'records',
            type: 'table',
            name: 'Records',
            layout: { position: { x: 0, y: 3 }, size: { w: 12, h: 6 } },
            properties: {
              events: {
                ready: [
                  {
                    type: 'fetch',
                    taskIdentifier: 'T-run',
                    sourceType: 'variables',
                    filterMode: 'range',
                    count: 5,
                    variableName: 'rows',
                    columns: 'first_name, status',
                    columnTransform: 'snakeToTitle',
                  },
                ],
              },
            },
          },
          {
            id: 'f1',
            type: 'form',
            name: 'Form',
            layout: { position: { x: 0, y: 9 }, size: { w: 6, h: 4 } },
            properties: {},
          },
        ],
      },
      {
        id: 'details',
        name: 'Details',
        showInMenu: false,
        components: [
          {
            id: 'cached',
            type: 'table',
            name: 'Cached',
            layout: { position: { x: 0, y: 0 }, size: { w: 6, h: 4 } },
            properties: { events: { ready: [{ type: 'getVar', variableName: 'totals' }] } },
          },
        ],
      },
    ],
  };

  it('produces a source that passes v2 validation', () => {
    expect(() => parseAppSource(v1)).not.toThrow();
  });

  it('turns workflow identifiers into aliases and v1 variables into state', () => {
    const source = migrateAppSourceV1(v1);

    expect(source.workflows).toEqual({
      workflow1: { identifier: 'T-kpi' },
      workflow2: { identifier: 'T-run' },
    });
    expect(source.state).toEqual({ region: 'EU', totals: null });
  });

  it('migrates every v1 action type', () => {
    const [overview, details] = migrateAppSourceV1(v1).pages;
    const [kpi, button, table] = overview.components;

    // setVar on page ready → manual history runnable run from page load, storing row 0
    expect(overview.events.load).toEqual([{ type: 'run', runnable: 'fetch1' }]);
    expect(overview.runnables.fetch1).toMatchObject({
      mode: 'history',
      workflow: 'workflow1',
      trigger: 'manual',
      onSuccess: [{ type: 'setState', key: 'totals', value: '{= result.data[0] =}' }],
    });

    // exec → run runnable; navigate keeps its target
    expect(button.events.click).toEqual([
      { type: 'run', runnable: 'run2' },
      { type: 'navigate', page: 'details' },
    ]);
    expect(overview.runnables.run2).toMatchObject({
      mode: 'run',
      workflow: 'workflow2',
      persist: true,
    });

    // fetch on table ready → history runnable on load, bound as the table's data
    expect(overview.runnables.fetch3).toEqual({
      mode: 'history',
      workflow: 'workflow2',
      trigger: 'load',
      source: 'variables',
      filter: { mode: 'range', count: 5 },
      variableName: 'rows',
      onSuccess: [],
      onError: [],
    });
    expect(table.props).toEqual({
      data: '{= runnables.fetch3.data =}',
      columns: [
        { key: 'first_name', header: 'First Name' },
        { key: 'status', header: 'Status' },
      ],
    });

    // getVar → table bound to state
    expect(details.components[0].props.data).toBe('{= state.totals =}');
    expect(details.showInMenu).toBe(false);

    // page-variable references now point at state; numeric strings become numbers
    expect(kpi.props).toEqual({
      label: 'Revenue',
      value: '{{ state.totals.revenue }}',
      trend: 8.3,
      trendDirection: 'up',
    });
  });

  it('sanitizes component ids into binding names, flattens layout, and drops placeholder types', () => {
    const [overview] = migrateAppSourceV1(v1).pages;

    expect(overview.components.map((c: any) => c.id)).toEqual([
      'kpi_revenue',
      'component_1700000000_12',
      'records',
    ]);
    expect(overview.components[1].layout).toEqual({ x: 3, y: 0, w: 3, h: 2 });
    expect(overview.components.some((c: any) => c.type === 'form')).toBe(false);
  });
});

describe('migrateAppSourceV2 (70px rows → 10px rows)', () => {
  it('multiplies y and h by 7 and leaves x and w alone', () => {
    const source = parseAppSource(v2());
    expect(source.schemaVersion).toBe(4);
    expect(source.pages[0].components.map((c) => c.layout)).toEqual([
      { x: 0, y: 0, w: 3, h: 7 },
      { x: 0, y: 7, w: 12, h: 42 },
    ]);
  });

  it('scales components inside containers the same way', () => {
    const page = (v2() as any).pages[0];
    const migrated = migrateAppSourceV2({
      ...v2(),
      pages: [
        {
          ...page,
          components: [
            { id: 'box', type: 'container', layout: { x: 0, y: 2, w: 12, h: 4 } },
            { id: 'inner', type: 'text', parent: { id: 'box' }, layout: { x: 0, y: 1, w: 6, h: 2 } },
          ],
        },
      ],
    });
    expect(migrated.pages[0].components.map((c: any) => c.layout)).toEqual([
      { x: 0, y: 14, w: 12, h: 28 },
      { x: 0, y: 7, w: 6, h: 14 },
    ]);
  });

  it('leaves a v3 source as it is', () => {
    const v3 = parseAppSource(v2());
    expect(parseAppSource(v3)).toEqual(v3);
  });

  it('migrates a v1 source all the way to the current version', () => {
    const source = parseAppSource({
      pages: [
        {
          id: 'home',
          name: 'Home',
          components: [{ id: 'b', type: 'button', layout: { position: { x: 0, y: 1 }, size: { w: 3, h: 1 } } }],
        },
      ],
    });
    expect(source.schemaVersion).toBe(4);
    expect(source.pages[0].components[0].layout).toEqual({ x: 0, y: 7, w: 3, h: 7 });
  });
});

describe('containers and tabs', () => {
  const layout = { x: 0, y: 0, w: 6, h: 3 };

  function withComponents(components: unknown[]) {
    return { schemaVersion: 2, workflows: {}, state: {}, pages: [{ id: 'home', name: 'Home', components }] };
  }

  const tabs = {
    id: 'sections',
    type: 'tabs',
    name: 'Sections',
    layout: { x: 0, y: 0, w: 12, h: 6 },
    props: {
      tabs: [
        { id: 'summary', label: 'Summary' },
        { id: 'details', label: 'Details' },
      ],
      defaultTab: '{{ state.tab }}',
    },
  };
  const box = { id: 'box', type: 'container', name: 'Box', layout, parent: { id: 'sections', tab: 'details' }, props: { title: 'Filters' } };
  const button = { id: 'save', type: 'button', name: 'Save', layout, parent: { id: 'box' }, props: {} };

  const issues = (components: unknown[]) => {
    try {
      parseAppSource(withComponents(components));
      return [];
    } catch (e: any) {
      return String(e.message).split('\n').slice(1);
    }
  };

  it('accepts components nested in a tab and in a container inside it', () => {
    const app = parseAppSource(withComponents([tabs, box, button]));
    const [, parsedBox, parsedButton] = app.pages[0].components;
    expect(parsedBox.parent).toEqual({ id: 'sections', tab: 'details' });
    expect(parsedButton.parent).toEqual({ id: 'box' });
  });

  it('gives a new tabs component one tab by default', () => {
    const app = parseAppSource(withComponents([{ id: 't', type: 'tabs', name: 'T', layout }]));
    expect((app.pages[0].components[0].props as any).tabs).toEqual([{ id: 'tab1', label: 'Tab 1' }]);
  });

  it('rejects a parent that is missing or not a container', () => {
    expect(issues([{ ...button, parent: { id: 'nowhere' } }])).toEqual([
      'pages[0].components[0].parent.id: "nowhere" is not a container or tabs component on page "home"',
    ]);
    expect(issues([tabs, { ...button, id: 'other', parent: { id: 'sections', tab: 'summary' } }, { ...button, parent: { id: 'other' } }])).toEqual([
      'pages[0].components[2].parent.id: "other" is not a container or tabs component on page "home"',
    ]);
  });

  it('requires an existing tab inside tabs, and no tab inside a container', () => {
    expect(issues([tabs, { ...box, parent: { id: 'sections' } }])).toEqual([
      'pages[0].components[1].parent.tab: a component inside tabs "sections" needs a tab',
    ]);
    expect(issues([tabs, { ...box, parent: { id: 'sections', tab: 'gone' } }])).toEqual([
      'pages[0].components[1].parent.tab: no tab "gone" in "sections"',
    ]);
    expect(issues([tabs, box, { ...button, parent: { id: 'box', tab: 'summary' } }])).toEqual([
      'pages[0].components[2].parent.tab: only a component inside tabs has a tab',
    ]);
  });

  it('rejects a component inside itself, directly or through others', () => {
    expect(issues([{ ...box, parent: { id: 'box' } }])).toContain(
      'pages[0].components[0].parent.id: a component cannot be inside itself'
    );
    const loop = issues([
      { ...box, id: 'a', parent: { id: 'b' } },
      { ...box, id: 'b', parent: { id: 'a' } },
    ]);
    expect(loop).toContain('pages[0].components[0].parent.id: a component cannot be inside itself');
  });

  it('rejects duplicate or missing tabs', () => {
    expect(issues([{ ...tabs, props: { tabs: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] } }])).toEqual([
      'pages[0].components[0].props.tabs: duplicate tab id',
    ]);
    expect(issues([{ ...tabs, props: { tabs: [] } }])).toEqual(['pages[0].components[0].props.tabs: tabs need at least one tab']);
  });

  it('lets reset target a tabs component', () => {
    const reset = { ...button, parent: undefined, events: { click: [{ type: 'reset', component: 'sections' }] } };
    expect(issues([tabs, reset])).toEqual([]);
  });
});

describe('editable tables', () => {
  const table = {
    id: 'records',
    type: 'table',
    name: 'Records',
    layout: { x: 0, y: 0, w: 12, h: 30 },
    props: {
      data: '{= state.rows =}',
      rowKey: 'id',
      allowAdd: true,
      allowDelete: true,
      saveLabel: 'Save {{ records.changes.updated | size }} rows',
      columns: [
        { key: 'id' },
        { key: 'name', editable: true, required: true, default: 'New' },
        { key: 'status', editable: true, editor: 'select', options: ['open', { label: 'Closed', value: 'closed' }] },
        { key: 'due', format: 'date', editable: true },
      ],
    },
    events: { save: [{ type: 'reset', component: 'records' }] },
  };
  const app = (components: unknown[]) => ({
    schemaVersion: 3,
    workflows: {},
    state: { rows: [] },
    pages: [{ id: 'home', name: 'Home', components }],
  });

  it('accepts editable columns, row add/delete, a save event and reset on the table', () => {
    const parsed = parseAppSource(app([table]));
    expect((parsed.pages[0].components[0].props as any).columns[2].editor).toBe('select');
  });

  it('accepts a binding for a select editor’s options', () => {
    const bound = structuredClone(table);
    (bound.props.columns[2] as any).options = '{= state.statuses =}';
    expect(() => parseAppSource(app([bound]))).not.toThrow();
  });

  it('rejects an unknown editor', () => {
    const bad = structuredClone(table);
    (bad.props.columns[1] as any).editor = 'textarea';
    expect(() => parseAppSource(app([bad]))).toThrow(/columns\[1\]\.editor/);
  });
});

describe('table bulk actions', () => {
  const table = (props: Record<string, unknown>, events: Record<string, unknown> = {}) => ({
    schemaVersion: 3,
    workflows: {},
    state: {},
    pages: [
      {
        id: 'home',
        name: 'Home',
        components: [{ id: 't', type: 'table', name: 'T', layout: { x: 0, y: 0, w: 12, h: 30 }, props, events }],
      },
    ],
  });
  const handler = [{ type: 'toast', message: 'done' }];

  it('accepts multiSelect, bulk actions, their bulk:<id> events and selectionChange', () => {
    expect(() =>
      parseAppSource(
        table(
          { multiSelect: true, bulkActions: [{ id: 'close', label: 'Close', variant: 'destructive' }] },
          { 'bulk:close': handler, selectionChange: handler }
        )
      )
    ).not.toThrow();
  });

  it('rejects a bulk:<id> event with no matching bulk action, and duplicate ids', () => {
    expect(() => parseAppSource(table({ bulkActions: [] }, { 'bulk:gone': handler }))).toThrow(
      /no bulk action "gone" on this table/
    );
    expect(() =>
      parseAppSource(table({ bulkActions: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }))
    ).toThrow(/duplicate bulk action id/);
  });
});

describe('details (keyValue)', () => {
  const app = (props: Record<string, unknown>) => ({
    schemaVersion: 3,
    workflows: {},
    state: {},
    pages: [
      {
        id: 'home',
        name: 'Home',
        components: [{ id: 'd', type: 'keyValue', name: 'Details', layout: { x: 0, y: 0, w: 4, h: 28 }, props }],
      },
    ],
  });

  it('accepts a bound object, fields with labels and formats, and its display options', () => {
    expect(() =>
      parseAppSource(
        app({
          title: 'Record {{ state.id }}',
          data: '{= recordsTable.selectedRow =}',
          fields: [{ key: 'customer.name', label: 'Customer' }, { key: 'amount', format: 'currency', currency: 'EUR' }],
          display: 'grid',
          emptyText: 'Select a record',
          hideEmpty: true,
          copyable: true,
        })
      )
    ).not.toThrow();
  });

  it('rejects an unknown display or field format, and events', () => {
    expect(() => parseAppSource(app({ display: 'table' }))).toThrow(/props\.display/);
    expect(() => parseAppSource(app({ fields: [{ key: 'a', format: 'money' }] }))).toThrow(/fields\[0\]\.format/);
    const withEvent: any = app({});
    withEvent.pages[0].components[0].events = { click: [] };
    expect(() => parseAppSource(withEvent)).toThrow();
  });
});

describe('date range', () => {
  const app = (component: Record<string, unknown>, filter: Record<string, unknown> = { mode: 'latest' }) => ({
    schemaVersion: 3,
    workflows: { log: { identifier: 'task-log' } },
    state: {},
    pages: [
      {
        id: 'home',
        name: 'Home',
        runnables: { runs: { mode: 'history', workflow: 'log', filter } },
        components: [{ id: 'period', type: 'dateRange', name: 'Period', layout: { x: 0, y: 0, w: 4, h: 10 }, ...component }],
      },
    ],
  });

  it('accepts a date range with a preset default, a change event and reset', () => {
    expect(() =>
      parseAppSource(
        app(
          {
            props: { label: 'Period', default: 'last7Days', required: true, hidePresets: false },
            events: { change: [{ type: 'run', runnable: 'runs' }, { type: 'reset', component: 'period' }] },
          },
          { mode: 'dateRange', dateFrom: '{= period.from =}', dateTo: '{= period.to =}' }
        )
      )
    ).not.toThrow();
  });

  it('lets a history filter count be a binding', () => {
    expect(() => parseAppSource(app({ props: {} }, { mode: 'range', count: '{= state.n =}' }))).not.toThrow();
    expect(() => parseAppSource(app({ props: {} }, { mode: 'range', count: 0 }))).toThrow(/filter\.count/);
  });
});

describe('list view', () => {
  const layout = { x: 0, y: 0, w: 6, h: 10 };
  const app = (components: unknown[]) => ({
    schemaVersion: 3,
    workflows: {},
    state: {},
    pages: [{ id: 'home', name: 'Home', components }],
  });
  const list = {
    id: 'cards',
    type: 'listView',
    name: 'Cards',
    layout: { x: 0, y: 0, w: 12, h: 40 },
    props: { data: '{= state.rows =}', itemsPerRow: 3, emptyText: 'Nothing yet' },
    events: { itemClick: [{ type: 'reset', component: 'cards' }] },
  };
  const child = (id: string, type: string, parent: string, props: Record<string, unknown> = {}) => ({
    id,
    type,
    name: id,
    layout,
    parent: { id: parent },
    props,
  });
  const issues = (components: unknown[]) => {
    try {
      parseAppSource(app(components));
      return [];
    } catch (e: any) {
      return String(e.message).split('\n').slice(1);
    }
  };

  it('accepts an item template of value-less components, at any depth, using item bindings', () => {
    expect(
      issues([
        list,
        child('title', 'text', 'cards', { content: '{{ item.name }} (#{{ index }})' }),
        child('box', 'container', 'cards'),
        child('open', 'button', 'box', { label: 'Open' }),
        child('facts', 'keyValue', 'box', { data: '{= item =}' }),
      ])
    ).toEqual([]);
  });

  it('rejects components with a value of their own anywhere in the template', () => {
    expect(issues([list, child('qty', 'input', 'cards')])).toEqual([
      `pages[0].components[1].type: "input" can't be inside list view "cards": every item would share its value`,
    ]);
    expect(issues([list, child('box', 'container', 'cards'), child('pick', 'select', 'box')])).toEqual([
      `pages[0].components[2].type: "select" can't be inside list view "cards": every item would share its value`,
    ]);
    expect(issues([list, child('inner', 'listView', 'cards')])).toHaveLength(1);
  });

  it('a value component next to the list (not in it) is fine', () => {
    expect(issues([list, { id: 'search', type: 'input', name: 'Search', layout, props: {} }])).toEqual([]);
  });

  it('lets a list name its item and index — names that are free and differ', () => {
    const named = (props: Record<string, unknown>) => ({ ...list, props: { ...list.props, ...props } });
    expect(issues([named({ itemName: 'record', indexName: 'position' }), child('t', 'text', 'cards', { content: '{{ record.name }}' })])).toEqual([]);
    expect(issues([named({ itemName: 'state' })])).toEqual(['pages[0].components[0].props.itemName: "state" is a reserved name']);
    expect(issues([named({ itemName: 'title' }), child('title', 'text', 'cards')])).toEqual([
      'pages[0].components[0].props.itemName: "title" is also a component id on page "home"',
    ]);
    expect(issues([named({ itemName: 'x', indexName: 'x' })])).toEqual([
      'pages[0].components[0].props.indexName: the item and index names must differ',
    ]);
    expect(issues([named({ itemName: '2bad' })])[0]).toMatch(/props\.itemName/);
  });

  it('rejects itemsPerRow outside 1–6', () => {
    expect(issues([{ ...list, props: { itemsPerRow: 9 } }])[0]).toMatch(/itemsPerRow/);
  });
});

describe('checkbox display', () => {
  const app = (components: unknown[]) => ({ schemaVersion: 3, workflows: {}, state: {}, pages: [{ id: 'h', name: 'H', components }] });
  const layout = { x: 0, y: 0, w: 3, h: 6 };

  it('takes switch or checkbox, on the component and on form checkbox fields', () => {
    expect(() =>
      parseAppSource(
        app([
          { id: 'agree', type: 'checkbox', name: 'A', layout, props: { label: 'I agree', display: 'checkbox' } },
          { id: 'f', type: 'form', name: 'F', layout, props: { fields: [{ name: 'terms', type: 'checkbox', display: 'checkbox' }] } },
        ])
      )
    ).not.toThrow();
    expect(() => parseAppSource(app([{ id: 'x', type: 'checkbox', name: 'X', layout, props: { display: 'radio' } }]))).toThrow(/props\.display/);
  });
});

describe('select display', () => {
  const app = (components: unknown[]) => ({ schemaVersion: 3, workflows: {}, state: {}, pages: [{ id: 'h', name: 'H', components }] });
  const layout = { x: 0, y: 0, w: 4, h: 10 };
  const form = (fields: unknown[]) => app([{ id: 'f', type: 'form', name: 'F', layout, props: { fields } }]);
  const issues = (data: unknown) => {
    try {
      parseAppSource(data);
      return [];
    } catch (e: any) {
      return String(e.message).split('\n').slice(1);
    }
  };

  it('a select component can be a dropdown, a list or buttons', () => {
    for (const display of ['dropdown', 'list', 'buttons'])
      expect(issues(app([{ id: 's', type: 'select', name: 'S', layout, props: { display } }]))).toEqual([]);
    expect(issues(app([{ id: 's', type: 'select', name: 'S', layout, props: { display: 'switch' } }]))[0]).toMatch(/props\.display/);
  });

  it('a search box (local / remote, with a search event) needs the dropdown display', () => {
    const select = (props: unknown, events: unknown = {}) => app([{ id: 's', type: 'select', name: 'S', layout, props, events }]);
    expect(issues(select({ search: 'local', multiple: true }))).toEqual([]);
    expect(issues(select({ search: 'remote', display: 'dropdown' }, { search: [{ type: 'setState', key: 'q', value: '{{ s.search }}' }] }))).toEqual([]);
    expect(issues(select({ search: 'off', display: 'buttons' }))).toEqual([]);
    expect(issues(select({ search: 'local', display: 'list' }))).toEqual([
      'pages[0].components[0].props.search: a search box needs the dropdown display, not "list"',
    ]);
    expect(issues(select({ search: 'fuzzy' }))[0]).toMatch(/props\.search/);
  });

  it('a form field’s display has to suit its type', () => {
    expect(
      issues(
        form([
          { name: 'a', type: 'select', display: 'buttons' },
          { name: 'b', type: 'multiselect', display: 'buttons' },
          { name: 'c', type: 'checkbox', display: 'checkbox' },
        ])
      )
    ).toEqual([]);
    expect(issues(form([{ name: 'a', type: 'multiselect', display: 'dropdown' }]))).toEqual([
      'pages[0].components[0].props.fields[0].display: a multiselect field can\'t be displayed as "dropdown"',
    ]);
    expect(issues(form([{ name: 'a', type: 'text', display: 'buttons' }]))).toHaveLength(1);
    expect(issues(form([{ name: 'a', type: 'checkbox', display: 'list' }]))).toHaveLength(1);
  });
});

describe('badges', () => {
  const app = (components: unknown[]) => ({ schemaVersion: 3, workflows: {}, state: {}, pages: [{ id: 'h', name: 'H', components }] });
  const layout = { x: 0, y: 0, w: 3, h: 7 };

  it('accepts the badge component and the badge format with colors', () => {
    expect(() =>
      parseAppSource(
        app([
          { id: 'b', type: 'badge', name: 'B', layout, props: { value: '{= state.status =}', label: 'Status', colors: { active: 'green' }, defaultColor: 'gray', size: 'md' } },
          { id: 't', type: 'table', name: 'T', layout, props: { columns: [{ key: 'status', format: 'badge', colors: { closed: 'gray' } }] } },
          { id: 'd', type: 'keyValue', name: 'D', layout, props: { fields: [{ key: 'status', format: 'badge' }] } },
        ])
      )
    ).not.toThrow();
  });

  it('rejects colors outside the palette', () => {
    expect(() => parseAppSource(app([{ id: 'b', type: 'badge', name: 'B', layout, props: { colors: { a: 'pink' } } }]))).toThrow(/colors\.a/);
  });
});

describe('component frame', () => {
  const layout = { x: 0, y: 0, w: 3, h: 7 };
  const app = (frame?: unknown) => ({
    schemaVersion: 3,
    workflows: {},
    state: {},
    pages: [{ id: 'home', name: 'Home', components: [{ id: 'b', type: 'badge', name: 'B', layout, frame, props: {} }] }],
  });

  it('accepts card, none or no frame', () => {
    expect(parseAppSource(app('card')).pages[0].components[0].frame).toBe('card');
    expect(parseAppSource(app('none')).pages[0].components[0].frame).toBe('none');
    expect(parseAppSource(app()).pages[0].components[0].frame).toBeUndefined();
  });

  it('rejects any other frame', () => {
    expect(() => parseAppSource(app('shadow'))).toThrow(/frame/);
  });
});

describe('table extras', () => {
  const app = (props: Record<string, unknown>) => ({
    schemaVersion: 4,
    workflows: {},
    state: {},
    pages: [{ id: 'h', name: 'H', components: [{ id: 't', type: 'table', name: 'T', layout: { x: 0, y: 0, w: 12, h: 30 }, props }] }],
  });

  it('accepts link / image columns, filters, highlight rules and expandable rows', () => {
    expect(() =>
      parseAppSource(
        app({
          columns: [
            { key: 'site', format: 'link', linkText: 'Open', filter: 'text' },
            { key: 'logo', format: 'image' },
            { key: 'status', filter: 'select', copy: true },
            { key: 'due', format: 'date', filter: 'date' },
            {
              key: 'amount',
              highlight: [
                { compareAs: 'number', operator: 'lt', value: 0, color: 'red' },
                { compareAs: 'string', operator: 'empty', color: 'gray' },
              ],
            },
          ],
          expandable: true,
          detailFields: [{ key: 'notes', label: 'Notes' }],
        })
      )
    ).not.toThrow();
  });

  it('rejects unknown filters, comparisons and colors; link / image are table-only formats', () => {
    expect(() => parseAppSource(app({ columns: [{ key: 'a', filter: 'range' }] }))).toThrow(/columns\[0\]\.filter/);
    expect(() => parseAppSource(app({ columns: [{ key: 'a', highlight: [{ compareAs: 'number', operator: 'between', value: 1, color: 'red' }] }] }))).toThrow(/highlight\[0\]\.operator/);
    expect(() => parseAppSource(app({ columns: [{ key: 'a', highlight: [{ compareAs: 'number', operator: 'startsWith', value: 1, color: 'red' }] }] }))).toThrow(/highlight\[0\]\.operator/);
    expect(() => parseAppSource(app({ columns: [{ key: 'a', highlight: [{ compareAs: 'number', operator: 'gt', color: 'red' }] }] }))).toThrow(/highlight\[0\]\.value/);
    expect(() => parseAppSource(app({ columns: [{ key: 'a', highlight: [{ compareAs: 'number', operator: 'eq', value: 1, color: 'pink' }] }] }))).toThrow(/highlight\[0\]\.color/);
    expect(() => parseAppSource(app({ detailFields: [{ key: 'a', format: 'link' }] }))).toThrow(/detailFields\[0\]\.format/);
  });

  it('fit (scroll / wrap / truncate) and column width / minWidth in pixels', () => {
    expect(() =>
      parseAppSource(app({ fit: 'truncate', columns: [{ key: 'id', width: 60 }, { key: 'name', minWidth: 120 }] }))
    ).not.toThrow();
    expect(() => parseAppSource(app({ fit: 'squeeze' }))).toThrow(/fit/);
    expect(() => parseAppSource(app({ columns: [{ key: 'a', width: '20%' }] }))).toThrow(/columns\[0\]\.width/);
    expect(() => parseAppSource(app({ columns: [{ key: 'a', minWidth: 0 }] }))).toThrow(/columns\[0\]\.minWidth/);
  });
});

describe('migrateAppSourceV3 (color rules → typed conditions)', () => {
  const v3 = (props: Record<string, unknown>, type = 'table') => ({
    schemaVersion: 3,
    workflows: {},
    state: {},
    pages: [{ id: 'h', name: 'H', components: [{ id: 'c', type, name: 'C', layout: { x: 0, y: 0, w: 12, h: 30 }, props }] }],
  });

  it('upgrades table column highlight rules', () => {
    const source = parseAppSource(
      v3({
        columns: [
          {
            key: 'amount',
            highlight: [
              { when: '<', value: 0, color: 'red' },
              { when: '=', value: 'Overdue', color: 'amber' },
              { when: 'empty', color: 'gray' },
            ],
          },
        ],
      })
    );
    expect(source.schemaVersion).toBe(4);
    expect((source.pages[0].components[0].props as any).columns[0].highlight).toEqual([
      { compareAs: 'number', operator: 'lt', value: 0, color: 'red' },
      { compareAs: 'string', operator: 'eq', ignoreCase: true, value: 'Overdue', color: 'amber' },
      { compareAs: 'string', operator: 'empty', color: 'gray' },
    ]);
  });

  it('upgrades progress colorRules', () => {
    const source = parseAppSource(v3({ value: 40, colorRules: [{ when: '>=', value: 90, color: 'green' }] }, 'progress'));
    expect((source.pages[0].components[0].props as any).colorRules).toEqual([
      { compareAs: 'number', operator: 'gte', value: 90, color: 'green' },
    ]);
  });
});

describe('button groups', () => {
  const app = (component: Record<string, unknown>) => ({
    schemaVersion: 3,
    workflows: {},
    state: {},
    pages: [{ id: 'h', name: 'H', components: [{ id: 'g', type: 'buttonGroup', name: 'G', layout: { x: 0, y: 0, w: 6, h: 6 }, ...component }] }],
  });
  const issues = (data: unknown) => {
    try {
      parseAppSource(data);
      return [];
    } catch (e: any) {
      return String(e.message).split('\n').slice(1);
    }
  };
  const items = [
    { id: 'export', label: 'Export', icon: 'Download' },
    { id: 'remove', label: 'Remove', variant: 'destructive', disabled: '{{ state.locked }}' },
  ];

  it('one action:<id> event per button, as a row or a menu', () => {
    expect(issues(app({ props: { items }, events: { 'action:export': [{ type: 'toast', message: 'x' }] } }))).toEqual([]);
    expect(issues(app({ props: { items, display: 'menu', label: 'More', icon: 'MoreHorizontal' } }))).toEqual([]);
  });

  it('refuses unknown buttons, other events, repeated ids and an empty group', () => {
    expect(issues(app({ props: { items }, events: { 'action:nope': [] } }))).toEqual([
      'pages[0].components[0].events.action:nope: no button "nope" in this group',
    ]);
    expect(issues(app({ props: { items }, events: { click: [] } }))[0]).toMatch(/use action:<itemId>/);
    expect(issues(app({ props: { items: [items[0], items[0]] } }))[0]).toMatch(/duplicate button id/);
    expect(issues(app({ props: { items: [] } }))[0]).toMatch(/at least one button/);
  });
});
