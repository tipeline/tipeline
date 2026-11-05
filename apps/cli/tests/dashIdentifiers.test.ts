import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { maskDashIdentifiers, unmaskDashIdentifiers } from '../src/dashIdentifiers';

const ID = '-ZF0bAbCdEfGhIjKlMnOp';

/** Runs a real Commander parse the way index.ts does; returns what the action received. */
function parse(...args: string[]) {
  const got: { id?: string; var?: string[]; workflow?: string } = {};
  const program = new Command().exitOverride();
  program
    .command('exec')
    .argument('<id>')
    .option('--var <pairs...>')
    .option('--workflow <id>')
    .action((id, options) => Object.assign(got, { id, ...options }));
  program.hook('preAction', (_p, command) => unmaskDashIdentifiers(command as any));
  program.parse(maskDashIdentifiers(['node', 'tipeline', 'exec', ...args]));
  return got;
}

describe('identifiers starting with a dash', () => {
  it('work as a plain argument', () => {
    expect(parse(ID).id).toBe(ID);
  });

  it('work next to options, on either side', () => {
    expect(parse(ID, '--var', 'a=1')).toMatchObject({ id: ID, var: ['a=1'] });
    expect(parse('--var', 'a=1', '--workflow', ID, 'abc')).toMatchObject({ id: 'abc', workflow: ID });
  });

  it('keep working after --, as they had to before', () => {
    expect(parse('--', ID).id).toBe(ID);
  });

  it('still reject real unknown options', () => {
    expect(() => parse('--nope', 'abc')).toThrow();
  });
});
