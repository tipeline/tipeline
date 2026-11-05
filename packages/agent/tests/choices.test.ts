import { describe, it, expect } from 'vitest';
import { parseChoiceMemory, proposalFromChoice, rememberChoice, requestKey } from '@/choices';

describe('requestKey', () => {
  it('gives differently worded asks for the same thing the same key', () => {
    expect(requestKey('Run the deployment workflow')).toBe('deploy');
    expect(requestKey('deploy please')).toBe('deploy');
    expect(requestKey('Give me the reports of April')).toBe('april report');
    expect(requestKey('reports for april')).toBe('april report');
  });

  it('is empty when only filler is left', () => {
    expect(requestKey('run it now please')).toBe('');
  });
});

describe('parseChoiceMemory', () => {
  it('reads stored JSON and ignores anything else', () => {
    expect(parseChoiceMemory('{"a":{"identifier":"x","name":"X","at":"t"}}')).toEqual({ a: { identifier: 'x', name: 'X', at: 't' } });
    expect(parseChoiceMemory('')).toEqual({});
    expect(parseChoiceMemory('not json')).toEqual({});
    expect(parseChoiceMemory('[1]')).toEqual({});
  });
});

describe('rememberChoice', () => {
  it('adds or replaces the pick for a key', () => {
    const now = new Date('2026-10-16T10:00:00Z');
    const memory = rememberChoice({}, 'deployment', { identifier: 'a', name: 'A' }, now);
    expect(rememberChoice(memory, 'deployment', { identifier: 'b', name: 'B' }, now)).toEqual({
      deployment: { identifier: 'b', name: 'B', at: '2026-10-16T10:00:00.000Z' },
    });
  });

  it('ignores an empty key', () => {
    expect(rememberChoice({}, '', { identifier: 'a', name: 'A' })).toEqual({});
  });

  it('keeps the 200 most recent keys', () => {
    let memory = {};
    for (let i = 0; i < 205; i++) {
      memory = rememberChoice(memory, `k${i}`, { identifier: 'x', name: 'X' }, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    }
    expect(Object.keys(memory)).toHaveLength(200);
    expect(memory).not.toHaveProperty('k0');
    expect(memory).toHaveProperty('k204');
  });
});

describe('proposalFromChoice', () => {
  const options = [
    { identifier: 'a', name: 'Deploy app', inputs: [{ name: 'env', type: 'string' }] },
    { identifier: 'h', name: 'Deploy site', inputs: [], hub: { id: 'h1', name: 'Hub', itemIdentifier: 'site', version: '1' } },
  ];

  it('keeps the values that option has inputs for and lists the rest as alternatives', () => {
    expect(proposalFromChoice(options, 'a', { env: 'prod', branch: 'main' })).toEqual({
      identifier: 'a',
      name: 'Deploy app',
      variables: { env: 'prod' },
      inputs: [{ name: 'env', type: 'string' }],
      alternatives: [{ identifier: 'h', name: 'Deploy site', hub: options[1].hub }],
    });
  });

  it('carries the hub source and the remembered flag', () => {
    expect(proposalFromChoice(options, 'h', {}, true)).toMatchObject({ hub: options[1].hub, remembered: true });
  });

  it('returns null for an identifier that is not an option', () => {
    expect(proposalFromChoice(options, 'zzz', {})).toBeNull();
  });
});
