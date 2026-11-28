import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let formatDate: typeof import('../src/Printer').formatDate;
let wrapText: typeof import('../src/Printer').wrapText;
const originalTz = process.env.TZ;

beforeAll(async () => {
  process.env.TZ = 'America/Mexico_City'; // UTC-6, no daylight saving
  ({ formatDate, wrapText } = await import('../src/Printer'));
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('formatDate', () => {
  it("shows SQLite's UTC times in this machine's time zone", () => {
    expect(formatDate('2026-11-28 16:08:16')).toBe('2026-11-28 10:08:16');
  });

  it('reads ISO strings and Dates the same way', () => {
    expect(formatDate('2026-11-28T16:08:16.532Z')).toBe('2026-11-28 10:08:16');
    expect(formatDate(new Date('2026-11-28T03:00:00Z'))).toBe('2026-11-27 21:00:00');
  });

  it('leaves empty and unreadable values alone', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('soon')).toBe('soon');
  });
});

describe('wrapText', () => {
  it('breaks between words', () => {
    const text = 'Say what to clear: --workflow <workflow-identifier>, or --all for every cached result.';
    const lines = wrapText(text, 40);
    expect(lines.every((l) => l.length <= 40)).toBe(true);
    expect(lines.join(' ')).toBe(text);
    const words = text.split(' ');
    expect(lines.flatMap((l) => l.split(' '))).toEqual(words);
  });

  it('cuts only a word longer than a line, like a path', () => {
    const path = '/private/tmp/' + 'x'.repeat(50);
    const lines = wrapText(`Folder not found: ${path}`, 30);
    expect(lines[0]).toBe('Folder not found:');
    expect(lines.slice(1).join('')).toBe(path);
    expect(lines.every((l) => l.length <= 30)).toBe(true);
  });

  it('keeps short lines, blank lines and indentation', () => {
    expect(wrapText('a\n\n  b', 10)).toEqual(['a', '', '  b']);
    expect(wrapText('    one two three four', 12)).toEqual(['    one two', '    three', '    four']);
  });
});
