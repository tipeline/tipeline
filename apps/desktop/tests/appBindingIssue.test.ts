import { describe, expect, it } from 'vitest';
import type { AppSource } from '@tipeline/schemas';
import { analyzeApp, bindingIssue, bindingScope } from '@/utils/appProblems';

const layout = { x: 0, y: 0, w: 6, h: 2 };
const source = {
  schemaVersion: 2,
  workflows: { save: { identifier: 'wf-save' } },
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
          inputs: {},
          outputs: ['record'],
          persist: true,
          onSuccess: [{ type: 'setState', key: 'saved', value: true }],
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
          events: {},
        },
      ],
    },
  ],
} as unknown as AppSource;

describe('bindingIssue', () => {
  it('checks one reference the way the problems list does', () => {
    const scope = bindingScope(source, source.pages[0]);
    const code = (ref: string) => bindingIssue(ref, scope)?.code ?? null;
    expect(code('form1.values.name')).toBeNull();
    expect(code('state.selected')).toBeNull();
    expect(code('state.saved')).toBeNull(); // written by a setState
    expect(code('result.outputs.anything')).toBeNull();
    expect(code('runnables.save.outputs.record')).toBeNull();
    expect(code('table9.selectedRow')).toBe('componentUnknown');
    expect(code('runnables.missing.data')).toBe('runnableUnknown');
    expect(code('runnables.save.outputs.total')).toBe('outputNotRequested');
    expect(code('state.typo')).toBe('stateUnknown');
    expect(code('form1.values.nope')).toBe('fieldUnknown');
    expect(code('form1.vals')).toBe('componentFieldUnknown');
    expect(bindingIssue('table9.x', scope)).toEqual({
      severity: 'error',
      code: 'componentUnknown',
      params: { ref: 'table9.x', component: 'table9' },
    });
  });
});

describe('malformed bindings in the problems list', () => {
  it('are reported wherever they are, including fields not marked bindable', () => {
    const broken = structuredClone(source) as any;
    const page = broken.pages[0];
    page.components.push({
      id: 'tabs1',
      type: 'tabs',
      name: 'Tabs',
      layout,
      props: { tabs: [{ id: 'tab1', label: 'Tab {{ state.n' }], defaultTab: '{{ state.tab }' },
      events: {},
    });
    page.runnables.save.inputs = { name: 'Hi {= form1.values.name =}' };
    page.events = { load: [{ type: 'toast', message: '{% if state.selected %}x', variant: 'default' }] };

    const found = analyzeApp(broken, new Map())
      .filter((p) => p.code.startsWith('binding'))
      .map((p) => [p.code, p.params.snippet, p.componentId ?? p.runnable ?? 'page']);
    expect(found).toEqual([
      ['bindingUnclosed', '{{ state.n', 'tabs1'],
      ['bindingUnclosed', '{{ state.tab }', 'tabs1'],
      ['bindingRawNotAlone', '{= form1.values.name =}', 'save'],
      ['bindingUnclosed', '{% if state.selected %}', 'page'],
    ]);
  });
});

describe('where problems are located', () => {
  it('names the prop or event a problem is in, so the properties panel can show it there', () => {
    const app = structuredClone(source) as any;
    const page = app.pages[0];
    page.components.push({
      id: 'grid',
      type: 'table',
      name: 'Grid',
      layout,
      props: { data: '{{ runnables.nope.data }}', columns: [{ key: 'a', label: '{{ state.typo }}' }] },
      events: { rowClick: [{ type: 'setState', key: 'x', value: '{= gird.selectedRow =}' }] },
    });
    page.events = { load: [{ type: 'toast', message: '{{ ghost.value }}', variant: 'default' }] };

    const at = analyzeApp(app, new Map())
      .filter((p) => p.componentId === 'grid' || (!p.componentId && !p.runnable))
      .map((p) => [p.code, p.componentId ?? 'page', p.prop ?? p.event]);
    expect(at).toEqual(
      expect.arrayContaining([
        ['runnableUnknown', 'grid', 'data'],
        ['stateUnknown', 'grid', 'columns'],
        ['componentUnknown', 'grid', 'rowClick'],
        ['componentUnknown', 'page', 'load'],
      ])
    );
  });

  it('places schema errors on their prop', () => {
    const app = structuredClone(source) as any;
    app.pages[0].components[0].props.fields = 42; // a string is a binding to the fields
    const schema = analyzeApp(app, new Map()).find((p) => p.code === 'schema');
    expect(schema).toMatchObject({ componentId: 'form1', prop: 'fields' });
  });
});
