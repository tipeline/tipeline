import { describe, expect, it } from 'vitest';
import { assertNoLocalFiles, relativeSubtaskPaths } from '@utils/localFileReferences';

const sub = (path: string) => ({ group: 'subtask', name: 'exec', params: { path } });

describe('workflows sent as contents', () => {
  it('finds relative sub-workflows wherever they are nested', () => {
    expect(
      relativeSubtaskPaths([
        sub('./a.yml'),
        { group: 'flow', name: 'forEach', params: { actions: [sub('../b.yml')] } },
        { group: 'flow', name: 'if', params: { statements: [{ actions: [sub('./c.yml')] }] } },
      ])
    ).toEqual(['./a.yml', '../b.yml', './c.yml']);
  });

  it('leaves everything else alone', () => {
    expect(
      relativeSubtaskPaths([
        sub('/srv/absolute.yml'),
        { group: 'subtask', name: 'exec', params: { identifier: 'abc' } },
        { group: 'file', name: 'read', params: { path: './data.txt' } },
      ])
    ).toEqual([]);
    expect(relativeSubtaskPaths(undefined)).toEqual([]);
  });

  it('refuses a workflow that needs files beside it, naming them', () => {
    expect(() => assertNoLocalFiles({ pipeline: { actions: [sub('./a.yml')] } })).toThrow('./a.yml');
    expect(() => assertNoLocalFiles({ pipeline: { actions: [] } })).not.toThrow();
  });
});
