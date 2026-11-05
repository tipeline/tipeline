import { describe, expect, it } from 'vitest';
import type { AppSource } from '@tipeline/schemas';
import { analyzeApp, type WorkflowCatalog } from '@/utils/appProblems';

const layout = { x: 0, y: 0, w: 6, h: 2 };

function app(overrides: Partial<AppSource> = {}): AppSource {
  return {
    schemaVersion: 2,
    workflows: {
      save: { identifier: 'wf-save' },
      gone: { identifier: 'wf-gone' },
    },
    state: { selected: null },
    pages: [
      {
        id: 'main',
        name: 'Main',
        showInMenu: true,
        events: {},
        runnables: {
          save: {
            mode: 'run',
            workflow: 'save',
            trigger: 'manual',
            inputs: { name: '{= form1.values.name =}', internal: 'x', nope: 1 },
            outputs: ['record', 'apiKey', 'ghost'],
            persist: true,
            onSuccess: [
              {
                type: 'toast',
                message: '{{ result.outputs.record.name }}',
                variant: 'default',
              },
            ],
            onError: [],
          },
          orphan: {
            mode: 'run',
            workflow: 'gone',
            trigger: 'manual',
            inputs: {},
            outputs: [],
            persist: true,
            onSuccess: [],
            onError: [],
          },
        },
        components: [
          {
            id: 'form1',
            type: 'form',
            name: 'Form',
            layout,
            props: { fields: [{ name: 'name', type: 'text' }] },
            events: { submit: [{ type: 'run', runnable: 'save' }] },
          },
          {
            id: 'note',
            type: 'text',
            name: 'Note',
            layout,
            props: {
              content:
                '{{ form1.values.email }} {{ table9.selectedRow }} {{ runnables.missing.data }} {{ runnables.save.outputs.total }} {{ state.selected.name }} {{ state.typo }} {{ form1.vals }} {% for r in runnables.save.outputs.record %}{{ r.x }}{% endfor %}',
            },
            events: {},
          },
        ],
      } as any,
    ],
    ...overrides,
  };
}

const catalog: WorkflowCatalog = new Map([
  [
    'wf-save',
    {
      name: 'Save',
      variables: [
        { name: 'name', visibility: 'public' },
        { name: 'internal' },
        { name: 'record', visibility: 'public' },
        { name: 'apiKey', visibility: 'public', secret: true },
      ],
    },
  ],
  ['wf-gone', null],
]);

describe('analyzeApp', () => {
  it('finds every kind of problem, errors first', () => {
    const problems = analyzeApp(app(), catalog);
    const summary = problems.map(
      (p) => `${p.severity}:${p.code}:${p.componentId ?? p.runnable ?? ''}`
    );

    expect(summary).toEqual([
      'error:workflowMissing:',
      'error:inputPrivate:save',
      'error:inputUnknown:save',
      'error:outputSecret:save',
      'error:outputUnknown:save',
      'error:componentUnknown:note',
      'error:runnableUnknown:note',
      'warning:runnableUnused:orphan',
      'warning:fieldUnknown:note',
      'warning:outputNotRequested:note',
      'warning:stateUnknown:note',
      'warning:componentFieldUnknown:note',
    ]);
    expect(
      problems.find((p) => p.code === 'componentUnknown')?.params
    ).toMatchObject({ component: 'table9' });
  });

  it('flags a runnable that sets an output of its workflow', () => {
    const withOutput: WorkflowCatalog = new Map([
      [
        'wf-save',
        {
          name: 'Save',
          variables: [
            { name: 'name', visibility: 'public', output: true },
            { name: 'internal' },
            { name: 'record', visibility: 'public' },
            { name: 'apiKey', visibility: 'public', secret: true },
          ],
        },
      ],
      ['wf-gone', null],
    ]);
    const problems = analyzeApp(app(), withOutput).filter((p) => p.code === 'inputOutput');
    expect(problems).toEqual([
      expect.objectContaining({ severity: 'error', runnable: 'save', params: { runnable: 'save', variable: 'name' } }),
    ]);
  });

  it('reports schema errors with their location', () => {
    const source = app();
    (source.pages[0].components[0].events as any).submit = [
      { type: 'run', runnable: 'zzz' },
    ];
    const schema = analyzeApp(source, catalog).filter(
      (p) => p.code === 'schema'
    );
    expect(schema).toEqual([
      expect.objectContaining({
        severity: 'error',
        pageId: 'main',
        componentId: 'form1',
      }),
    ]);
  });

  it('is quiet for a correct app, and skips workflow checks until the catalog has loaded', () => {
    const source = app({ workflows: { save: { identifier: 'wf-save' } } });
    const page = source.pages[0] as any;
    delete page.runnables.orphan;
    page.runnables.save.inputs = { name: '{= form1.values.name =}' };
    page.runnables.save.outputs = ['record'];
    page.components[1].props.content =
      '{{ form1.values.name }} {{ state.selected.name }} {{ runnables.save.outputs.record.name }}';

    expect(analyzeApp(source, catalog)).toEqual([]);
    page.runnables.save.inputs.nope = 1;
    expect(analyzeApp(source, new Map())).toEqual([]);
  });
});

describe('the layout showcase example', () => {
  it('has no problems: bindings into and across containers and tabs resolve', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: yaml } = await import('js-yaml');
    const { coreValidations } = await import('@tipeline/schemas');
    const file = yaml.load(
      readFileSync(new URL('../../../examples/apps/layout-showcase.yml', import.meta.url), 'utf8')
    ) as any;
    // As installed: the bundled workflow is referenced by identifier.
    const source = coreValidations.appObject.parseAppSource({
      schemaVersion: file.schemaVersion,
      workflows: { listRecords: { identifier: 'wf-list' } },
      state: file.state,
      pages: file.pages,
    });
    const catalog: WorkflowCatalog = new Map([
      [
        'wf-list',
        {
          name: 'List Records',
          variables: [
            { name: 'status', type: 'string', visibility: 'public' },
            { name: 'records', type: 'array', visibility: 'public' },
            { name: 'summary', type: 'object', visibility: 'public' },
          ] as any,
        },
      ],
    ]);
    expect(analyzeApp(source, catalog)).toEqual([]);
  });
});

describe('the records grid example', () => {
  it('has no problems: the table’s changes and hasChanges are known bindings', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: yaml } = await import('js-yaml');
    const { coreValidations } = await import('@tipeline/schemas');
    const file = yaml.load(
      readFileSync(new URL('../../../examples/apps/records-grid.yml', import.meta.url), 'utf8')
    ) as any;
    const source = coreValidations.appObject.parseAppSource({
      schemaVersion: file.schemaVersion,
      workflows: {
        listRecords: { identifier: 'wf-list' },
        saveChanges: { identifier: 'wf-save' },
        setStatus: { identifier: 'wf-status' },
      },
      state: file.state ?? {},
      pages: file.pages,
    });
    const catalog: WorkflowCatalog = new Map([
      [
        'wf-list',
        {
          name: 'List Records',
          variables: [
            { name: 'status', type: 'string', visibility: 'public' },
            { name: 'records', type: 'array', visibility: 'public' },
            { name: 'summary', type: 'object', visibility: 'public' },
          ] as any,
        },
      ],
      [
        'wf-save',
        {
          name: 'Save Record Changes',
          variables: [
            { name: 'changes', type: 'object', visibility: 'public' },
            { name: 'summary', type: 'object', visibility: 'public' },
          ] as any,
        },
      ],
      [
        'wf-status',
        {
          name: 'Set Records Status',
          variables: [
            { name: 'records', type: 'array', visibility: 'public' },
            { name: 'status', type: 'string', visibility: 'public' },
            { name: 'count', type: 'number', visibility: 'public' },
          ] as any,
        },
      ],
    ]);
    expect(analyzeApp(source, catalog)).toEqual([]);
  });
});

describe('the record details example', () => {
  it('has no problems', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: yaml } = await import('js-yaml');
    const { coreValidations } = await import('@tipeline/schemas');
    const file = yaml.load(
      readFileSync(new URL('../../../examples/apps/record-details.yml', import.meta.url), 'utf8')
    ) as any;
    const source = coreValidations.appObject.parseAppSource({
      schemaVersion: file.schemaVersion,
      workflows: { listRecords: { identifier: 'wf-list' } },
      state: {},
      pages: file.pages,
    });
    const catalog: WorkflowCatalog = new Map([
      [
        'wf-list',
        {
          name: 'List Records',
          variables: [
            { name: 'status', type: 'string', visibility: 'public' },
            { name: 'records', type: 'array', visibility: 'public' },
            { name: 'summary', type: 'object', visibility: 'public' },
          ] as any,
        },
      ],
    ]);
    expect(analyzeApp(source, catalog)).toEqual([]);
  });
});

describe('the activity log example', () => {
  it('has no problems: a history filter bound to a date range resolves', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: yaml } = await import('js-yaml');
    const { coreValidations } = await import('@tipeline/schemas');
    const file = yaml.load(
      readFileSync(new URL('../../../examples/apps/activity-log.yml', import.meta.url), 'utf8')
    ) as any;
    const source = coreValidations.appObject.parseAppSource({
      schemaVersion: file.schemaVersion,
      workflows: { logNote: { identifier: 'wf-log' } },
      state: {},
      pages: file.pages,
    });
    const catalog: WorkflowCatalog = new Map([
      [
        'wf-log',
        {
          name: 'Log Note',
          variables: [
            { name: 'note', type: 'string', visibility: 'public' },
            { name: 'category', type: 'string', visibility: 'public' },
          ] as any,
        },
      ],
    ]);
    expect(analyzeApp(source, catalog)).toEqual([]);
  });
});

describe('list view bindings', () => {
  const layout = { x: 0, y: 0, w: 6, h: 10 };
  const source = (components: any[], runnables: Record<string, any> = {}) =>
    ({
      schemaVersion: 3,
      workflows: { del: { identifier: 'wf-del' } },
      state: {},
      pages: [{ id: 'main', name: 'Main', showInMenu: true, events: {}, runnables, components }],
    }) as unknown as AppSource;
  const list = { id: 'cards', type: 'listView', name: 'Cards', layout, props: { data: [] }, events: {} };
  const catalog: WorkflowCatalog = new Map([['wf-del', { name: 'Delete', variables: [{ name: 'id', type: 'number', visibility: 'public' }] as any }]]);
  const codes = (app: AppSource) => analyzeApp(app, catalog).map((p) => `${p.code}:${p.componentId ?? p.runnable}`);

  it('item / index resolve inside the template — and in what its items run', () => {
    const app = source(
      [
        list,
        { id: 'title', type: 'text', name: 'T', layout, parent: { id: 'cards' }, props: { content: '{{ item.name }} #{{ index }}' }, events: {} },
        { id: 'del', type: 'button', name: 'D', layout, parent: { id: 'cards' }, props: {}, events: { click: [{ type: 'run', runnable: 'remove' }] } },
        { id: 'picked', type: 'text', name: 'P', layout, props: { content: '{{ cards.selectedItem.name }}' }, events: {} },
      ],
      { remove: { mode: 'run', workflow: 'del', trigger: 'manual', inputs: { id: '{= item.id =}' }, outputs: [], persist: true, onSuccess: [], onError: [] } }
    );
    expect(codes(app)).toEqual([]);
  });

  it('a list that names its item: that name resolves in its template, item no longer does', () => {
    const named = { ...list, props: { data: [], itemName: 'record' } };
    const app = source([
      named,
      { id: 'ok', type: 'text', name: 'O', layout, parent: { id: 'cards' }, props: { content: '{{ record.name }} {{ index }}' }, events: {} },
      { id: 'old', type: 'text', name: 'X', layout, parent: { id: 'cards' }, props: { content: '{{ item.name }}' }, events: {} },
    ]);
    expect(codes(app)).toEqual(['componentUnknown:old']);
  });

  it('outside a list template, item is an unknown component', () => {
    const app = source([list, { id: 'stray', type: 'text', name: 'S', layout, props: { content: '{{ item.name }}' }, events: {} }]);
    expect(codes(app)).toEqual(['componentUnknown:stray']);
  });
});

describe('the record cards example', () => {
  it('has no problems: item bindings in the card template and in what its buttons run', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: yaml } = await import('js-yaml');
    const { coreValidations } = await import('@tipeline/schemas');
    const file = yaml.load(
      readFileSync(new URL('../../../examples/apps/record-cards.yml', import.meta.url), 'utf8')
    ) as any;
    const source = coreValidations.appObject.parseAppSource({
      schemaVersion: file.schemaVersion,
      workflows: { listRecords: { identifier: 'wf-list' }, setStatus: { identifier: 'wf-status' } },
      state: {},
      pages: file.pages,
    });
    const catalog: WorkflowCatalog = new Map([
      ['wf-list', { name: 'List Records', variables: [
        { name: 'status', type: 'string', visibility: 'public' },
        { name: 'records', type: 'array', visibility: 'public' },
        { name: 'summary', type: 'object', visibility: 'public' },
      ] as any }],
      ['wf-status', { name: 'Set Records Status', variables: [
        { name: 'records', type: 'array', visibility: 'public' },
        { name: 'status', type: 'string', visibility: 'public' },
        { name: 'count', type: 'number', visibility: 'public' },
      ] as any }],
    ]);
    expect(analyzeApp(source, catalog)).toEqual([]);
  });
});

describe('the QR code maker example', () => {
  it('has no problems', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: yaml } = await import('js-yaml');
    const { coreValidations } = await import('@tipeline/schemas');
    const file = yaml.load(
      readFileSync(new URL('../../../examples/apps/qr-code-maker.yml', import.meta.url), 'utf8')
    ) as any;
    const source = coreValidations.appObject.parseAppSource({
      schemaVersion: file.schemaVersion,
      workflows: { makeQr: { identifier: 'wf-qr' } },
      state: {},
      pages: file.pages,
    });
    const catalog: WorkflowCatalog = new Map([
      ['wf-qr', { name: 'Make QR Code', variables: [
        { name: 'text', type: 'string', visibility: 'public' },
        { name: 'path', type: 'string', visibility: 'public' },
      ] as any }],
    ]);
    expect(analyzeApp(source, catalog)).toEqual([]);
  });
});

describe('the choice fields example', () => {
  it('has no problems', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: yaml } = await import('js-yaml');
    const { coreValidations } = await import('@tipeline/schemas');
    const file = yaml.load(
      readFileSync(new URL('../../../examples/apps/choice-fields.yml', import.meta.url), 'utf8')
    ) as any;
    const source = coreValidations.appObject.parseAppSource({
      schemaVersion: file.schemaVersion,
      workflows: {},
      state: {},
      pages: file.pages,
    });
    expect(analyzeApp(source, new Map())).toEqual([]);
  });
});

describe('the table features example', () => {
  it('has no problems', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: yaml } = await import('js-yaml');
    const { coreValidations } = await import('@tipeline/schemas');
    const file = yaml.load(readFileSync(new URL('../../../examples/apps/table-features.yml', import.meta.url), 'utf8')) as any;
    const source = coreValidations.appObject.parseAppSource({ schemaVersion: file.schemaVersion, workflows: {}, state: {}, pages: file.pages });
    expect(analyzeApp(source, new Map())).toEqual([]);
  });
});
