import { describe, expect, it } from 'vitest';
import { appErrorText } from '@/utils/appErrors';

describe('appErrorText', () => {
  it('drops a leading [group.action] tag, on every line', () => {
    expect(appErrorText('[script.runScript] No owner yet')).toBe('No owner yet');
    expect(appErrorText('[file.read] Not found\n[api.request] 404')).toBe('Not found\n404');
  });

  it('leaves other brackets alone', () => {
    for (const text of ['[1, 2] is not a number', 'Value [a.b] is missing', '[Error: Workflow] bad', 'plain'])
      expect(appErrorText(text)).toBe(text);
  });
});
