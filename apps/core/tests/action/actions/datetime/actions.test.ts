import { describe, expect, it } from 'vitest';
import { GroupDateTime } from '@/action/actions/datetime/actions';

describe('GroupDateTime', () => {
  describe('getCurrentDateTime', () => {
    it('returns the current local date/time as an ISO-like string with offset', () => {
      const result = GroupDateTime.getCurrentDateTime();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}([+-]\d{2}:\d{2}|Z)$/);
    });
  });

  describe('nowISO', () => {
    it('returns the current UTC date/time in ISO format', () => {
      const result = GroupDateTime.nowISO();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('toTimestamp', () => {
    it('converts a date/time string to a Unix timestamp in milliseconds', () => {
      expect(GroupDateTime.toTimestamp({ dateTime: '2024-01-15T00:00:00.000Z' })).toBe(
        new Date('2024-01-15T00:00:00.000Z').getTime()
      );
    });

    it('returns NaN for an unparseable date string', () => {
      expect(Number.isNaN(GroupDateTime.toTimestamp({ dateTime: 'not-a-date' }))).toBe(true);
    });

    it('throws when dateTime is missing', () => {
      expect(() => GroupDateTime.toTimestamp({} as any)).toThrow();
    });
  });

  describe('fromTimestamp', () => {
    it('converts a Unix timestamp to an ISO date/time string', () => {
      const timestamp = 1672574400000;
      const result = GroupDateTime.fromTimestamp({ timestamp });
      expect(result).toBe(new Date(timestamp).toISOString());
    });

    it('coerces a numeric string timestamp', () => {
      const result = GroupDateTime.fromTimestamp({ timestamp: '1672574400000' as any });
      expect(result).toBe(new Date(1672574400000).toISOString());
    });

    it('throws when timestamp is missing', () => {
      expect(() => GroupDateTime.fromTimestamp({} as any)).toThrow();
    });
  });

  describe('format', () => {
    it('formats a date/time using a date-fns pattern', () => {
      expect(
        GroupDateTime.format({ dateTime: '2024-01-15T12:00:00', format: 'yyyy-MM-dd' })
      ).toBe('2024-01-15');
    });

    it('supports time-of-day patterns', () => {
      expect(
        GroupDateTime.format({ dateTime: '2024-01-15T09:05:00', format: 'HH:mm' })
      ).toBe('09:05');
    });

    it('throws when format is missing', () => {
      expect(() => GroupDateTime.format({ dateTime: '2024-01-15' } as any)).toThrow();
    });
  });

  describe('parseDate', () => {
    it('parses a date string using an explicit format', () => {
      const result = GroupDateTime.parseDate({ dateString: '15/01/2024', format: 'dd/MM/yyyy' });
      const parsed = new Date(result);
      expect(parsed.getFullYear()).toBe(2024);
      expect(parsed.getMonth()).toBe(0);
      expect(parsed.getDate()).toBe(15);
    });

    it('throws when the string does not match the format', () => {
      expect(() =>
        GroupDateTime.parseDate({ dateString: 'not-a-date', format: 'dd/MM/yyyy' })
      ).toThrow();
    });

    it('throws when format is missing', () => {
      expect(() => GroupDateTime.parseDate({ dateString: '15/01/2024' } as any)).toThrow();
    });
  });

  describe('add', () => {
    it('adds a duration to a date/time', () => {
      const result = GroupDateTime.add({
        dateTime: '2024-01-01T00:00:00',
        duration: { days: 3, hours: 2 },
      });
      const parsed = new Date(result);
      expect(parsed.getDate()).toBe(4);
      expect(parsed.getHours()).toBe(2);
    });

    it('supports negative duration values (equivalent to subtracting)', () => {
      const result = GroupDateTime.add({
        dateTime: '2024-01-10T00:00:00',
        duration: { days: -5 },
      });
      expect(new Date(result).getDate()).toBe(5);
    });

    it('throws when duration is missing', () => {
      expect(() => GroupDateTime.add({ dateTime: '2024-01-01' } as any)).toThrow();
    });
  });

  describe('subtract', () => {
    it('subtracts a duration from a date/time', () => {
      const result = GroupDateTime.subtract({
        dateTime: '2024-01-10T00:00:00',
        duration: { days: 7 },
      });
      expect(new Date(result).getDate()).toBe(3);
    });

    it('throws when duration is missing', () => {
      expect(() => GroupDateTime.subtract({ dateTime: '2024-01-01' } as any)).toThrow();
    });
  });

  describe('startOf', () => {
    it('returns the start of the day', () => {
      const result = GroupDateTime.startOf({ dateTime: '2024-01-15T15:30:00', unit: 'day' });
      const parsed = new Date(result);
      expect(parsed.getHours()).toBe(0);
      expect(parsed.getMinutes()).toBe(0);
      expect(parsed.getSeconds()).toBe(0);
      expect(parsed.getDate()).toBe(15);
    });

    it('returns the start of the year', () => {
      const result = GroupDateTime.startOf({ dateTime: '2024-06-15T15:30:00', unit: 'year' });
      const parsed = new Date(result);
      expect(parsed.getMonth()).toBe(0);
      expect(parsed.getDate()).toBe(1);
    });

    it('throws for an invalid unit', () => {
      expect(() =>
        GroupDateTime.startOf({ dateTime: '2024-01-15', unit: 'century' as any })
      ).toThrow();
    });
  });

  describe('endOf', () => {
    it('returns the end of the day', () => {
      const result = GroupDateTime.endOf({ dateTime: '2024-01-15T08:00:00', unit: 'day' });
      const parsed = new Date(result);
      expect(parsed.getHours()).toBe(23);
      expect(parsed.getMinutes()).toBe(59);
      expect(parsed.getSeconds()).toBe(59);
    });

    it('returns the end of the month', () => {
      const result = GroupDateTime.endOf({ dateTime: '2024-02-10T00:00:00', unit: 'month' });
      const parsed = new Date(result);
      expect(parsed.getMonth()).toBe(1);
      expect(parsed.getDate()).toBe(29); // 2024 is a leap year
    });

    it('throws for an invalid unit', () => {
      expect(() =>
        GroupDateTime.endOf({ dateTime: '2024-01-15', unit: 'century' as any })
      ).toThrow();
    });
  });

  describe('difference', () => {
    it('computes the difference in seconds', () => {
      expect(
        GroupDateTime.difference({
          date1: '2024-01-01T00:01:00Z',
          date2: '2024-01-01T00:00:00Z',
          unit: 'seconds',
        })
      ).toBe(60);
    });

    it('computes the difference in days', () => {
      expect(
        GroupDateTime.difference({
          date1: '2024-01-10T00:00:00Z',
          date2: '2024-01-01T00:00:00Z',
          unit: 'days',
        })
      ).toBe(9);
    });

    it('returns a negative value when date1 precedes date2', () => {
      expect(
        GroupDateTime.difference({
          date1: '2024-01-01T00:00:00Z',
          date2: '2024-01-02T00:00:00Z',
          unit: 'days',
        })
      ).toBe(-1);
    });

    it('throws for an invalid unit', () => {
      expect(() =>
        GroupDateTime.difference({
          date1: '2024-01-01',
          date2: '2024-01-02',
          unit: 'fortnights' as any,
        })
      ).toThrow();
    });
  });

  describe('isAfter', () => {
    it('returns true when dateTime is after the comparison date', () => {
      expect(
        GroupDateTime.isAfter({
          dateTime: '2024-01-02T00:00:00Z',
          dateTimeToCompare: '2024-01-01T00:00:00Z',
        })
      ).toBe(true);
    });

    it('returns false when dateTime is before the comparison date', () => {
      expect(
        GroupDateTime.isAfter({
          dateTime: '2024-01-01T00:00:00Z',
          dateTimeToCompare: '2024-01-02T00:00:00Z',
        })
      ).toBe(false);
    });

    it('throws when dateTimeToCompare is missing', () => {
      expect(() => GroupDateTime.isAfter({ dateTime: '2024-01-01' } as any)).toThrow();
    });
  });

  describe('isBefore', () => {
    it('returns true when dateTime is before the comparison date', () => {
      expect(
        GroupDateTime.isBefore({
          dateTime: '2024-01-01T00:00:00Z',
          dateTimeToCompare: '2024-01-02T00:00:00Z',
        })
      ).toBe(true);
    });

    it('returns false when dateTime is after the comparison date', () => {
      expect(
        GroupDateTime.isBefore({
          dateTime: '2024-01-02T00:00:00Z',
          dateTimeToCompare: '2024-01-01T00:00:00Z',
        })
      ).toBe(false);
    });

    it('throws when dateTimeToCompare is missing', () => {
      expect(() => GroupDateTime.isBefore({ dateTime: '2024-01-01' } as any)).toThrow();
    });
  });

  describe('isEqual', () => {
    it('returns true for the same instant', () => {
      expect(
        GroupDateTime.isEqual({
          dateTime: '2024-01-01T00:00:00Z',
          dateTimeToCompare: '2024-01-01T00:00:00Z',
        })
      ).toBe(true);
    });

    it('returns false for different instants', () => {
      expect(
        GroupDateTime.isEqual({
          dateTime: '2024-01-01T00:00:00Z',
          dateTimeToCompare: '2024-01-01T00:00:01Z',
        })
      ).toBe(false);
    });

    it('throws when dateTimeToCompare is missing', () => {
      expect(() => GroupDateTime.isEqual({ dateTime: '2024-01-01' } as any)).toThrow();
    });
  });

  describe('isValid', () => {
    it('returns true for a valid date/time string', () => {
      expect(GroupDateTime.isValid({ dateTime: '2024-01-15T10:30:00' })).toBe(true);
    });

    it('returns false for an unparseable date string', () => {
      expect(GroupDateTime.isValid({ dateTime: 'not-a-date' })).toBe(false);
    });

    it('throws when dateTime is missing', () => {
      expect(() => GroupDateTime.isValid({} as any)).toThrow();
    });
  });
});
