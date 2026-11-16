import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatResult, LLMProvider } from '@tipeline/agent';
import { AssistantService, NOT_SET_UP } from '../src/assistant/AssistantService.js';
import { assistantConfigFrom } from '../src/assistant/assistantConfig.js';
import { IpcToolClient } from '../src/assistant/IpcToolClient.js';

const editor = { id: 'u-ed', email: 'ed@acme.com', name: 'Ed', role: 'editor' } as any;
const admin = { id: 'u-ad', email: 'ad@acme.com', name: 'Ad', role: 'admin' } as any;

const SETTINGS = { agent_provider: 'anthropic', agent_anthropic_api_key: 'sk-org', agent_instructions: 'Prod is web-01.' };

const searchReply = JSON.stringify({
  matched: true,
  total: 1,
  workflows: [{ identifier: 'sales', name: 'Sales report', inputs: [{ name: 'month', type: 'string', required: true }] }],
});

/** Stands in for Core over IPC: answers the lookups and records each tool call. */
function fakeCore(overrides: Record<string, (payload: any) => unknown> = {}) {
  const calls: Array<{ event: string; payload: any }> = [];
  const answers: Record<string, (payload: any) => unknown> = {
    settingsList: () => SETTINGS,
    agentToolList: () => [
      { name: 'search_workflows', inputSchema: { type: 'object' } },
      { name: 'exec_task', inputSchema: { type: 'object' } },
      { name: 'create_draft_workflow', inputSchema: { type: 'object' } },
    ],
    agentToolCall: (p) =>
      p.name === 'exec_task'
        ? {
            text: JSON.stringify({ status: 'completed', pipelineIdentifier: 'pipe-1', durationMs: 5, outputs: { total: 42 } }),
            isError: false,
          }
        : { text: searchReply, isError: false },
    projectDetail: () => ({ name: 'ACME', instructions: 'Reports go to ops.' }),
    ...overrides,
  };
  return {
    calls,
    request: vi.fn(async (event: string, payload: any) => {
      calls.push({ event, payload });
      const answer = answers[event];
      if (!answer) throw new Error(`unexpected request ${event}`);
      return answer(payload);
    }),
  };
}

function fakeHistory() {
  const rows = new Map<string, any>();
  let choices: any = {};
  return {
    rows,
    create: vi.fn(async (id: string, userId: string, prompt: string) => {
      rows.set(id, { id, user_id: userId, prompt, status: 'thinking' });
    }),
    update: vi.fn(async (id: string, changes: any) => {
      rows.set(id, { ...rows.get(id), ...changes });
    }),
    get: vi.fn(async (id: string) => rows.get(id) ?? null),
    list: vi.fn(async (userId: string | null) => [...rows.values()].filter((r) => !userId || r.user_id === userId)),
    getChoices: vi.fn(async () => choices),
    saveChoices: vi.fn(async (_: string, next: any) => {
      choices = next;
    }),
  };
}

/** A model that plays back fixed replies and records what it was offered. */
function scripted(replies: ChatResult[]) {
  const offered: string[][] = [];
  const system: string[] = [];
  const provider: LLMProvider = {
    chat: async (messages, tools) => {
      offered.push(tools.map((t) => t.name));
      system.push(String(messages[0]?.content ?? ''));
      const next = replies.shift();
      if (!next) throw new Error('no scripted reply left');
      return next;
    },
  };
  return { provider, offered, system };
}

const proposeReplies = (): ChatResult[] => [
  { toolCalls: [{ id: 't1', name: 'search_workflows', arguments: { query: 'sales' } }] },
  { toolCalls: [{ id: 't2', name: 'propose_run', arguments: { identifier: 'sales', variables: { month: 'May' }, message: 'This one.' } }] },
];

let core: ReturnType<typeof fakeCore>;
let history: ReturnType<typeof fakeHistory>;
let sent: any[];
let beforeRun: ReturnType<typeof vi.fn>;
let model: ReturnType<typeof scripted>;
let hidden: Set<string>;
let owners: Record<string, any>;

const service = () =>
  new AssistantService({
    core,
    history: history as any,
    getOwner: async (id) => owners[id] ?? null,
    privateOwnedByOthers: async () => hidden,
    createProvider: () => model.provider,
    now: () => new Date('2026-11-15T10:00:00'),
  });

const reply = () => ({ send: (m: any) => sent.push(m), beforeRun });

beforeEach(() => {
  core = fakeCore();
  history = fakeHistory();
  sent = [];
  beforeRun = vi.fn();
  model = scripted(proposeReplies());
  hidden = new Set(['someone-elses-private']);
  owners = {};
});

describe('assistantAsk', () => {
  it('searches without the workflows the user may not see and proposes a run', async () => {
    await service().handle('assistantAsk', 'c-1', { prompt: 'sales report for May' }, editor, reply());

    const phases = sent.map((m) => m.data?.phase);
    expect(phases).toEqual(['thinking', 'searching', 'proposal']);
    expect(sent.every((m) => m.event === 'onAssistantAsk' && m.correlationId === 'c-1')).toBe(true);
    const search = core.calls.find((c) => c.event === 'agentToolCall');
    expect(search?.payload).toMatchObject({ name: 'search_workflows', exclude: ['someone-elses-private'] });
    expect(sent[2].data.proposal).toMatchObject({ identifier: 'sales', variables: { month: 'May' } });

    const requestId = sent[0].data.requestId;
    expect(history.rows.get(requestId)).toMatchObject({ user_id: 'u-ed', status: 'proposed', task_identifier: 'sales' });
  });

  it('only offers the model reading tools: never exec_task or drafting', async () => {
    await service().handle('assistantAsk', 'c-1', { prompt: 'sales' }, editor, reply());
    expect(model.offered[0]).toContain('search_workflows');
    expect(model.offered[0]).not.toContain('exec_task');
    expect(model.offered[0]).not.toContain('create_draft_workflow');
  });

  it('hides nothing from an admin', async () => {
    await service().handle('assistantAsk', 'c-1', { prompt: 'sales' }, admin, reply());
    expect(core.calls.find((c) => c.event === 'agentToolCall')?.payload.exclude).toEqual([]);
  });

  it('uses the organization instructions and the project ones', async () => {
    await service().handle('assistantAsk', 'c-1', { prompt: 'sales', projectIdentifier: 'acme' }, editor, reply());
    expect(model.system[0]).toContain('Prod is web-01.');
    expect(model.system[0]).toContain('Reports go to ops.');
  });

  it('says the Assistant is not set up when no key is set', async () => {
    core = fakeCore({ settingsList: () => ({}) });
    await service().handle('assistantAsk', 'c-1', { prompt: 'sales' }, editor, reply());
    expect(sent).toEqual([{ event: 'onAssistantAsk', correlationId: 'c-1', error: NOT_SET_UP }]);
    expect(history.create).not.toHaveBeenCalled();
  });

  it('refuses an empty request', async () => {
    await service().handle('assistantAsk', 'c-1', { prompt: '  ' }, editor, reply());
    expect(sent[0].error).toMatch(/Type what you need/);
  });

  it('records a failure with the request', async () => {
    model = scripted([]);
    await service().handle('assistantAsk', 'c-1', { prompt: 'sales' }, editor, reply());
    const last = sent[sent.length - 1];
    expect(last.error).toBeTruthy();
    expect(history.rows.get(last.data.requestId)).toMatchObject({ status: 'failed' });
  });
});

describe('assistantRun', () => {
  const ask = async (user = editor) => {
    await service().handle('assistantAsk', 'c-ask', { prompt: 'sales report for May' }, user, reply());
    return sent[0].data.requestId as string;
  };

  it('routes the run to the asker, runs it through Core and answers from the outputs', async () => {
    const requestId = await ask();
    sent = [];
    model = scripted([{ text: 'May sales were 42.' }]);

    await service().handle('assistantRun', 'c-run', { requestId, identifier: 'sales', variables: { month: 'May' } }, editor, reply());

    expect(beforeRun).toHaveBeenCalledWith('c-run', 'sales');
    const exec = core.calls.find((c) => c.event === 'agentToolCall' && c.payload.name === 'exec_task');
    expect(exec?.payload).toMatchObject({
      arguments: { identifier: 'sales', variables: { month: 'May' } },
      runCorrelationId: 'c-run',
      exclude: ['someone-elses-private'],
    });
    expect(sent.map((m) => m.data.phase)).toEqual(['task_running', 'run_finished', 'done']);
    expect(sent[2].data.answer).toBe('May sales were 42.');
    expect(history.rows.get(requestId)).toMatchObject({ status: 'completed', pipeline_identifier: 'pipe-1', answer: 'May sales were 42.' });
  });

  it("won't run another user's private workflow", async () => {
    const requestId = await ask();
    sent = [];
    owners['theirs'] = { user_id: 'u-other', visibility: 'private' };
    await service().handle('assistantRun', 'c-run', { requestId, identifier: 'theirs' }, editor, reply());
    expect(sent).toEqual([{ event: 'onAssistantRun', correlationId: 'c-run', error: 'Workflow not found' }]);
    expect(beforeRun).not.toHaveBeenCalled();
  });

  it("won't run for another user's request", async () => {
    const requestId = await ask(admin);
    sent = [];
    await service().handle('assistantRun', 'c-run', { requestId, identifier: 'sales' }, editor, reply());
    expect(sent[0].error).toBe('Request not found');
  });
});

describe('assistantChoose and assistantHistory', () => {
  it("remembers a pick in the user's own memory", async () => {
    await service().handle('assistantChoose', 'c-1', { requestKey: 'report sale', identifier: 'sales', name: 'Sales report' }, editor, reply());
    expect(sent[0]).toMatchObject({ event: 'onAssistantChoose', data: { remembered: true } });
    expect(history.saveChoices).toHaveBeenCalledWith('u-ed', { 'report sale': expect.objectContaining({ identifier: 'sales' }) });
  });

  it('lists your own requests; only an admin gets everyone’s', async () => {
    await service().handle('assistantHistory', 'c-1', {}, editor, reply());
    expect(history.list).toHaveBeenLastCalledWith('u-ed', 50);

    await service().handle('assistantHistory', 'c-2', { scope: 'everyone' }, editor, reply());
    expect(sent[1].error).toMatch(/only admins/);

    await service().handle('assistantHistory', 'c-3', { scope: 'everyone', limit: 10 }, admin, reply());
    expect(history.list).toHaveBeenLastCalledWith(null, 10);
  });
});

describe('assistantConfigFrom', () => {
  it('takes the chosen provider, or the first with a key', () => {
    expect(assistantConfigFrom(SETTINGS)).toMatchObject({ provider: 'anthropic', apiKey: 'sk-org', globalInstructions: 'Prod is web-01.' });
    expect(assistantConfigFrom({ agent_openai_api_key: 'sk-o', agent_openai_model: 'gpt-x' })).toMatchObject({
      provider: 'openai',
      model: 'gpt-x',
    });
  });

  it('is null without a key for the provider', () => {
    expect(assistantConfigFrom({ agent_provider: 'gemini', agent_openai_api_key: 'sk-o' })).toBeNull();
    expect(assistantConfigFrom({})).toBeNull();
  });
});

describe('IpcToolClient', () => {
  it('refuses tools the Server does not offer', async () => {
    const client = new IpcToolClient(core, []);
    await expect(client.callToolRaw('exec_task', {})).rejects.toThrow(/isn't available/);
    await expect(client.callToolRaw('create_draft_workflow', {})).rejects.toThrow(/isn't available/);
  });
});
