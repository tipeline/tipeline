import { describe, expect, it } from 'vitest';
import { JSON_PAGE, childPath, containerPaths, jsonRows, parseJsonish } from '@/utils/jsonTree';

const sample = { name: 'Acme', tags: ['a', 'b'], owner: { id: 1, 'first name': 'Ada', active: true, note: null } };
const brief = (rows: ReturnType<typeof jsonRows>) =>
  rows.map((r) =>
    r.closing ? `${'  '.repeat(r.depth)}${r.kind === 'array' ? ']' : '}'}` : r.more ? `${'  '.repeat(r.depth)}…${r.more}` : `${'  '.repeat(r.depth)}${r.path || '(root)'}${r.size !== undefined ? (r.open ? ' open' : ` (${r.size})`) : ''}`
  );

describe('jsonTree', () => {
  it('paths: dots for names, brackets for indexes and odd keys', () => {
    expect(childPath('', 'owner')).toBe('owner');
    expect(childPath('owner', 'id')).toBe('owner.id');
    expect(childPath('tags', 0)).toBe('tags[0]');
    expect(childPath('owner', 'first name')).toBe('owner["first name"]');
  });

  it('opens down to a depth; closed nodes show their size', () => {
    const rows = jsonRows(sample, containerPaths(sample, 1));
    expect(brief(rows)).toEqual(['(root) open', '  name', '  tags (2)', '  owner (4)', '}']);
    expect(rows.map((r) => r.comma)).toEqual([false, true, true, false, false]);
  });

  it('everything open, with closing rows', () => {
    expect(brief(jsonRows(sample, containerPaths(sample)))).toEqual([
      '(root) open',
      '  name',
      '  tags open',
      '    tags[0]',
      '    tags[1]',
      '  ]',
      '  owner open',
      '    owner.id',
      '    owner["first name"]',
      '    owner.active',
      '    owner.note',
      '  }',
      '}',
    ]);
    expect(containerPaths(sample, 0).size).toBe(0);
  });

  it('long arrays show a page of children, then "more"', () => {
    const big = Array.from({ length: 250 }, (_, i) => i);
    const open = new Set(['']);
    let rows = jsonRows(big, open);
    expect(rows).toHaveLength(1 + JSON_PAGE + 2);
    expect(rows.at(-2)).toMatchObject({ more: 150 });
    rows = jsonRows(big, open, { '': 300 });
    expect(rows).toHaveLength(1 + 250 + 1);
  });

  it('a string holding JSON is parsed; other strings stay', () => {
    expect(parseJsonish('{"a":[1]}')).toEqual({ a: [1] });
    expect(parseJsonish(' [1,2] ')).toEqual([1, 2]);
    expect(parseJsonish('{oops')).toBe('{oops');
    expect(parseJsonish('hello')).toBe('hello');
    expect(parseJsonish(3)).toBe(3);
  });

  it('a scalar root is one row; empty containers stay closed', () => {
    expect(jsonRows('hi', new Set(['']))).toEqual([{ path: '', depth: 0, key: null, kind: 'string', value: 'hi', comma: false }]);
    expect(brief(jsonRows({}, new Set(['']))).length).toBe(1);
  });
});
