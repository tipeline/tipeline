import { describe, expect, it } from 'vitest';
import { isSealed, redactSecretValues, seal, unseal } from '@utils/secretBox';

describe('secretBox', () => {
  it('seals so the text is unreadable, and differently each time', () => {
    const a = seal('"hunter2"');
    expect(isSealed(a)).toBe(true);
    expect(a).not.toContain('hunter2');
    expect(a).not.toBe(seal('"hunter2"'));
    expect(unseal(a)).toBe('"hunter2"');
  });

  it('never seals twice, and leaves plain text alone', () => {
    const once = seal('x');
    expect(seal(once)).toBe(once);
    expect(unseal('"plain"')).toBe('"plain"');
    expect(unseal(null)).toBeNull();
  });

  it('reads a damaged value as null rather than failing the run', () => {
    expect(unseal('enc:v1:AAAA')).toBe('null');
  });

  describe('redactSecretValues', () => {
    const source = {
      name: 'wf',
      pipeline: {
        variables: [
          { name: 'key', type: 'string', secret: true, value: 'hunter2' },
          { name: 'pin', type: 'number', secret: true, value: 1234 },
          { name: 'blank', type: 'string', secret: true, value: '' },
          { name: 'global', type: 'string', secret: true, valueFromGlobal: 'g' },
          { name: 'open', type: 'string', value: 'hello' },
        ],
        actions: [],
      },
    };

    it('blanks written-in secrets, by type, and counts them', () => {
      const { source: out, count } = redactSecretValues(source);
      expect(count).toBe(2);
      expect(out.pipeline.variables.map((v: any) => v.value)).toEqual(['', 0, '', undefined, 'hello']);
      expect(JSON.stringify(out)).not.toContain('hunter2');
    });

    it('uses the placeholder for strings, and leaves the original untouched', () => {
      const { source: out } = redactSecretValues(source, '[REDACTED]');
      expect(out.pipeline.variables[0].value).toBe('[REDACTED]');
      expect(source.pipeline.variables[0].value).toBe('hunter2');
    });
  });
});
