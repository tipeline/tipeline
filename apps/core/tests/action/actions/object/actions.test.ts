import { describe, expect, it } from 'vitest';
import { GroupObject } from '@/action/actions/object/actions';

describe('GroupObject', () => {
  describe('parse', () => {
    it('parses a JSON object string', async () => {
      await expect(GroupObject.parse({ text: '{"a":1,"b":"two"}' })).resolves.toEqual({
        a: 1,
        b: 'two',
      });
    });

    it('throws when the parsed value is an array', async () => {
      await expect(GroupObject.parse({ text: '[1,2,3]' })).rejects.toThrow(
        'Expected an object, but received an array'
      );
    });

    it('throws when the text is not valid JSON', async () => {
      await expect(GroupObject.parse({ text: 'not json' })).rejects.toThrow();
    });

    it('throws when text is missing', async () => {
      await expect(GroupObject.parse({} as any)).rejects.toThrow();
    });
  });

  describe('setProperty', () => {
    it('sets a nested property using a dot path', () => {
      const result = GroupObject.setProperty({
        object: { connection: { retries: 1 } },
        property: 'connection.retries',
        value: 5,
      } as any);
      expect(result).toEqual({ connection: { retries: 5 } });
    });

    it('creates intermediate objects for a new nested path', () => {
      const result = GroupObject.setProperty({
        object: {},
        property: 'a.b.c',
        value: 'deep',
      } as any);
      expect(result).toEqual({ a: { b: { c: 'deep' } } });
    });

    it('throws when object is missing', () => {
      expect(() =>
        GroupObject.setProperty({ property: 'a', value: 1 } as any)
      ).toThrow();
    });
  });

  describe('hasProperty', () => {
    it('returns true for an existing nested property', () => {
      expect(
        GroupObject.hasProperty({ object: { auth: { token: 'x' } }, property: 'auth.token' })
      ).toBe(true);
    });

    it('returns false for a missing property', () => {
      expect(GroupObject.hasProperty({ object: { auth: {} }, property: 'auth.token' })).toBe(
        false
      );
    });

    it('throws when object is missing', () => {
      expect(() => GroupObject.hasProperty({ property: 'a' } as any)).toThrow();
    });
  });

  describe('getProperty', () => {
    it('returns the value at a nested path', () => {
      expect(
        GroupObject.getProperty({
          object: { settings: { language: 'fr' } },
          property: 'settings.language',
        })
      ).toBe('fr');
    });

    it('returns the default value when the path is not found', () => {
      expect(
        GroupObject.getProperty({
          object: { settings: {} },
          property: 'settings.language',
          defaultValue: 'en',
        })
      ).toBe('en');
    });

    it('returns null by default when the path is not found and no default is given', () => {
      expect(GroupObject.getProperty({ object: {}, property: 'missing' } as any)).toBeNull();
    });

    it('throws when object is missing', () => {
      expect(() => GroupObject.getProperty({ property: 'a' } as any)).toThrow();
    });
  });

  describe('keys', () => {
    it('returns all top-level keys', () => {
      expect(GroupObject.keys({ object: { a: 1, b: 2 } })).toEqual(['a', 'b']);
    });

    it('returns an empty array for an empty object', () => {
      expect(GroupObject.keys({ object: {} })).toEqual([]);
    });

    it('throws when object is missing', () => {
      expect(() => GroupObject.keys({} as any)).toThrow();
    });
  });

  describe('values', () => {
    it('returns all top-level values', () => {
      expect(GroupObject.values({ object: { a: 1, b: 2 } })).toEqual([1, 2]);
    });

    it('returns an empty array for an empty object', () => {
      expect(GroupObject.values({ object: {} })).toEqual([]);
    });

    it('throws when object is missing', () => {
      expect(() => GroupObject.values({} as any)).toThrow();
    });
  });

  describe('entries', () => {
    it('returns key-value pairs as tuples', () => {
      expect(GroupObject.entries({ object: { a: 1, b: 2 } })).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('returns an empty array for an empty object', () => {
      expect(GroupObject.entries({ object: {} })).toEqual([]);
    });

    it('throws when object is missing', () => {
      expect(() => GroupObject.entries({} as any)).toThrow();
    });
  });

  describe('merge', () => {
    it('deep-merges multiple objects with later ones overriding earlier ones', () => {
      expect(
        GroupObject.merge({
          objects: [
            { a: 1, nested: { x: 1, y: 1 } },
            { b: 2, nested: { y: 2 } },
          ],
        })
      ).toEqual({ a: 1, b: 2, nested: { x: 1, y: 2 } });
    });

    it('returns an empty object when the list is empty', () => {
      expect(GroupObject.merge({ objects: [] })).toEqual({});
    });

    it('throws when objects is missing', () => {
      expect(() => GroupObject.merge({} as any)).toThrow();
    });
  });

  describe('pick', () => {
    it('returns only the specified properties', () => {
      expect(
        GroupObject.pick({
          object: { name: 'Ada', email: 'ada@example.com', age: 30 },
          properties: ['name', 'email'],
        })
      ).toEqual({ name: 'Ada', email: 'ada@example.com' });
    });

    it('ignores properties that do not exist on the object', () => {
      expect(GroupObject.pick({ object: { a: 1 }, properties: ['a', 'missing'] })).toEqual({
        a: 1,
      });
    });

    it('throws when properties is missing', () => {
      expect(() => GroupObject.pick({ object: { a: 1 } } as any)).toThrow();
    });
  });

  describe('omit', () => {
    it('returns a copy without the specified properties', () => {
      expect(
        GroupObject.omit({
          object: { _id: '1', _createdAt: 'now', status: 'completed' },
          properties: ['_id', '_createdAt'],
        })
      ).toEqual({ status: 'completed' });
    });

    it('returns the full object when no properties match', () => {
      expect(GroupObject.omit({ object: { a: 1 }, properties: ['missing'] })).toEqual({ a: 1 });
    });

    it('throws when properties is missing', () => {
      expect(() => GroupObject.omit({ object: { a: 1 } } as any)).toThrow();
    });
  });

  describe('deleteProperty', () => {
    it('removes a nested property', () => {
      const result = GroupObject.deleteProperty({
        object: { auth: { token: 'x', scope: 'y' } },
        property: 'auth.token',
      } as any);
      expect(result).toEqual({ auth: { scope: 'y' } });
    });

    it('is a no-op when the property does not exist', () => {
      const result = GroupObject.deleteProperty({ object: { a: 1 }, property: 'b.c' } as any);
      expect(result).toEqual({ a: 1 });
    });

    it('throws when object is missing', () => {
      expect(() => GroupObject.deleteProperty({ property: 'a' } as any)).toThrow();
    });
  });

  describe('clone', () => {
    it('produces a deep copy that does not share references', () => {
      const original = { a: { b: 1 } };
      const cloned = GroupObject.clone({ object: original });
      cloned.a.b = 2;
      expect(original.a.b).toBe(1);
      expect(cloned).toEqual({ a: { b: 2 } });
    });

    it('throws when object is missing', () => {
      expect(() => GroupObject.clone({} as any)).toThrow();
    });
  });
});
