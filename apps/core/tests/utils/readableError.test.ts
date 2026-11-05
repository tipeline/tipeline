import { describe, it, expect } from 'vitest';
import { readableValidationError } from '@utils/readableError';

describe('readableValidationError', () => {
  it('turns a Zod issue list into one line naming each field', () => {
    const message = JSON.stringify(
      [
        { code: 'custom', message: 'Must be a number or a template variable (e.g., {{ var }})', path: ['multiplier'] },
        { code: 'custom', message: 'Must be a number or a template variable (e.g., {{ var }})', path: ['multiplicand'] },
      ],
      null,
      2
    );
    expect(readableValidationError(message)).toBe(
      'multiplier: Must be a number or a template variable (e.g., {{ var }}); multiplicand: Must be a number or a template variable (e.g., {{ var }})'
    );
  });

  it('joins nested paths and handles issues without one', () => {
    expect(readableValidationError('[{"message":"Required","path":["connection","host"]},{"message":"Bad"}]')).toBe(
      'connection.host: Required; Bad'
    );
  });

  it('leaves any other message alone', () => {
    expect(readableValidationError('Workflow not found: x')).toBe('Workflow not found: x');
    expect(readableValidationError('[not json')).toBe('[not json');
    expect(readableValidationError('[1, 2]')).toBe('[1, 2]');
    expect(readableValidationError('[]')).toBe('[]');
  });
});
