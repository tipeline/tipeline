import { describe, expect, it } from 'vitest';
import type { AppSource } from '@tipeline/schemas';
import { bindingSuggestions } from '@/utils/appSuggestions';
import { bindingQueryAt, insertBinding } from '@/utils/expressionField';

const layout = { x: 0, y: 0, w: 6, h: 2 };
const source = {
  schemaVersion: 2,
  workflows: { list: { identifier: 'w' } },
  state: { selected: null },
  pages: [
    {
      id: 'main',
      name: 'Main',
      showInMenu: true,
      events: {},
      runnables: {
        records: {
          mode: 'run',
          workflow: 'list',
          trigger: 'load',
          inputs: {},
          outputs: ['records', 'summary'],
          persist: false,
          onSuccess: [{ type: 'setState', key: 'lastLoad', value: 1 }],
          onError: [],
        },
        history: {
          mode: 'history',
          workflow: 'list',
          trigger: 'load',
          source: 'variables',
          filter: { mode: 'latest' },
          onSuccess: [],
          onError: [],
        },
      },
      components: [
        {
          id: 'search',
          type: 'input',
          name: 'S',
          layout,
          props: {},
          events: {},
        },
        {
          id: 'customer',
          type: 'form',
          name: 'F',
          layout,
          props: { fields: [{ name: 'email', type: 'text' }] },
          events: {},
        },
        {
          id: 'grid',
          type: 'table',
          name: 'T',
          layout,
          props: { columns: [{ key: 'id' }], pageSize: 10 },
          events: {},
        },
        { id: 'title', type: 'text', name: 'T', layout, props: {}, events: {} },
      ],
    },
  ],
} as unknown as AppSource;

describe('bindingSuggestions', () => {
  it('lists state, runnable outputs, component values and page params', () => {
    const paths = bindingSuggestions(source, 'main').map((s) => s.path);
    expect(paths).toEqual([
      'state.lastLoad',
      'state.selected',
      'runnables.records.outputs.records',
      'runnables.records.outputs.summary',
      'runnables.records.isRunning',
      'runnables.records.error',
      'runnables.history.data',
      'runnables.history.isRunning',
      'runnables.history.error',
      'search.value',
      'customer.values.email',
      'customer.values',
      'grid.selectedRow',
      'grid.selectedRow.id',
      'grid.page',
      'grid.pageSize',
      'page.params',
    ]);
  });

  it('adds result and error inside handlers', () => {
    const paths = bindingSuggestions(source, 'main', { handler: true }).map(
      (s) => s.path
    );
    expect(paths.slice(-3)).toEqual([
      'result.outputs',
      'result.data',
      'error.message',
    ]);
  });
});

describe('bindingQueryAt / insertBinding', () => {
  it('detects the binding being typed', () => {
    expect(bindingQueryAt('Total {{ runnables.re', 21)).toEqual({
      opener: '{{',
      query: 'runnables.re',
      start: 8,
    });
    expect(bindingQueryAt('{=', 2)).toEqual({
      opener: '{=',
      query: '',
      start: 2,
    });
    expect(bindingQueryAt('{{ a }} plain', 13)).toBeNull();
    expect(bindingQueryAt('no binding', 10)).toBeNull();
  });

  it('inserts the path and closes the binding when needed', () => {
    expect(
      insertBinding(
        'Total {{ runnables.re',
        21,
        'runnables.records.outputs.summary'
      )
    ).toEqual({
      text: 'Total {{ runnables.records.outputs.summary }}',
      caret: 'Total {{ runnables.records.outputs.summary'.length,
    });
    expect(insertBinding('{=', 2, 'grid.selectedRow')).toEqual({
      text: '{= grid.selectedRow =}',
      caret: '{= grid.selectedRow'.length,
    });
    // a closer already after the caret is reused
    expect(insertBinding('{{ sea }} items', 6, 'search.value').text).toBe(
      '{{ search.value }} items'
    );
  });
});
