import { describe, expect, it } from 'vitest';
import { jsonError } from '@/utils/jsonError';

describe('jsonError', () => {
  it('is null for valid JSON and blank text', () => {
    expect(jsonError('')).toBeNull();
    expect(jsonError('  ')).toBeNull();
    expect(jsonError('[{"key": "name", "label": "{{ state.x }}"}]')).toBeNull();
  });

  it('places the error and keeps the message short', () => {
    const text = '[\n  {"key": "name",}\n]';
    const e = jsonError(text)!;
    expect(e.line).toBe(2);
    expect(text[e.at]).toBe('}');
    expect(e.message).not.toMatch(/is not valid JSON|position/);
    expect(e.message.length).toBeGreaterThan(0);
  });

  it('drops V8’s echo of a long input', () => {
    const long = `[${'{"key": "column", "label": "Column"},'.repeat(10)}]`;
    const e = jsonError(long)!;
    expect(e.message).not.toMatch(/column|not valid JSON|\.\.\./i);
  });

  it('points at the end when the text stops early', () => {
    const e = jsonError('{"a": [1, 2')!;
    expect(e.at).toBe('{"a": [1, 2'.length);
    expect(e.line).toBe(1);
  });
});
