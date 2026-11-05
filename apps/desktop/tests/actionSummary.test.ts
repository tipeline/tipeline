import { describe, expect, it } from 'vitest';
import { summarizeAction, valueParts, type SummaryPart } from '@/utils/actionSummary';

const line = (parts: SummaryPart[]) => parts.map((p) => (p.kind === 'var' ? `[${p.text}]` : p.text)).join('');

describe('valueParts', () => {
  it('marks template references as variables', () => {
    expect(valueParts('to {{ customer.email }} now')).toEqual([
      { text: 'to ', kind: 'text' },
      { text: 'customer.email', kind: 'var' },
      { text: ' now', kind: 'text' },
    ]);
    expect(line(valueParts('{= rows[0].id =}'))).toBe('[rows[0].id]');
  });

  it('keeps the first line only and cuts long values', () => {
    expect(line(valueParts('first\nsecond'))).toBe('first');
    expect(line(valueParts('x'.repeat(200))).length).toBe(121);
  });

  it('has nothing for empty values and objects', () => {
    expect(valueParts('  ')).toEqual([]);
    expect(valueParts({ a: 1 })).toEqual([]);
    expect(valueParts(undefined)).toEqual([]);
  });
});

describe('summarizeAction', () => {
  it('names the sub-workflow and says when it runs in the background', () => {
    const names = new Map([['abc', 'Create invoice PDF']]);
    const action = { group: 'subtask', name: 'exec', params: { identifier: 'abc', async: true } };
    const parts = summarizeAction(action, { workflowName: (id) => names.get(id) });
    expect(parts[0]).toEqual({ text: 'Create invoice PDF', kind: 'name' });
    expect(line(parts)).toBe('Create invoice PDF · in background');
  });

  it('falls back to the identifier or the file name of a sub-workflow', () => {
    expect(line(summarizeAction({ group: 'subtask', name: 'exec', params: { identifier: 'gone' } }))).toBe('gone');
    expect(
      line(summarizeAction({ group: 'subtask', name: 'exec', params: { path: '/a/b/c/child.yml' } }))
    ).toBe('…/c/child.yml');
  });

  it('reads conditions and loops in words', () => {
    const ifStep = {
      group: 'flow',
      name: 'ifConditional',
      params: { firstOperand: '{= status =}', compareAs: 'string', operator: 'eq', secondOperand: 'active' },
    };
    expect(line(summarizeAction(ifStep))).toBe('[status] equals active');
    const loop = { group: 'flow', name: 'forEachLoop', params: { iterable: '{= customers =}', currentItem: 'customer' } };
    expect(line(summarizeAction(loop))).toBe('each [customer] in [customers]');
  });

  it('shows method and URL for requests', () => {
    const api = { group: 'api', name: 'request', params: { method: 'post', url: 'https://x.test/{{ id }}' } };
    expect(line(summarizeAction(api))).toBe('POST https://x.test/[id]');
    const http = { group: 'http', name: 'request', params: { url: 'https://x.test' } };
    expect(line(summarizeAction(http))).toBe('GET https://x.test');
  });

  it('shows who an email goes to and its subject', () => {
    const step = {
      group: 'email',
      name: 'send',
      params: { host: 'smtp', pass: 'secret', to: '{{ customer.email }}', subject: 'Invoice', attachments: [{}] },
    };
    expect(line(summarizeAction(step))).toBe('[customer.email] · Invoice · 1 file');
  });

  it('counts script lines and shortens literal file paths', () => {
    expect(line(summarizeAction({ group: 'script', name: 'runScript', params: { code: 'a\nb\nc' } }))).toBe(
      '3 lines'
    );
    const copy = { group: 'file', name: 'copy', params: { src: '/Users/me/In/a.csv', dest: '{{ outDir }}/a.csv' } };
    expect(line(summarizeAction(copy))).toBe('…/In/a.csv → [outDir]/a.csv');
  });

  it('uses the first filled fields for other actions, skipping browsers, secrets and switches', () => {
    const click = { group: 'browser', name: 'clickElement', params: { browser: '{= browser =}', selector: '#save' } };
    expect(line(summarizeAction(click))).toBe('#save');
    const query = { group: 'database', name: 'query', params: { connection: '{= db =}', sql: 'SELECT 1' } };
    expect(line(summarizeAction(query))).toBe('SELECT 1');
    const files = { group: 'folder', name: 'getFiles', params: { src: '~/In', fullPaths: true } };
    expect(line(summarizeAction(files))).toBe('~/In');
  });

  it('uses the words it is given', () => {
    const loop = { group: 'flow', name: 'forEachLoop', params: { iterable: '{= xs =}', currentItem: 'x' } };
    const words = { each: 'cada', in: 'en' } as Record<string, string>;
    expect(line(summarizeAction(loop, { word: (k) => words[k] ?? k }))).toBe('cada [x] en [xs]');
  });

  it('has an empty line for a step not set up yet', () => {
    expect(summarizeAction({ group: 'api', name: 'request', params: {} })).toEqual([]);
  });
});
