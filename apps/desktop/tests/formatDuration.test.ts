import { describe, expect, it } from 'vitest';
import { formatDuration } from '@/utils/formatDuration';

describe('formatDuration', () => {
  it('shows seconds, then minutes and seconds, then hours and minutes', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(41_900)).toBe('41s');
    expect(formatDuration(125_000)).toBe('2m 05s');
    expect(formatDuration(3_720_000)).toBe('1h 02m');
  });

  it('never goes negative (clock skew between start and now)', () => {
    expect(formatDuration(-500)).toBe('0s');
  });
});
