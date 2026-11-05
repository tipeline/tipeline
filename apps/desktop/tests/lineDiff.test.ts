import { describe, expect, it } from 'vitest';
import { lineDiff, countChanges } from '@/utils/lineDiff';

const lines = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

describe('lineDiff', () => {
  it('marks added, removed and unchanged lines with their line numbers', () => {
    const diff = lineDiff('a\nb\nc', 'a\nx\nc', 3);
    expect(diff).toEqual([
      { kind: 'same', text: 'a', oldNo: 1, newNo: 1 },
      { kind: 'removed', text: 'b', oldNo: 2, newNo: null },
      { kind: 'added', text: 'x', oldNo: null, newNo: 2 },
      { kind: 'same', text: 'c', oldNo: 3, newNo: 3 },
    ]);
  });

  it('folds long unchanged runs, keeping context around each change', () => {
    const before = lines(30).join('\n');
    const after = lines(30).map((l, i) => (i === 14 ? 'changed' : l)).join('\n');
    const diff = lineDiff(before, after, 2);
    const kinds = diff.map((l) => (l.kind === 'skip' ? `skip${l.count}` : l.kind));
    expect(kinds).toEqual(['skip12', 'same', 'same', 'removed', 'added', 'same', 'same', 'skip13']);
    const skip = diff[0];
    expect(skip.kind === 'skip' && skip.lines[0]).toMatchObject({ text: 'line 1', oldNo: 1 });
  });

  it('finds an inserted block in the middle without marking what follows as changed', () => {
    const before = ['a', 'b', 'c', 'd'].join('\n');
    const after = ['a', 'b', 'new 1', 'new 2', 'c', 'd'].join('\n');
    expect(countChanges(lineDiff(before, after))).toEqual({ added: 2, removed: 0 });
  });

  it('returns the text unchanged when nothing changed', () => {
    const diff = lineDiff('a\nb', 'a\nb');
    expect(diff.every((l) => l.kind === 'same')).toBe(true);
    expect(countChanges(diff)).toEqual({ added: 0, removed: 0 });
  });
});
