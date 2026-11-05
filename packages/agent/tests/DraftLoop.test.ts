import { describe, it, expect, vi } from 'vitest';
import { CANNOT_DO_TOOL, draftRequestMessage, draftSystemPrompt, draftWorkflow, stripFence } from '@/DraftLoop';
import { NO_MATCH_TOOL, defaultSystemPrompt } from '@/AgentLoop';
import type { McpClient } from '@/McpClient';
import type { ChatMessage, ChatResult, LLMProvider, ToolDefinition } from '@/types';

const TOOLS = ['search_workflows', 'exec_task', 'list_actions', 'describe_actions', 'check_workflow', 'create_draft_workflow', 'authoring_guide']
  .map((name) => ({ name, inputSchema: { type: 'object' } }));

function fakeMcp(saves: unknown[]) {
  const callTool = vi.fn(async (name: string, args: any) => {
    if (name === 'authoring_guide') return '# GUIDE';
    if (name === 'list_actions') return '[{"group":"math","actions":["multiply"]}]';
    if (name === 'describe_actions') return '{"actions":[]}';
    if (name === 'check_workflow') return '{"valid":true,"errors":[],"warnings":[]}';
    if (name === 'create_draft_workflow') return JSON.stringify(saves.shift());
    if (name === 'list_tasks') {
      return JSON.stringify([
        { identifier: 'php-version', name: 'Get PHP Version', inputs: [], outputs: [{ name: 'version', type: 'string' }] },
        { identifier: 'half-done', name: 'Half Done', inputs: [], draft: true },
      ]);
    }
    throw new Error(`unexpected ${name} ${JSON.stringify(args)}`);
  });
  return { client: { listTools: vi.fn(async () => TOOLS), callTool } as unknown as McpClient, callTool };
}

function scripted(replies: ChatResult[]) {
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

const submit = (id: string, yaml = 'name: x\n') => ({
  toolCalls: [{ id, name: 'submit_draft', arguments: { yaml, summary: '- Multiplies', todos: ['Create MY_KEY'] } }],
});

describe('draftWorkflow', () => {
  it('gives the model the guide and only searching, reading, checking and submit tools', async () => {
    const { client } = fakeMcp([{ created: true, identifier: 'new-1', name: 'Annual salary', warnings: [] }]);
    const { provider, calls } = scripted([submit('s1')]);

    await draftWorkflow({ mcpClient: client, provider }, 'annual salary');

    expect(calls[0].tools.map((t) => t.name)).toEqual([
      'search_workflows',
      'list_actions',
      'describe_actions',
      'check_workflow',
      'submit_draft',
      'cannot_do',
    ]);
    expect(calls[0].messages[0].content).toContain('# GUIDE');
    expect(calls[0].messages[1]).toEqual({ role: 'user', content: 'annual salary' });
  });

  it("adds the user's instructions after the guide", async () => {
    const { client } = fakeMcp([{ created: true, identifier: 'new-1', name: 'Disk report', warnings: [] }]);
    const { provider, calls } = scripted([submit('s1')]);

    await draftWorkflow({ mcpClient: client, provider, instructions: { global: 'Reports go to team@acme.com.' } }, 'disk report');

    const system = calls[0].messages[0].content as string;
    expect(system.indexOf('Reports go to team@acme.com.')).toBeGreaterThan(system.indexOf('# GUIDE'));
  });

  it('saves the hand-in and returns the draft with summary and to-dos', async () => {
    const { client, callTool } = fakeMcp([{ created: true, identifier: 'new-1', name: 'Annual salary', warnings: ['w'] }]);
    const { provider } = scripted([
      { toolCalls: [{ id: 'r1', name: 'list_actions', arguments: {} }] },
      submit('s1', '```yaml\nname: Annual salary\n```'),
    ]);
    const onProgress = vi.fn();

    const outcome = await draftWorkflow({ mcpClient: client, provider, onProgress }, 'annual salary');

    expect(callTool).toHaveBeenCalledWith('create_draft_workflow', { yaml: 'name: Annual salary\n' });
    expect(outcome).toEqual({
      kind: 'drafted',
      identifier: 'new-1',
      name: 'Annual salary',
      summary: '- Multiplies',
      todos: ['Create MY_KEY'],
      warnings: ['w'],
    });
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual(['writing', 'reading', 'saving']);
  });

  it('passes a proposed schedule on and returns it as Core read it', async () => {
    const schedule = { when: 'every day at 9am', cron: '0 9 * * *', runAt: null };
    const { client, callTool } = fakeMcp([{ created: true, identifier: 'new-1', name: 'Sales report', warnings: [], schedule }]);
    const { provider } = scripted([
      {
        toolCalls: [
          {
            id: 's1',
            name: 'submit_draft',
            arguments: { yaml: 'name: Sales report\n', summary: '- Saves the report', todos: [], schedule: ' every day at 9am ' },
          },
        ],
      },
    ]);

    const outcome = await draftWorkflow({ mcpClient: client, provider }, 'sales report every day');

    expect(callTool).toHaveBeenCalledWith('create_draft_workflow', { yaml: 'name: Sales report\n', schedule: 'every day at 9am' });
    expect(outcome).toMatchObject({ kind: 'drafted', schedule });
  });

  it('tells the model to hand timing in as a schedule, not build it into the workflow', () => {
    const prompt = draftSystemPrompt('');
    expect(prompt).toContain('no loop, wait or repeat for');
    expect(prompt).toContain('Pass the timing as schedule in submit_draft');
  });

  it('writes one run when the request step found a schedule, and saves that schedule', async () => {
    const { client, callTool } = fakeMcp([{ created: true, identifier: 'new-1', name: 'Random numbers', warnings: [] }]);
    // The model hands in a different timing; the one the request step read wins.
    const { provider, calls } = scripted([
      {
        toolCalls: [
          { id: 's1', name: 'submit_draft', arguments: { yaml: 'name: x\n', summary: '', todos: [], schedule: 'every minute' } },
        ],
      },
    ]);

    await draftWorkflow({ mcpClient: client, provider }, 'Generates random numbers.', { schedule: 'every 30 seconds' });

    expect(calls[0].messages[1].content).toBe(
      'Generates random numbers.\n\nIt will run on a schedule (every 30 seconds) that Tipeline starts it on. ' +
        'Write it to do the work once: no loop, wait or repeat for the timing.'
    );
    expect(callTool).toHaveBeenCalledWith('create_draft_workflow', { yaml: 'name: x\n', schedule: 'every 30 seconds' });
  });

  it('returns check errors to the model, and saves the fixed version', async () => {
    const { client } = fakeMcp([
      { created: false, errors: ['pipeline.actions[0] (math.multiply): multiplier: required'], warnings: [] },
      { created: true, identifier: 'new-2', name: 'Fixed', warnings: [] },
    ]);
    const { provider, calls } = scripted([submit('s1'), submit('s2')]);

    const outcome = await draftWorkflow({ mcpClient: client, provider }, 'x');

    expect(calls[1].messages.at(-1)?.content).toContain('multiplier: required');
    expect(outcome).toMatchObject({ kind: 'drafted', identifier: 'new-2' });
  });

  it('gives up after three failed hand-ins and reports the last errors', async () => {
    const bad = { created: false, errors: ['still wrong'], warnings: [] };
    const { client } = fakeMcp([bad, bad, bad]);
    const { provider } = scripted([submit('a'), submit('b'), submit('c')]);

    const outcome = await draftWorkflow({ mcpClient: client, provider }, 'x');

    expect(outcome).toEqual({
      kind: 'failed',
      text: "Couldn't write a workflow that passes the checks after 3 tries.",
      errors: ['still wrong'],
    });
  });

  it('refuses tools outside drafting, such as exec_task', async () => {
    const { client, callTool } = fakeMcp([{ created: true, identifier: 'n', name: 'N', warnings: [] }]);
    const { provider, calls } = scripted([
      { toolCalls: [{ id: 'x1', name: 'exec_task', arguments: { identifier: 'anything' } }] },
      submit('s1'),
    ]);

    await draftWorkflow({ mcpClient: client, provider }, 'x');

    expect(callTool).not.toHaveBeenCalledWith('exec_task', expect.anything());
    expect(calls[1].messages.at(-1)?.content).toMatch(/not available/);
  });

  it('says Core needs a restart when the drafting tools are missing', async () => {
    const client = {
      listTools: async () => [{ name: 'search_workflows', inputSchema: {} }],
      callTool: async () => '# GUIDE',
    } as unknown as McpClient;
    const { provider } = scripted([]);

    await expect(draftWorkflow({ mcpClient: client, provider }, 'x')).rejects.toThrow(/Restart Core/);
  });
});

describe('stripFence', () => {
  it('removes a Markdown code fence', () => {
    expect(stripFence('```yaml\nname: x\n```')).toBe('name: x\n');
    expect(stripFence('```\nname: x\n```\n')).toBe('name: x\n');
    expect(stripFence('name: x')).toBe('name: x\n');
  });
});

describe('staying in scope', () => {
  it('tells the drafting model to do only what was asked, with the fewest steps', () => {
    const prompt = draftSystemPrompt('# GUIDE');
    expect(prompt).toContain('Do exactly what the request asks and nothing more');
    expect(prompt).toContain('"to uppercase" is one');
    expect(prompt).toContain('when one action does the job, the workflow has one step');
    expect(prompt).not.toMatch(/so the workflow can be reused/);
  });

  it('keeps default values out of the description', () => {
    expect(draftSystemPrompt('# GUIDE')).toContain('Default values go in the inputs only');
  });

  it('treats values in a description or input default as defaults when matching a request', () => {
    expect(defaultSystemPrompt(new Date(2026, 0, 1))).toContain('is only a default');
  });

  it('asks for the smallest workflow when describing what to draft', () => {
    const description = (NO_MATCH_TOOL.inputSchema.properties as any).draftRequest.description;
    expect(description).toMatch(/smallest workflow that does exactly this request/);
    expect(description).toMatch(/not a choice of cases/);
  });
});

describe('reusing workflows', () => {
  it('tells the drafting model to look for workflows to reuse before building from actions', () => {
    const prompt = draftSystemPrompt('# GUIDE');
    expect(prompt.indexOf('search_workflows')).toBeLessThan(prompt.indexOf('list_actions'));
    expect(prompt).toContain('subtask.exec');
    expect(prompt).toContain('Never invent an identifier');
    expect(prompt).toContain('not because of its name');
  });

  it('asks the request loop to name the workflows a combined request should reuse', () => {
    const description = (NO_MATCH_TOOL.inputSchema.properties as any).draftRequest.description;
    expect(description).toMatch(/Put the workflows that do parts in reuse/);
    expect((NO_MATCH_TOOL.inputSchema.properties as any).reuse.type).toBe('array');
    expect(defaultSystemPrompt(new Date(2026, 0, 1))).toContain('has no single fit');
    expect(defaultSystemPrompt(new Date(2026, 0, 1))).toContain('a name alone is not enough');
    expect((NO_MATCH_TOOL.inputSchema.properties as any).reuse.description).toMatch(/not the name/);
  });
});

describe('drafting with workflows to reuse', () => {
  it('sends the request alone when there is nothing to reuse', async () => {
    const { client, callTool } = fakeMcp([]);
    expect(await draftRequestMessage(client, 'email the versions', { reuse: [] })).toBe('email the versions');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('looks up installed workflows with their inputs and outputs, and builds the rest from actions', async () => {
    const { client } = fakeMcp([]);
    const hub = { id: 'main', name: 'Main hub', itemIdentifier: 'send-email', version: '1.0.0' };
    const message = await draftRequestMessage(client, 'email the versions', {
      reuse: [
        { identifier: 'php-version', name: 'Get PHP Version' },
        { identifier: 'hub:main:send-email', name: 'Send Email', hub },
        { identifier: 'half-done', name: 'Half Done' },
        { identifier: 'deleted', name: 'Deleted One' },
      ],
    });
    expect(message.startsWith('email the versions\n\n')).toBe(true);
    expect(message).toContain('"identifier": "php-version"');
    expect(message).toContain('"name": "version"');
    expect(message).not.toContain('"identifier": "half-done"');
    expect(message).toContain(
      "build what these do from actions instead, even where the request names them, and say in the summary which parts are built from actions because the workflow isn't installed: Send Email, Half Done, Deleted One."
    );
  });

  it('gives the model the looked-up workflows with the request', async () => {
    const { client } = fakeMcp([{ created: true, identifier: 'new-1', name: 'Versions', warnings: [] }]);
    const { provider, calls } = scripted([submit('s1')]);

    await draftWorkflow({ mcpClient: client, provider }, 'email the versions', {
      reuse: [{ identifier: 'php-version', name: 'Get PHP Version' }],
    });

    expect(calls[0].messages[1].content).toContain('Workflows to reuse');
    expect(calls[0].messages[1].content).toContain('"identifier": "php-version"');
  });
});

describe('when part of the request cannot be done', () => {
  const cannotDo = (missing: unknown, possible = 'Writes the file name to a text file.') => ({
    toolCalls: [{ id: 'g1', name: 'cannot_do', arguments: { missing, possible } }],
  });

  it('tells the model to stop before writing instead of handing in part of the request', () => {
    const prompt = draftSystemPrompt('# GUIDE');
    expect(prompt).toContain('call cannot_do before');
    expect(prompt).toContain('Never hand in a workflow that leaves part of the request out');
  });

  it('never stops for a workflow that is not installed, or for what a command or script could do', () => {
    expect(draftSystemPrompt('# GUIDE')).toContain("A workflow that isn't installed is never a reason to stop");
    expect(draftSystemPrompt('# GUIDE')).toContain('can be done with\nsystem.runApplication');
    expect(draftSystemPrompt('# GUIDE')).toContain('script.runScript only computes values in a sandbox');
    expect(CANNOT_DO_TOOL.description).toContain("Never use it because a workflow isn't installed");
  });

  it('stops before anything is saved and says what is missing and what is still possible', async () => {
    const { client, callTool } = fakeMcp([]);
    const { provider } = scripted([cannotDo([' Reading the battery level: no action reads it. ', ''])]);

    const outcome = await draftWorkflow({ mcpClient: client, provider }, 'save my battery level to a file');

    expect(outcome).toEqual({
      kind: 'gap',
      missing: ['Reading the battery level: no action reads it.'],
      possible: 'Writes the file name to a text file.',
    });
    expect(callTool.mock.calls.map(([name]) => name)).not.toContain('create_draft_workflow');
  });

  it('asks again when the model stops without saying what is missing', async () => {
    const { client } = fakeMcp([{ created: true, identifier: 'new-1', name: 'Battery', warnings: [] }]);
    const { provider, calls } = scripted([cannotDo([]), submit('s1')]);

    const outcome = await draftWorkflow({ mcpClient: client, provider }, 'save my battery level');

    expect(outcome.kind).toBe('drafted');
    expect(calls[1].messages.at(-1)?.content).toMatch(/list each part/);
  });

  it('writes the rest once the user agrees, marked incomplete, with no way to stop again', async () => {
    const { client } = fakeMcp([{ created: true, identifier: 'new-1', name: 'Battery', warnings: [] }]);
    const { provider, calls } = scripted([submit('s1')]);
    const missing = ['Reading the battery level: no action reads it.'];

    const outcome = await draftWorkflow({ mcpClient: client, provider }, 'save my battery level', {
      acceptMissing: missing,
    });

    expect(outcome).toMatchObject({ kind: 'drafted', incomplete: missing });
    expect(calls[0].tools.map((t) => t.name)).not.toContain('cannot_do');
    expect(calls[0].messages[1].content).toContain('The user agreed to a workflow without these parts');
    expect(calls[0].messages[1].content).toContain('- Reading the battery level: no action reads it.');
  });
});
