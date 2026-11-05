import { describe, expect, it } from 'vitest';
import { unknownNewerMigration } from '@database/newerDatabase';

const local = ['00000000000000_initial_schema.js', '20261201000000_later.js'];

describe('unknownNewerMigration', () => {
  it('accepts a new database and one this Core is ahead of', () => {
    expect(unknownNewerMigration([], local)).toBeNull();
    expect(unknownNewerMigration(['00000000000000_initial_schema.js'], local)).toBeNull();
  });

  it('accepts a database that matches', () => {
    expect(unknownNewerMigration(local, local)).toBeNull();
  });

  it('names the migration from a newer Core', () => {
    const newer = '20270101000000_new_table.js';
    expect(unknownNewerMigration([...local, newer], local)).toBe(newer);
  });
});
