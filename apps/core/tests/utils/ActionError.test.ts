import { describe, expect, it } from 'vitest';
import { ActionError } from '@utils/ActionError';

describe('ActionError', () => {
  it('sets name, group, action, message, and issues', () => {
    const issues = [{ path: 'field', message: 'is invalid', code: 'invalid_type' }];
    const error = new ActionError('math', 'abs', 'something went wrong', issues);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ActionError');
    expect(error.group).toBe('math');
    expect(error.action).toBe('abs');
    expect(error.message).toBe('something went wrong');
    expect(error.issues).toEqual(issues);
  });

  it('defaults issues to an empty array when omitted', () => {
    const error = new ActionError('math', 'abs', 'oops');

    expect(error.issues).toEqual([]);
  });

  describe('toData', () => {
    it('returns the ActionErrorData shape', () => {
      const issues = [{ path: 'a.b', message: 'bad', code: 'custom' }];
      const error = new ActionError('http', 'request', 'request failed', issues);

      expect(error.toData()).toEqual({
        __type: 'ActionError',
        group: 'http',
        action: 'request',
        message: 'request failed',
        issues,
      });
    });
  });

  describe('fromCaught', () => {
    it('passes through an existing ActionError unchanged', () => {
      const original = new ActionError('math', 'abs', 'original error');
      const result = ActionError.fromCaught('other-group', 'other-action', original);

      expect(result).toBe(original);
      expect(result.group).toBe('math');
      expect(result.action).toBe('abs');
    });

    it('maps a duck-typed Zod-issue-shaped error into `issues` with a joined message', () => {
      const zodLikeError = {
        issues: [
          { path: ['field', 0], message: 'Required', code: 'invalid_type' },
          { path: [], message: 'Something else wrong', code: 'custom' },
        ],
      };

      const result = ActionError.fromCaught('math', 'abs', zodLikeError);

      expect(result).toBeInstanceOf(ActionError);
      expect(result.group).toBe('math');
      expect(result.action).toBe('abs');
      expect(result.issues).toEqual([
        { path: 'field.0', message: 'Required', code: 'invalid_type' },
        { path: '', message: 'Something else wrong', code: 'custom' },
      ]);
      expect(result.message).toBe('Required — field.0; Something else wrong');
    });

    it('stringifies a non-array path on a duck-typed issue', () => {
      const zodLikeError = {
        issues: [{ path: 'notAnArray', message: 'bad path', code: 'custom' }],
      };

      const result = ActionError.fromCaught('math', 'abs', zodLikeError);

      expect(result.issues).toEqual([{ path: 'notAnArray', message: 'bad path', code: 'custom' }]);
    });

    it('defaults an issue message when missing', () => {
      const zodLikeError = { issues: [{ path: [] }] };

      const result = ActionError.fromCaught('math', 'abs', zodLikeError);

      expect(result.issues).toEqual([{ path: '', message: 'Validation error', code: undefined }]);
      expect(result.message).toBe('Validation error');
    });

    it('falls back to a generic ActionError for a plain Error', () => {
      const error = new Error('plain failure');
      const result = ActionError.fromCaught('math', 'abs', error);

      expect(result).toBeInstanceOf(ActionError);
      expect(result.group).toBe('math');
      expect(result.action).toBe('abs');
      expect(result.message).toBe('plain failure');
      expect(result.issues).toEqual([]);
    });

    it('falls back to String(error) when the caught value has no message', () => {
      const result = ActionError.fromCaught('math', 'abs', 'raw string error');

      expect(result.message).toBe('raw string error');
      expect(result.issues).toEqual([]);
    });

    it('falls back to String(error) for a value with no message property (e.g. a number)', () => {
      const result = ActionError.fromCaught('math', 'abs', 404);

      expect(result.message).toBe('404');
    });
  });
});
