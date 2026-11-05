import { describe, it, expect } from 'vitest';
import { instructionsSection, INSTRUCTIONS_MAX_LENGTH } from '@/instructions';

describe('instructionsSection', () => {
  it('is empty when there is nothing to say', () => {
    expect(instructionsSection()).toBe('');
    expect(instructionsSection({ global: '  ', project: { name: 'ACME', text: '' } })).toBe('');
  });

  it('quotes the general and the project instructions under their own headings', () => {
    const section = instructionsSection({
      global: 'Reports go to team@acme.com.',
      project: { name: 'ACME client', text: 'Prod is acme-web-01.' },
    });
    expect(section).toContain('General instructions:\n"""\nReports go to team@acme.com.\n"""');
    expect(section).toContain('Instructions for the project "ACME client":\n"""\nProd is acme-web-01.\n"""');
    expect(section).toContain('the project ones win');
  });

  it('leaves out a project without instructions', () => {
    const section = instructionsSection({ global: 'Prod is web-01.', project: { name: 'Internal' } });
    expect(section).toContain('General instructions:');
    expect(section).not.toContain('Internal');
  });

  it('cuts instructions longer than the limit', () => {
    const section = instructionsSection({ global: 'x'.repeat(INSTRUCTIONS_MAX_LENGTH + 500) });
    expect(section).toContain('x'.repeat(INSTRUCTIONS_MAX_LENGTH));
    expect(section).not.toContain('x'.repeat(INSTRUCTIONS_MAX_LENGTH + 1));
  });
});
