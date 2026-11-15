import { describe, expect, it } from 'vitest';
import {
  descriptionLine,
  initialValues,
  isListed,
  outputVariables,
  parseSource,
  runInputs,
  stepsFromSource,
  toRunVariables,
  type WorkflowSource,
} from '../src/lib/workflows';

const source: WorkflowSource = {
  description: '# Title\n\nSends the **weekly** [report](https://x.dev) to clients.\n\nMore.',
  pipeline: {
    variables: [
      { type: 'string', name: 'client', label: 'Client', visibility: 'public', required: true },
      { type: 'number', name: 'days', visibility: 'public', value: 7 },
      { type: 'boolean', name: 'dryRun', label: 'Dry run', visibility: 'public', value: 'true' },
      { type: 'object', name: 'options', visibility: 'public', value: { a: 1 } },
      { type: 'date', name: 'from', visibility: 'public' },
      { type: 'oauthToken', name: 'google', visibility: 'public' },
      { type: 'browser', name: 'browser', visibility: 'public' },
      { type: 'string', name: 'internal', visibility: 'protected' },
      { type: 'string', name: 'hidden' },
      { type: 'string', name: 'fromEnv', visibility: 'public', valueFromEnv: 'X' },
      { type: 'string', name: 'fromGlobal', visibility: 'public', valueFromGlobal: 'Y' },
      { type: 'string', name: 'report', visibility: 'public', output: true, label: 'Report' },
      { type: 'string', name: 'secretOut', visibility: 'private', output: true },
    ],
    actions: [
      { identifier: 's1', label: 'Fetch data', group: 'http', name: 'request' },
      { identifier: 's2', group: 'file', name: 'write' },
      { label: 'no identifier' },
    ],
  },
};

describe('runInputs', () => {
  it('asks only for public, non-output, typed-in variables, like Desktop', () => {
    const inputs = runInputs(source);
    expect(inputs.map((i) => i.variable.name)).toEqual(['client', 'days', 'dryRun', 'options', 'from', 'google']);
    expect(inputs.map((i) => i.kind)).toEqual(['text', 'number', 'boolean', 'json', 'date', 'desktopOnly']);
    expect(inputs[0].label).toBe('Client');
    expect(inputs[1].label).toBe('days');
  });

  it('handles a missing or broken source', () => {
    expect(runInputs(null)).toEqual([]);
    expect(parseSource('{not json')).toBeNull();
    expect(parseSource('{"name":"a"}')).toEqual({ name: 'a' });
  });
});

describe('initialValues + toRunVariables', () => {
  const inputs = runInputs(source);

  it('starts from saved values (JSON as text, booleans from strings)', () => {
    const v = initialValues(inputs);
    expect(v).toMatchObject({ client: '', days: 7, dryRun: true, from: '' });
    expect(JSON.parse(v.options as string)).toEqual({ a: 1 });
  });

  it('converts values and leaves out empty and desktop-only inputs', () => {
    const { variables, problems } = toRunVariables(inputs, {
      client: 'Acme',
      days: '3,5',
      dryRun: false,
      options: '{"b":2}',
      from: '',
      google: 'ignored',
    });
    expect(problems).toEqual([]);
    expect(variables).toEqual({ client: 'Acme', days: 3.5, dryRun: false, options: { b: 2 } });
  });

  it('reports a missing required input and bad JSON', () => {
    const { problems } = toRunVariables(inputs, { client: '  ', options: '{bad' });
    expect(problems).toEqual([
      { name: 'client', problem: 'required' },
      { name: 'options', problem: 'invalidJson' },
    ]);
  });
});

describe('steps and outputs', () => {
  it('lists top-level steps with their labels', () => {
    expect(stepsFromSource(source)).toEqual([
      { identifier: 's1', label: 'Fetch data' },
      { identifier: 's2', label: 'file.write' },
    ]);
  });

  it('shows only public outputs', () => {
    expect(outputVariables(source).map((v) => v.name)).toEqual(['report']);
  });
});

describe('list helpers', () => {
  it('takes the first plain line of a Markdown description', () => {
    expect(descriptionLine(source.description)).toBe('Sends the weekly report to clients.');
    expect(descriptionLine('- a list item')).toBe('a list item');
    expect(descriptionLine(null)).toBe('');
  });

  it('leaves helper workflows out of the list', () => {
    expect(isListed({ helper: true })).toBe(false);
    expect(isListed({ helper: null })).toBe(true);
  });
});
