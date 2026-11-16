import { describe, expect, it } from 'vitest';
import type { AssistantChoiceOption, AssistantProposal } from '@tipeline/client';
import { durationText, proposalFromOption, proposalInputs, resultOutputs } from '@/lib/assistant';
import { initialValues } from '@/lib/workflows';
import { renderMarkdown } from '@/lib/markdown';

const proposal: AssistantProposal = {
  identifier: 'sales',
  name: 'Sales report',
  variables: { month: 'May' },
  inputs: [
    { name: 'month', type: 'string', label: 'Month', required: true },
    { name: 'format', type: 'string', default: 'pdf' },
    { name: 'notify', type: 'boolean' },
    { name: 'browser', type: 'browser' },
  ],
  alternatives: [],
};

describe('proposalInputs', () => {
  it('fills the form with what the Assistant read, else the defaults', () => {
    const inputs = proposalInputs(proposal);
    expect(inputs.map((i) => [i.variable.name, i.kind])).toEqual([
      ['month', 'text'],
      ['format', 'text'],
      ['notify', 'boolean'],
    ]);
    expect(initialValues(inputs)).toEqual({ month: 'May', format: 'pdf', notify: false });
  });
});

describe('proposalFromOption', () => {
  const options: AssistantChoiceOption[] = [
    { identifier: 'a', name: 'A', inputs: [{ name: 'month', type: 'string' }] },
    { identifier: 'b', name: 'B', inputs: [] },
  ];

  it('keeps only the values the picked one has inputs for; the others become alternatives', () => {
    expect(proposalFromOption(options, 'a', { month: 'May', site: 'x' })).toEqual({
      identifier: 'a',
      name: 'A',
      variables: { month: 'May' },
      inputs: [{ name: 'month', type: 'string' }],
      alternatives: [{ identifier: 'b', name: 'B' }],
    });
    expect(proposalFromOption(options, 'zzz')).toBeNull();
  });
});

describe('resultOutputs and durationText', () => {
  it('labels outputs the way the workflow names them', () => {
    expect(
      resultOutputs({
        status: 'completed',
        pipelineIdentifier: 'p',
        durationMs: 1,
        outputs: { total: 42, raw: 'x' },
        outputDetails: { total: { label: 'Total sales', description: 'In euros' } },
      })
    ).toEqual([
      { name: 'total', label: 'Total sales', description: 'In euros', value: 42 },
      { name: 'raw', label: 'raw', value: 'x' },
    ]);
    expect(resultOutputs(undefined)).toEqual([]);
  });

  it('reads durations', () => {
    expect(durationText(820)).toBe('820 ms');
    expect(durationText(4812)).toBe('4.8 s');
    expect(durationText(42_000)).toBe('42 s');
    expect(durationText(125_000)).toBe('2 min 5 s');
    expect(durationText(undefined)).toBe('');
  });
});

describe('renderMarkdown', () => {
  it('renders Markdown, shows raw HTML as text, and drops unsafe links and images', () => {
    expect(renderMarkdown('**Two** sites failed')).toContain('<strong>Two</strong>');
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img');
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href');
    expect(renderMarkdown('![logo](https://a.dev/l.png)')).not.toContain('<img');
    expect(renderMarkdown('[docs](https://a.dev)')).toContain('href="https://a.dev"');
  });
});
