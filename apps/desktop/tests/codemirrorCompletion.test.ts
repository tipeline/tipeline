// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { CompletionContext, type Completion, type CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expressionCompletionSource, liquidTagQueryAt } from '@/utils/codemirrorCompletion';
import type { ExpressionSuggestion } from '@/utils/expressionField';

const suggestions: ExpressionSuggestion[] = [
  { path: 'title', detail: 'string' },
  { path: 'total', detail: 'number' },
  { path: 'customer', detail: 'object' },
  { path: 'customer.name', parent: 'customer', detail: 'string' },
  { path: 'customer.address', parent: 'customer', detail: 'object', container: true },
  { path: 'customer.address.city', parent: 'customer.address', detail: 'string' },
  { path: 'orders', detail: 'array' },
  { path: 'pending', detail: 'run once', disabled: true },
];

const source = expressionCompletionSource(() => suggestions);

/** `|` marks the caret. */
function setup(doc: string) {
  const pos = doc.indexOf('|');
  const text = doc.replace('|', '');
  const view = new EditorView({
    state: EditorState.create({ doc: text, selection: { anchor: pos } }),
    parent: document.body,
  });
  return { view, pos };
}

function complete(doc: string, explicit = false) {
  const { view, pos } = setup(doc);
  const result = source(new CompletionContext(view.state, pos, explicit)) as CompletionResult | null;
  return { view, result, labels: result?.options.map((o) => o.label) ?? null };
}

function pick(doc: string, label: string) {
  const { view, result } = complete(doc);
  const option = result!.options.find((o) => o.label === label)!;
  const to = view.state.selection.main.head;
  (option.apply as (v: EditorView, c: Completion, f: number, t: number) => void)(view, option, result!.from, to);
  const head = view.state.selection.main.head;
  const out = view.state.doc.toString();
  view.destroy();
  return `${out.slice(0, head)}|${out.slice(head)}`;
}

describe('liquidTagQueryAt', () => {
  it('reads the path after a tag keyword', () => {
    expect(liquidTagQueryAt('{% if cus', 9)).toEqual({ query: 'cus' });
    expect(liquidTagQueryAt('{%- for item in ord', 19)).toEqual({ query: 'ord' });
    expect(liquidTagQueryAt('{% if a == b', 12)).toEqual({ query: 'b' });
  });

  it('ignores the keyword itself and closed tags', () => {
    expect(liquidTagQueryAt('{% fo', 5)).toBeNull();
    expect(liquidTagQueryAt('{% if a %} b', 12)).toBeNull();
    expect(liquidTagQueryAt('plain text', 10)).toBeNull();
  });
});

describe('expressionCompletionSource', () => {
  it('lists top-level variables after {{, without dimmed ones', () => {
    expect(complete('Hi {{ |').labels).toEqual(['title', 'total', 'customer', 'orders']);
  });

  it('prefix matches first, then ones containing it, and starts from the typed part', () => {
    const { result, labels } = complete('Hi {{ to|');
    expect(labels).toEqual(['total', 'customer']);
    expect(result!.from).toBe('Hi {{ '.length);
    expect(result!.filter).toBe(false);
  });

  it('lists the fields inside an object once its dot is typed', () => {
    expect(complete('{{ customer.|').labels).toEqual(['customer.name', 'customer.address']);
  });

  it('offers nothing outside a binding or tag', () => {
    expect(complete('Hello cus|').result).toBeNull();
    expect(complete('{{ title }} cus|').result).toBeNull();
  });

  it('waits for a letter inside a tag unless asked', () => {
    expect(complete('{% if |').result).toBeNull();
    expect(complete('{% if |', true).labels).toEqual(['title', 'total', 'customer', 'orders']);
    expect(complete('{% for o in or|').labels).toEqual(['orders']);
  });

  it('inserts a closed binding, caret after the path (like text fields)', () => {
    expect(pick('Hi {{ ti|', 'title')).toBe('Hi {{ title| }}');
    expect(pick('Hi {{ti|', 'title')).toBe('Hi {{ title| }}');
  });

  it('reuses a closer already there', () => {
    expect(pick('Hi {{ ti| }} there', 'title')).toBe('Hi {{ title| }} there');
  });

  it('opens a container instead of inserting it', () => {
    expect(pick('{{ customer.ad|', 'customer.address')).toBe('{{ customer.address.|');
  });

  it('inserts the bare path inside a tag', () => {
    expect(pick('{% for o in or| %}', 'orders')).toBe('{% for o in orders| %}');
  });

  it('works on a later line', () => {
    expect(pick('<p>\n  {{ cu|\n</p>', 'customer')).toBe('<p>\n  {{ customer| }}\n</p>');
  });
});
