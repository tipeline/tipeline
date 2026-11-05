import { describe, it, expect } from 'vitest';
import { compactOutputs, missingInputs, parseRunResult, summarizeRun } from '@/runResults';
import type { ChatMessage, LLMProvider } from '@/types';

describe('missingInputs', () => {
  const inputs = [
    { name: 'month', type: 'date', required: true },
    { name: 'format', type: 'string', required: true, default: 'pdf' },
    { name: 'tags', type: 'array', required: true },
    { name: 'note', type: 'string' },
  ];

  it('lists required inputs with neither a value nor a default', () => {
    expect(missingInputs(inputs, {}).map((i) => i.name)).toEqual(['month', 'tags']);
  });

  it('counts empty strings and empty lists as missing', () => {
    expect(missingInputs(inputs, { month: '', tags: [] }).map((i) => i.name)).toEqual(['month', 'tags']);
  });

  it('is empty once every required input has a value', () => {
    expect(missingInputs(inputs, { month: '2026-04-01', tags: ['a'] })).toEqual([]);
  });
});

describe('compactOutputs', () => {
  it('leaves small outputs untouched', () => {
    const outputs = { total: 48210, orders: 312, report: '/tmp/april.pdf' };
    expect(compactOutputs(outputs)).toEqual(outputs);
  });

  it('cuts long text and long lists, and says how much was left out', () => {
    const outputs = { text: 'x'.repeat(5000), rows: Array.from({ length: 50 }, (_, i) => ({ i })) };
    const compact = compactOutputs(outputs) as any;
    expect(JSON.stringify(compact).length).toBeLessThanOrEqual(4000);
    expect(compact.text).toMatch(/more characters\)$/);
    expect(compact.rows.at(-1)).toMatch(/more items$/);
  });

  it('falls back to names and types when nothing else fits', () => {
    const outputs = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`field${i}`, 'value '.repeat(20)]));
    const compact = compactOutputs(outputs, 3000);
    expect(compact.field0).toBe('string');
  });
});

describe('parseRunResult', () => {
  it('reads exec_task JSON', () => {
    const text = JSON.stringify({ status: 'completed', pipelineIdentifier: 'p1', durationMs: 4200, outputs: { a: 1 } });
    expect(parseRunResult(text)).toEqual({ status: 'completed', pipelineIdentifier: 'p1', durationMs: 4200, outputs: { a: 1 } });
  });

  it('keeps what the outputs mean and the workflow description', () => {
    const text = JSON.stringify({
      status: 'completed',
      pipelineIdentifier: 'p1',
      durationMs: 10,
      outputs: { views: 46.1 },
      outputDetails: { views: { label: 'Views', description: 'In millions.' } },
      description: 'Views by month.',
    });
    expect(parseRunResult(text)).toMatchObject({
      outputDetails: { views: { label: 'Views', description: 'In millions.' } },
      description: 'Views by month.',
    });
  });

  it('treats a plain-text reply as a failure carrying that text', () => {
    expect(parseRunResult('Workflow "x" failed: boom')).toEqual({
      status: 'failed',
      pipelineIdentifier: '',
      durationMs: 0,
      outputs: {},
      error: 'Workflow "x" failed: boom',
    });
  });
});

describe('summarizeRun', () => {
  it('sends the request, status and trimmed outputs without tools, and returns the text', async () => {
    let sent: { messages: ChatMessage[]; toolCount: number } | null = null;
    const provider: LLMProvider = {
      chat: async (messages, tools) => {
        sent = { messages, toolCount: tools.length };
        return { text: '  April sales were **$48,210**.  ' };
      },
    };

    const answer = await summarizeRun(provider, {
      prompt: 'reports of April',
      workflowName: 'Monthly sales report',
      result: { status: 'completed', pipelineIdentifier: 'p1', durationMs: 4230, outputs: { total: 48210 } },
    });

    expect(answer).toBe('April sales were **$48,210**.');
    expect(sent!.toolCount).toBe(0);
    expect(JSON.parse(sent!.messages[1].content)).toEqual({
      request: 'reports of April',
      workflow: 'Monthly sales report',
      status: 'completed',
      seconds: 4.2,
      outputs: { total: 48210 },
    });
  });
  it('sends the workflow description and what each output means', async () => {
    let sent: ChatMessage[] = [];
    const provider: LLMProvider = {
      chat: async (messages) => {
        sent = messages;
        return { text: 'ok' };
      },
    };

    await summarizeRun(provider, {
      prompt: 'views last month',
      workflowName: 'Traffic',
      result: {
        status: 'completed',
        pipelineIdentifier: 'p1',
        durationMs: 1000,
        outputs: { views: 46.1 },
        outputDetails: { views: { label: 'Views', description: 'In millions.' } },
        description: 'Views by month.',
      },
    });

    expect(JSON.parse(sent[1].content)).toMatchObject({
      description: 'Views by month.',
      outputs: { views: 46.1 },
      outputDetails: { views: { label: 'Views', description: 'In millions.' } },
    });
  });
});
