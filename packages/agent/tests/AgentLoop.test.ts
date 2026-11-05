import { describe, it, expect, vi } from 'vitest';
import { runAgent, defaultSystemPrompt, reusedWorkflows, PROPOSE_RUN_TOOL, NO_MATCH_TOOL } from '@/AgentLoop';
import type { McpClient } from '@/McpClient';
import type { ChatMessage, ChatResult, LLMProvider, ToolDefinition } from '@/types';

const SEARCH_TOOL: ToolDefinition = { name: 'search_workflows', inputSchema: { type: 'object' } };
const EXEC_TOOL: ToolDefinition = { name: 'exec_task', inputSchema: { type: 'object' } };

const searchReply = JSON.stringify({
  matched: true,
  total: 2,
  workflows: [
    {
      identifier: 'sales',
      name: 'Monthly sales report',
      inputs: [
        { name: 'month', type: 'date', required: true },
        { name: 'format', type: 'string', required: true },
      ],
    },
    { identifier: 'invoices', name: 'Invoice sender', inputs: [] },
  ],
});

function fakeMcp(reply = searchReply) {
  const callTool = vi.fn(async () => reply);
  const client = {
    listTools: vi.fn(async () => [SEARCH_TOOL, EXEC_TOOL]),
    callTool,
  } as unknown as McpClient;
  return { client, callTool };
}

/** A model that plays back a fixed list of replies and records what it was sent. */
function scriptedProvider(replies: ChatResult[]) {
  const calls: Array<{ messages: ChatMessage[]; tools: ToolDefinition[] }> = [];
  const provider: LLMProvider = {
    chat: async (messages, tools) => {
      calls.push({ messages: [...messages], tools });
      const next = replies.shift();
      if (!next) throw new Error('no scripted reply left');
      return next;
    },
  };
  return { provider, calls };
}

describe('runAgent', () => {
  it('offers search_workflows, propose_run, ask_choice and no_match — never exec_task', async () => {
    const { client } = fakeMcp();
    const { provider, calls } = scriptedProvider([{ text: 'Hello!' }]);

    await runAgent({ mcpClient: client, provider }, 'hi');

    expect(calls[0].tools.map((t) => t.name)).toEqual(['search_workflows', 'propose_run', 'ask_choice', 'no_match']);
  });

  it("ends the system prompt with the user's instructions", async () => {
    const { client } = fakeMcp();
    const { provider, calls } = scriptedProvider([{ text: 'Hello!' }]);

    await runAgent(
      { mcpClient: client, provider, instructions: { global: 'Prod is web-01.', project: { name: 'ACME', text: 'Prod is acme-web-01.' } } },
      'hi'
    );

    const system = calls[0].messages[0].content as string;
    expect(system.startsWith('You help people use Tipeline')).toBe(true);
    expect(system).toContain('General instructions:\n"""\nProd is web-01.');
    expect(system).toContain('Instructions for the project "ACME":\n"""\nProd is acme-web-01.');
  });

  it('returns a text answer when the model does not call a tool', async () => {
    const { client } = fakeMcp();
    const { provider } = scriptedProvider([{ text: 'No workflow does that yet.' }]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'annual salary of Maria');

    expect(outcome).toEqual({ kind: 'answer', text: 'No workflow does that yet.', requestKey: 'annual maria salary' });
  });

  it('searches, then returns a proposal with the workflow inputs and known values only', async () => {
    const { client, callTool } = fakeMcp();
    const { provider, calls } = scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: { query: 'sales report' } }] },
      {
        toolCalls: [
          {
            id: 't2',
            name: 'propose_run',
            arguments: {
              identifier: 'sales',
              variables: { month: '2026-04-01', bogus: 1 },
              alternatives: ['invoices', 'sales', 'unknown'],
              message: 'The monthly sales report fits.',
            },
          },
        ],
      },
    ]);
    const onToolCall = vi.fn();

    const outcome = await runAgent({ mcpClient: client, provider, onToolCall }, 'reports of April');

    expect(callTool).toHaveBeenCalledWith('search_workflows', { query: 'sales report' });
    expect(onToolCall).toHaveBeenCalledTimes(2);
    // The search result went back to the model as the tool's output.
    expect(calls[1].messages.at(-1)).toEqual({ role: 'tool', toolCallId: 't1', content: searchReply });
    expect(outcome).toEqual({
      kind: 'proposal',
      requestKey: 'april report',
      text: 'The monthly sales report fits.',
      proposal: {
        identifier: 'sales',
        name: 'Monthly sales report',
        variables: { month: '2026-04-01' },
        inputs: [
          { name: 'month', type: 'date', required: true },
          { name: 'format', type: 'string', required: true },
        ],
        alternatives: [{ identifier: 'invoices', name: 'Invoice sender' }],
      },
    });
  });

  it('offers a schedule instead of a run when the request says how often', async () => {
    const { client } = fakeMcp();
    const { provider } = scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: { query: 'sales report' } }] },
      {
        toolCalls: [
          {
            id: 't2',
            name: 'propose_run',
            arguments: { identifier: 'sales', variables: {}, message: 'The sales report fits.', schedule: ' every 40 seconds ' },
          },
        ],
      },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'run the sales report every 40 seconds');

    expect(outcome).toMatchObject({ kind: 'proposal', schedule: 'every 40 seconds', proposal: { identifier: 'sales' } });
    expect(defaultSystemPrompt(new Date())).toContain('pass that timing as schedule with propose_run or ask_choice');
    expect(PROPOSE_RUN_TOOL.inputSchema.properties.schedule).toBeDefined();
  });

  it('leaves out the schedule when the request gives no timing', async () => {
    const { client } = fakeMcp();
    const { provider } = scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: { query: 'sales' } }] },
      { toolCalls: [{ id: 't2', name: 'propose_run', arguments: { identifier: 'sales', variables: {}, message: 'ok', schedule: '' } }] },
    ]);
    const outcome = await runAgent({ mcpClient: client, provider }, 'sales report');
    expect(outcome).not.toHaveProperty('schedule');
  });

  it('rejects a proposal for a workflow the search never returned and lets the model retry', async () => {
    const { client } = fakeMcp();
    const { provider, calls } = scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'propose_run', arguments: { identifier: 'made-up', variables: {}, message: '' } }] },
      { text: 'I could not find one.' },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'something');

    expect(calls[1].messages.at(-1)?.content).toMatch(/not a workflow from search_workflows/);
    expect(outcome).toMatchObject({ kind: 'answer', text: 'I could not find one.' });
  });

  it('keeps the provider-native assistant turn so it can be replayed', async () => {
    const { client } = fakeMcp();
    const raw = [{ type: 'thinking', thinking: '', signature: 'sig' }];
    const { provider, calls } = scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: {} }], raw },
      { text: 'done' },
    ]);

    await runAgent({ mcpClient: client, provider }, 'x');

    const assistant = calls[1].messages.find((m) => m.role === 'assistant');
    expect(assistant?.raw).toBe(raw);
  });

  it('reports a tool error to the model instead of throwing', async () => {
    const client = {
      listTools: async () => [SEARCH_TOOL],
      callTool: async () => {
        throw new Error('Core is not running');
      },
    } as unknown as McpClient;
    const { provider, calls } = scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: {} }] },
      { text: 'Tipeline Core is not running.' },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'x');

    expect(calls[1].messages.at(-1)?.content).toBe('Error: Core is not running');
    expect(outcome.kind).toBe('answer');
  });
});

describe('runAgent when nothing fits', () => {
  it('returns the message and the workflow to draft', async () => {
    const { client } = fakeMcp();
    const { provider } = scriptedProvider([
      {
        toolCalls: [
          {
            id: 't1',
            name: 'no_match',
            arguments: {
              message: 'No workflow works out salaries yet.',
              draftRequest: 'Input: employee name (e.g. Maria). Reads monthly salary, multiplies by 12. Returns annual salary.',
            },
          },
        ],
      },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'get the annual salary of Maria');

    expect(outcome).toEqual({
      kind: 'nomatch',
      text: 'No workflow works out salaries yet.',
      draftRequest: 'Input: employee name (e.g. Maria). Reads monthly salary, multiplies by 12. Returns annual salary.',
      reuse: [],
      requestKey: 'annual maria salary',
    });
  });

  it('passes on the workflows to reuse that the search returned, with their hub, and drops made-up ones', async () => {
    const hub = { id: 'main', name: 'Main hub', itemIdentifier: 'send-email', version: '1.0.0' };
    const reply = JSON.stringify({
      matched: true,
      total: 2,
      workflows: [
        { identifier: 'php-version', name: 'Get PHP Version', inputs: [], outputs: [{ name: 'version', type: 'string' }] },
        { identifier: 'hub:main:send-email', name: 'Send Email', inputs: [], hub },
      ],
    });
    const { client } = fakeMcp(reply);
    const { provider } = scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: { query: 'php version' } }] },
      {
        toolCalls: [
          {
            id: 't2',
            name: 'no_match',
            arguments: {
              message: 'No single workflow does all of this.',
              draftRequest: 'Gets the PHP version and emails it.',
              reuse: ['php-version', 'invented', 'hub:main:send-email', 'php-version'],
            },
          },
        ],
      },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'email me the php version');

    expect(outcome).toMatchObject({
      kind: 'nomatch',
      reuse: [
        { identifier: 'php-version', name: 'Get PHP Version' },
        { identifier: 'hub:main:send-email', name: 'Send Email', hub },
      ],
    });
  });

  it('falls back to the request itself when the model gives no description', async () => {
    const { client } = fakeMcp();
    const { provider } = scriptedProvider([{ toolCalls: [{ id: 't1', name: 'no_match', arguments: { message: '' } }] }]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'send a weekly digest');

    expect(outcome).toMatchObject({ kind: 'nomatch', text: 'No workflow does this yet.', draftRequest: 'send a weekly digest' });
  });

  it('keeps the timing apart from the description, as the schedule', async () => {
    const { client } = fakeMcp();
    const { provider } = scriptedProvider([
      {
        toolCalls: [
          {
            id: 't1',
            name: 'no_match',
            arguments: { message: 'Nothing yet.', draftRequest: 'Generates random numbers.', schedule: ' every 30 seconds ' },
          },
        ],
      },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'run the random numbers every 30 seconds');

    expect(outcome).toMatchObject({ kind: 'nomatch', draftRequest: 'Generates random numbers.', schedule: 'every 30 seconds' });
    expect(NO_MATCH_TOOL.inputSchema.properties.draftRequest.description).toContain('goes in schedule, never here');
  });
});

describe('runAgent asking which one', () => {
  const deployReply = JSON.stringify({
    matched: true,
    total: 2,
    workflows: [
      { identifier: 'deploy-app', name: 'Deploy app', description: 'Ships the mobile app', inputs: [{ name: 'env', type: 'string' }] },
      { identifier: 'deploy-site', name: 'Deploy website', inputs: [{ name: 'env', type: 'string' }, { name: 'branch', type: 'string' }] },
    ],
  });

  function deployScript(identifiers: string[]) {
    return scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: { query: 'deploy' } }] },
      {
        toolCalls: [
          {
            id: 't2',
            name: 'ask_choice',
            arguments: { question: 'Which deployment?', identifiers, variables: { env: 'prod', branch: 'main' } },
          },
        ],
      },
    ]);
  }

  it('returns the question with each workflow as an option', async () => {
    const { client } = fakeMcp(deployReply);
    const { provider } = deployScript(['deploy-app', 'deploy-site', 'deploy-app', 'made-up']);

    const outcome = await runAgent({ mcpClient: client, provider }, 'run the deployment workflow to prod');

    expect(outcome).toEqual({
      kind: 'choice',
      text: 'Which deployment?',
      requestKey: 'deploy prod',
      variables: { env: 'prod', branch: 'main' },
      options: [
        { identifier: 'deploy-app', name: 'Deploy app', description: 'Ships the mobile app', inputs: [{ name: 'env', type: 'string' }] },
        { identifier: 'deploy-site', name: 'Deploy website', inputs: [{ name: 'env', type: 'string' }, { name: 'branch', type: 'string' }] },
      ],
    });
  });

  it('goes straight to the workflow picked last time for the same kind of request', async () => {
    const { client } = fakeMcp(deployReply);
    const { provider } = deployScript(['deploy-app', 'deploy-site']);
    const rememberedChoices = { 'deploy prod': { identifier: 'deploy-site', name: 'Deploy website', at: '2026-10-16T00:00:00Z' } };

    const outcome = await runAgent({ mcpClient: client, provider, rememberedChoices }, 'deployment to prod please');

    expect(outcome.kind).toBe('proposal');
    if (outcome.kind !== 'proposal') return;
    expect(outcome.proposal).toMatchObject({
      identifier: 'deploy-site',
      remembered: true,
      variables: { env: 'prod', branch: 'main' },
      alternatives: [{ identifier: 'deploy-app', name: 'Deploy app' }],
    });
  });

  it('still asks when the remembered workflow is not among the options', async () => {
    const { client } = fakeMcp(deployReply);
    const { provider } = deployScript(['deploy-app', 'deploy-site']);
    const rememberedChoices = { 'deploy prod': { identifier: 'gone', name: 'Old', at: '2026-10-16T00:00:00Z' } };

    const outcome = await runAgent({ mcpClient: client, provider, rememberedChoices }, 'deployment to prod');

    expect(outcome.kind).toBe('choice');
  });

  it('proposes directly when only one option is real', async () => {
    const { client } = fakeMcp(deployReply);
    const { provider } = deployScript(['deploy-app', 'made-up']);

    const outcome = await runAgent({ mcpClient: client, provider }, 'deploy');

    expect(outcome.kind).toBe('proposal');
    if (outcome.kind !== 'proposal') return;
    expect(outcome.proposal.identifier).toBe('deploy-app');
    expect(outcome.proposal.remembered).toBeUndefined();
    expect(outcome.proposal.variables).toEqual({ env: 'prod' });
  });

  it('tells the model to ask instead of guessing', () => {
    expect(defaultSystemPrompt(new Date())).toMatch(/call ask_choice instead of guessing/);
  });
});

describe('runAgent with hub workflows', () => {
  it('keeps the hub source on the proposal and its alternatives', async () => {
    const hub = { id: 'h1', name: 'Team hub', itemIdentifier: 'greet', version: '1.0.0' };
    const reply = JSON.stringify({
      matched: true,
      total: 2,
      workflows: [
        { identifier: 'hub:h1:greet', name: 'Greet someone', inputs: [{ name: 'person', type: 'string' }], hub },
        { identifier: 'local-hello', name: 'Hello', inputs: [] },
      ],
    });
    const { client } = fakeMcp(reply);
    const { provider } = scriptedProvider([
      { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: { query: 'greet' } }] },
      {
        toolCalls: [
          {
            id: 't2',
            name: 'propose_run',
            arguments: { identifier: 'hub:h1:greet', variables: { person: 'Ana' }, alternatives: ['local-hello'], message: '' },
          },
        ],
      },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'greet Ana');

    expect(outcome.kind).toBe('proposal');
    if (outcome.kind !== 'proposal') return;
    expect(outcome.proposal.hub).toEqual(hub);
    expect(outcome.proposal.variables).toEqual({ person: 'Ana' });
    expect(outcome.proposal.alternatives).toEqual([{ identifier: 'local-hello', name: 'Hello' }]);
  });

  it('tells the model to prefer installed workflows', () => {
    expect(defaultSystemPrompt(new Date())).toMatch(/Prefer an installed workflow/);
  });
});

describe('runAgent with helper workflows', () => {
  const reply = JSON.stringify({
    matched: true,
    total: 2,
    workflows: [
      { identifier: 'data-views', name: 'Data: Views and visits API', inputs: [{ name: 'salesforceId', type: 'string' }], helper: true },
      { identifier: 'traffic-views', name: 'Traffic: Views and visits by month', inputs: [{ name: 'customer', type: 'string' }] },
    ],
  });
  const search = { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: { query: 'views visits' } }] };

  it('refuses to propose a helper and tells the model to propose the workflow that answers', async () => {
    const { client } = fakeMcp(reply);
    const { provider, calls } = scriptedProvider([
      search,
      { toolCalls: [{ id: 't2', name: 'propose_run', arguments: { identifier: 'data-views', variables: {}, message: '' } }] },
      {
        toolCalls: [
          { id: 't3', name: 'propose_run', arguments: { identifier: 'traffic-views', variables: { customer: 'Northfield' }, message: '' } },
        ],
      },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'views and visits for Northfield');

    expect(calls[2].messages.at(-1)?.content).toMatch(/"Data: Views and visits API" is a helper/);
    expect(outcome).toMatchObject({ kind: 'proposal', proposal: { identifier: 'traffic-views', alternatives: [] } });
  });

  it('leaves helpers out of the alternatives and the options to choose from', async () => {
    const { client } = fakeMcp(reply);
    const { provider } = scriptedProvider([
      search,
      {
        toolCalls: [
          { id: 't2', name: 'ask_choice', arguments: { question: 'Which one?', identifiers: ['data-views', 'traffic-views'], variables: {} } },
        ],
      },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'views and visits');

    // One real option left, so it's proposed straight away.
    expect(outcome).toMatchObject({ kind: 'proposal', proposal: { identifier: 'traffic-views' } });
  });

  it('says so when every option offered is a helper', async () => {
    const { client } = fakeMcp(reply);
    const { provider, calls } = scriptedProvider([
      search,
      { toolCalls: [{ id: 't2', name: 'ask_choice', arguments: { question: 'Which?', identifiers: ['data-views'], variables: {} } }] },
      { text: 'Nothing answers that yet.' },
    ]);

    await runAgent({ mcpClient: client, provider }, 'views api');

    expect(calls[2].messages.at(-1)?.content).toMatch(/is a helper/);
  });

  it('still passes a helper on for reuse when nothing fits', async () => {
    const { client } = fakeMcp(reply);
    const { provider } = scriptedProvider([
      search,
      {
        toolCalls: [
          {
            id: 't2',
            name: 'no_match',
            arguments: { message: 'Nothing compares months yet.', draftRequest: 'Compares views by month.', reuse: ['data-views'] },
          },
        ],
      },
    ]);

    const outcome = await runAgent({ mcpClient: client, provider }, 'compare views month over month');

    expect(outcome).toMatchObject({ kind: 'nomatch', reuse: [{ identifier: 'data-views', name: 'Data: Views and visits API' }] });
  });

  it('tells the model never to offer a helper', () => {
    expect(defaultSystemPrompt(new Date())).toMatch(/Never propose or offer a workflow marked helper: true/);
  });
});

describe('runAgent with an older Core', () => {
  it('says Core needs a restart when search_workflows is missing', async () => {
    const client = { listTools: async () => [EXEC_TOOL], callTool: async () => '' } as unknown as McpClient;
    const { provider } = scriptedProvider([{ text: 'unused' }]);

    await expect(runAgent({ mcpClient: client, provider }, 'x')).rejects.toThrow(/Restart Core/);
  });
});

describe('defaultSystemPrompt', () => {
  it("states today's local date", () => {
    expect(defaultSystemPrompt(new Date(2026, 9, 16, 23, 30))).toContain('Today is 2026-10-16.');
  });
});

describe('PROPOSE_RUN_TOOL', () => {
  it('requires an identifier, values and a message', () => {
    expect(PROPOSE_RUN_TOOL.inputSchema.required).toEqual(['identifier', 'variables', 'message']);
  });
});

describe('reusedWorkflows', () => {
  const hub = { id: 'main', name: 'Main hub', itemIdentifier: 'system-info', version: '2.0.0' };
  const seen = new Map([
    ['hub:main:system-info', { identifier: 'hub:main:system-info', name: 'System Info', inputs: [], hub }],
    ['upper', { identifier: 'upper', name: 'Write Uppercased Text to File', inputs: [] }],
  ]);

  it('adds a searched workflow the description names by identifier or quoted name but forgot to list', () => {
    expect(reusedWorkflows([], seen, 'Run the System Info workflow (hub:main:system-info), then write it.')).toEqual([
      { identifier: 'hub:main:system-info', name: 'System Info', hub },
    ]);
    expect(reusedWorkflows(undefined, seen, 'Use "System Info" to read it, then write it.')).toHaveLength(1);
  });

  it('does not add one for words that only look like its name', () => {
    expect(reusedWorkflows([], seen, 'Read the system info and write it to a file.')).toEqual([]);
  });

  it('keeps the listed order and adds each workflow once', () => {
    const reuse = reusedWorkflows(['upper', 'hub:main:system-info'], seen, 'Use "System Info" and hub:main:system-info.');
    expect(reuse.map((w) => w.identifier)).toEqual(['upper', 'hub:main:system-info']);
  });

  it('asks for parts described by what they do, with no identifiers in the description', () => {
    const description = (NO_MATCH_TOOL.inputSchema.properties as any).draftRequest.description;
    expect(description).toMatch(/not as "run workflow X"/);
    expect(description).toMatch(/never write an identifier here/);
  });
});
