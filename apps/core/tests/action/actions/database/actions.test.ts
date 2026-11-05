import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  knexFactoryMock: vi.fn(),
}));

vi.mock('knex', () => ({
  default: mocks.knexFactoryMock,
}));

import { GroupDatabase } from '@/action/actions/database/actions';

const { knexFactoryMock } = mocks;

function createMockConnection(overrides: Partial<{ raw: any; destroy: any }> = {}) {
  // dbConnectionSchema (isKnexInstance) requires: typeof value === 'function',
  // value.raw is a function, and value.client is a non-null object.
  const fn: any = vi.fn();
  fn.client = {};
  fn.raw = overrides.raw ?? vi.fn();
  fn.destroy = overrides.destroy ?? vi.fn();
  return fn;
}

describe('GroupDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('opens a knex connection with the given configuration', async () => {
      const mockConnection = createMockConnection();
      knexFactoryMock.mockReturnValue(mockConnection);

      const configuration = {
        client: 'better-sqlite3',
        connection: { filename: '/data/tipeline.db' },
        useNullAsDefault: true,
      };

      const result = await GroupDatabase.connect({ configuration } as any);

      expect(knexFactoryMock).toHaveBeenCalledWith(configuration);
      expect(result).toBe(mockConnection);
    });

    it('throws when configuration is not an object', async () => {
      await expect(
        GroupDatabase.connect({ configuration: 'not-an-object' } as any)
      ).rejects.toThrow();
    });

    it('throws when configuration is missing', async () => {
      await expect(GroupDatabase.connect({} as any)).rejects.toThrow();
    });
  });

  describe('query', () => {
    it('returns rows as plain-object copies for a better-sqlite3-style array result', async () => {
      const rows = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ];
      const raw = vi.fn().mockResolvedValue(rows);
      const connection = createMockConnection({ raw });

      const result = await GroupDatabase.query({ connection, sql: 'SELECT * FROM t' } as any);

      expect(raw).toHaveBeenCalledWith('SELECT * FROM t', []);
      expect(result).toEqual(rows);
      expect(result[0]).not.toBe(rows[0]); // spread copy, not the same reference
    });

    it('unwraps a pg-style { rows } result', async () => {
      const rows = [{ id: 1 }];
      const raw = vi.fn().mockResolvedValue({ rows, command: 'SELECT', rowCount: 1 });
      const connection = createMockConnection({ raw });

      const result = await GroupDatabase.query({ connection, sql: 'SELECT 1' } as any);

      expect(result).toEqual(rows);
    });

    it('unwraps a mysql2-style [rows, fields] tuple', async () => {
      // mysql2 resolves connection.raw() to a [rows, fields] tuple where rows is
      // itself an array. Detected by checking Array.isArray(result[0]).
      const rows = [{ id: 1 }];
      const fields = [{ name: 'id' }];
      const raw = vi.fn().mockResolvedValue([rows, fields]);
      const connection = createMockConnection({ raw });

      const result = await GroupDatabase.query({ connection, sql: 'SELECT 1' } as any);

      expect(result).toEqual(rows);
    });

    it('returns an empty array when the driver returns a falsy result', async () => {
      const raw = vi.fn().mockResolvedValue(null);
      const connection = createMockConnection({ raw });

      const result = await GroupDatabase.query({ connection, sql: 'SELECT 1' } as any);

      expect(result).toEqual([]);
    });

    it('propagates a rejection from the driver', async () => {
      const raw = vi.fn().mockRejectedValue(new Error('syntax error'));
      const connection = createMockConnection({ raw });

      await expect(
        GroupDatabase.query({ connection, sql: 'SELECT bad sql' } as any)
      ).rejects.toThrow('syntax error');
    });

    it('throws when connection is not a valid Knex instance', async () => {
      await expect(
        GroupDatabase.query({ connection: {} as any, sql: 'SELECT 1' } as any)
      ).rejects.toThrow();
    });

    it('throws when sql is empty', async () => {
      const connection = createMockConnection();

      await expect(GroupDatabase.query({ connection, sql: '' } as any)).rejects.toThrow();
    });
  });

  describe('close', () => {
    it('destroys the connection', async () => {
      const destroy = vi.fn().mockResolvedValue(undefined);
      const connection = createMockConnection({ destroy });

      await GroupDatabase.close({ connection } as any);

      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('propagates a rejection from destroy', async () => {
      const destroy = vi.fn().mockRejectedValue(new Error('destroy failed'));
      const connection = createMockConnection({ destroy });

      await expect(GroupDatabase.close({ connection } as any)).rejects.toThrow('destroy failed');
    });

    it('throws when connection is not a valid Knex instance', async () => {
      await expect(GroupDatabase.close({ connection: {} as any } as any)).rejects.toThrow();
    });
  });
});
