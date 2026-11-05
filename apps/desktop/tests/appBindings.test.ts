import { describe, expect, it, vi } from 'vitest';
import { effect, reactive } from 'vue';
import { isBinding, resolveBinding } from '@/utils/appBindings';

const context = {
  state: { status: 'pending', count: 3 },
  runnables: {
    invoices: {
      data: [{ id: 7, total: 120.5 }],
      outputs: { rows: [{ id: 1 }] },
    },
  },
  invoiceTable: { selectedRow: { id: 42, customer: { name: 'Acme' } } },
  page: { id: 'queue', params: { from: 'home' } },
};

describe('resolveBinding', () => {
  it('raw {= path =} keeps the value type, including nested and indexed paths', () => {
    expect(resolveBinding('{= runnables.invoices.data =}', context)).toBe(
      context.runnables.invoices.data
    );
    expect(
      resolveBinding('{= runnables.invoices.data[0].total =}', context)
    ).toBe(120.5);
    expect(
      resolveBinding('{=invoiceTable.selectedRow.customer.name=}', context)
    ).toBe('Acme');
    expect(resolveBinding('{= state.count =}', context)).toBe(3);
  });

  it('raw references to missing values resolve to undefined', () => {
    expect(resolveBinding('{= nothing.here =}', context)).toBeUndefined();
    expect(
      resolveBinding('{= state.missing.deeper =}', context)
    ).toBeUndefined();
  });

  it('{{ }} renders with LiquidJS, filters included, always to a string', () => {
    expect(
      resolveBinding('Invoice {{ invoiceTable.selectedRow.id }}', context)
    ).toBe('Invoice 42');
    expect(resolveBinding('{{ state.status | upcase }}', context)).toBe(
      'PENDING'
    );
    expect(resolveBinding('{{ state.count }}', context)).toBe('3');
    expect(
      resolveBinding('{% if state.count > 2 %}many{% endif %}', context)
    ).toBe('many');
  });

  it('resolves objects and arrays recursively and leaves literals alone', () => {
    expect(
      resolveBinding(
        {
          id: '{= invoiceTable.selectedRow.id =}',
          tags: ['{{ page.params.from }}', 5],
          flag: true,
        },
        context
      )
    ).toEqual({ id: 42, tags: ['home', 5], flag: true });
    expect(resolveBinding('plain text', context)).toBe('plain text');
    expect(resolveBinding(12, context)).toBe(12);
    expect(resolveBinding(null, context)).toBeNull();
  });

  it('a broken template resolves to an empty string instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Unknown filters are ignored (LiquidJS default, same as workflows); a parse error is not.
    expect(resolveBinding('{{ state.status | nope_filter }}', context)).toBe(
      'pending'
    );
    expect(resolveBinding('{% if state.count %}unclosed', context)).toBe('');
    expect(resolveBinding("{% include 'x' %}", context)).toBe('');
    warn.mockRestore();
  });

  it('reads through Vue reactive objects', () => {
    const state = reactive({ status: 'open' });
    expect(resolveBinding('{{ state.status }}', { state })).toBe('open');
    state.status = 'closed';
    expect(resolveBinding('{= state.status =}', { state })).toBe('closed');
  });
});

describe('reactivity', () => {
  // Regression: LiquidJS checks hasOwnProperty before reading, which Vue does not
  // track — a template rendered before a value existed never updated once it did
  // (table row selection never reached text or a button's disabled rule).
  it('re-renders a template when a value it mentions appears later', () => {
    const components = reactive<Record<string, any>>({ recordsTable: {} });
    const outputs: string[] = [];
    effect(() => {
      outputs.push(
        String(
          resolveBinding(
            "{% if recordsTable.selectedRow.status == 'pending' %}enabled{% else %}disabled{% endif %} {{ recordsTable.selectedRow.name | default: 'none' }}",
            { ...components }
          )
        )
      );
    });

    components.recordsTable.selectedRow = { name: 'Globex', status: 'pending' };

    expect(outputs).toEqual(['disabled none', 'enabled Globex']);
  });

  it('re-renders when a new state key is set', () => {
    const state = reactive<Record<string, unknown>>({});
    const outputs: string[] = [];
    effect(() =>
      outputs.push(String(resolveBinding('{{ state.lastError }}', { state })))
    );

    state.lastError = 'boom';

    expect(outputs).toEqual(['', 'boom']);
  });
});

describe('isBinding', () => {
  it('detects both syntaxes', () => {
    expect(isBinding('{= a.b =}')).toBe(true);
    expect(isBinding('x {{ a }}')).toBe(true);
    expect(isBinding('{% if a %}y{% endif %}')).toBe(true);
    expect(isBinding('no binding')).toBe(false);
    expect(isBinding(5)).toBe(false);
  });
});
