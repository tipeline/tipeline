import { mkdirSync, rmSync } from 'node:fs';
import ipc, { IPCModule } from 'node-ipc';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// A real node-ipc socket and a stand-in Core in its own folder, because these bugs live in how
// connections open and close, which tests that mock connectAndHandle can't see.
const socketRoot = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? '/tmp/'}tl-cli-test-${process.pid}/`;
  process.env.TIPELINE_IPC_SOCKET_ROOT = root;
  return root;
});

const agent = vi.hoisted(() => ({ runAgent: vi.fn(), parseRunResult: vi.fn() }));
vi.mock('@tipeline/agent', () => ({
  McpClient: class {
    callToolRaw = async () => ({ text: '' });
  },
  parseRunResult: agent.parseRunResult,
  summarizeRun: async () => '',
  missingInputs: () => [],
  createProvider: vi.fn(() => ({})),
  runAgent: agent.runAgent,
  parseChoiceMemory: () => ({}),
  PROVIDERS: ['deepseek'],
  PROVIDER_LABELS: { deepseek: 'DeepSeek' },
  CHOICE_MEMORY_SETTING: 'choice_memory',
  INSTRUCTIONS_SETTING: 'instructions',
}));
vi.mock('../src/Printer', () => ({
  default: {
    printMessage: vi.fn(),
    printError: vi.fn(),
    printTaskStart: vi.fn(),
    printTaskEnd: vi.fn(),
    printAction: vi.fn(),
    printAgentAnswer: vi.fn(),
    printAgentProposal: vi.fn(),
    printAgentResult: vi.fn(),
  },
}));

import CommandService from '../src/CommandService';
import Printer from '../src/Printer';

/** Waits for the CLI's first process.exit and returns the code. */
function exitCode() {
  return new Promise<number | undefined>((resolve) => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => resolve(code)) as any);
  });
}

describe('the CLI on a real connection', () => {
  const core = new (IPCModule as any)();
  const answers: Record<string, unknown> = {};
  const received: { event: string; data: any }[] = [];

  /** Core's side: answers the channels in `answers`, recording everything it gets. */
  const answer = (event: string) =>
    core.server.on(event, (data: any, socket: any) => {
      received.push({ event, data });
      core.server.emit(socket, `on${event[0].toUpperCase()}${event.slice(1)}`, {
        success: true,
        data: answers[event] ?? null,
        correlationId: data?.correlationId,
      });
    });

  beforeAll(async () => {
    mkdirSync(socketRoot, { recursive: true });
    core.config.id = 'tipeline_core';
    core.config.socketRoot = socketRoot;
    core.config.silent = true;
    await new Promise<void>((resolve) => {
      core.serve(() => {
        for (const event of [
          'connectionGetActive',
          'projectList',
          'projectDeletePreview',
          'projectDelete',
          'settingsList',
          'settingsGetApiToken',
          'projectDetail',
          'pluginList',
          'pluginSetEnabled',
          'approvalList',
          'approvalDecide',
        ]) {
          answer(event);
        }
        resolve();
      });
      core.server.start();
    });
  });

  afterAll(() => {
    core.server.stop();
    rmSync(socketRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    received.length = 0;
    for (const key of Object.keys(answers)) delete answers[key];
    vi.mocked(Printer.printMessage).mockReset();
    vi.mocked(Printer.printError).mockReset();
    vi.mocked(Printer.printTaskEnd).mockReset();
    agent.runAgent.mockReset();
  });

  afterEach(() => {
    // The real CLI ends with its process; here the next test needs a fresh connection.
    (ipc.of.tipeline_core as any)?.off('destroy', '*');
    ipc.disconnect('tipeline_core');
    core.server.off('exec', '*');
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const errors = () => vi.mocked(Printer.printError).mock.calls.map(([m]) => m);
  const messages = () => vi.mocked(Printer.printMessage).mock.calls.map(([m]) => m).join('\n');

  describe('a run being watched', () => {
    /** Starts `exec`; Core plays `events` once it asks to run. Resolves with the exit code. */
    function execWith(events: [string, any][]) {
      const exited = exitCode();
      core.server.on('exec', (data: any) => {
        core.server.off('exec', '*');
        for (const [event, message] of events) {
          core.server.broadcast(event, { correlationId: data.correlationId, ...message });
        }
      });
      CommandService.taskExec('wf', {});
      return exited;
    }

    it('keeps watching when another run ends, and exits when its own does', async () => {
      const exitSpy = exitCode();
      let exitedEarly = false;
      void exitSpy.then(() => (exitedEarly = true));
      core.server.on('exec', async (data: any) => {
        core.server.off('exec', '*');
        core.server.broadcast('onTaskEndAll', { success: true, correlationId: 'another-run' });
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(exitedEarly).toBe(false);
        core.server.broadcast('onTaskEndAll', { success: true, correlationId: data.correlationId });
      });
      CommandService.taskExec('wf', {});
      expect(await exitSpy).toBe(0);
    });

    it.each([
      ['paused', 2],
      ['canceled', 1],
      ['failed', 1],
    ])('exits non-zero for a run that ends %s', async (status, code) => {
      expect(
        await execWith([
          ['onTaskEnd', { success: true, data: { name: 'wf', status } }],
          ['onTaskEndAll', { success: true }],
        ])
      ).toBe(code);
      expect(vi.mocked(Printer.printTaskEnd).mock.calls[0][0]).toMatchObject({ status });
    });

    it('lets the top-level workflow decide when a sub-workflow failed and it carried on', async () => {
      expect(
        await execWith([
          ['onTaskEnd', { success: true, data: { name: 'child', status: 'failed' } }],
          ['onTaskEnd', { success: true, data: { name: 'wf' } }],
          ['onTaskEndAll', { success: true }],
        ])
      ).toBe(0);
    });
  });

  describe('commands that make several requests', () => {
    it('deletes a project without mistaking its own disconnect for Core being down', async () => {
      answers.projectList = [{ identifier: 'p-1', name: 'Sales' }];
      answers.projectDeletePreview = { identifier: 'p-1', name: 'Sales', workflows: [], apps: [] };
      const exited = exitCode();
      CommandService.projectDelete('Sales', { yes: true });
      expect(await exited).toBe(0);
      expect(errors()).toEqual([]);
      expect(received.map((r) => r.event)).toContain('projectDelete');
      expect(messages()).toContain('Project deleted.');
    });

    it('reaches the "no API key" message instead of hanging', async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', undefined);
      vi.stubEnv('TIPELINE_AGENT_PROVIDER', undefined);
      answers.settingsList = {};
      answers.settingsGetApiToken = 'core-token';
      const exited = exitCode();
      CommandService.agentPrompt('hello');
      expect(await exited).toBe(1);
      expect(errors().join()).toContain('API key');
    });

    it('answers a prompt with the key from Desktop settings and a project', async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', undefined);
      vi.stubEnv('TIPELINE_AGENT_PROVIDER', undefined);
      answers.settingsList = { agent_provider: 'deepseek', agent_deepseek_api_key: 'key' };
      answers.settingsGetApiToken = 'core-token';
      answers.projectList = [{ identifier: 'p-1', name: 'Sales' }];
      answers.projectDetail = { identifier: 'p-1', name: 'Sales', instructions: 'Be brief.' };
      agent.runAgent.mockResolvedValue({ kind: 'answer', text: 'hi' });
      const exited = exitCode();
      CommandService.agentPrompt('hello', { project: 'sales' });
      expect(await exited).toBe(0);
      expect(agent.runAgent.mock.calls[0][0].instructions.project).toEqual({ name: 'Sales', text: 'Be brief.' });
    });

    it.each([
      ['completed', 0],
      ['failed', 1],
      ['canceled', 1],
      ['paused', 2],
    ])('exits like exec when the assistant runs a workflow that ends %s', async (status, code) => {
      vi.stubEnv('DEEPSEEK_API_KEY', 'key');
      vi.stubEnv('TIPELINE_AGENT_PROVIDER', 'deepseek');
      answers.settingsGetApiToken = 'core-token';
      agent.runAgent.mockResolvedValue({
        kind: 'proposal',
        text: '',
        proposal: { identifier: 'wf', name: 'Report', inputs: [], variables: {} },
      });
      agent.parseRunResult.mockReturnValue({ status, durationMs: 1 });
      const exited = exitCode();
      CommandService.agentPrompt('run the report', { yes: true });
      expect(await exited).toBe(code);
    });

    it('finds a plugin by group and turns it on', async () => {
      answers.pluginList = [{ identifier: 'pl-1', group: 'acme', name: 'Acme', enabled: false }];
      const exited = exitCode();
      CommandService.pluginSetEnabled('acme', true);
      expect(await exited).toBe(0);
      expect(received.find((r) => r.event === 'pluginSetEnabled')?.data.payload).toEqual({
        identifier: 'pl-1',
        enabled: true,
      });
      expect(messages()).toContain('Plugin "Acme" enabled.');
    });

    it('refuses a plugin that does not exist', async () => {
      answers.pluginList = [];
      const exited = exitCode();
      CommandService.pluginSetEnabled('nope', true);
      expect(await exited).toBe(1);
      expect(received.map((r) => r.event)).not.toContain('pluginSetEnabled');
    });

    it('refuses an unknown hub item type before sending anything', async () => {
      const exited = exitCode();
      CommandService.hubInstall('badtype' as any, '1', 'item');
      expect(await exited).toBe(1);
      expect(errors().join()).toContain('Unknown type');
      expect(received).toEqual([]);
    });

    it.each([
      [true, 'Approved'],
      [false, 'Rejected'],
    ])('decides an approval as the CLI, with the comment', async (approved, said) => {
      const exited = exitCode();
      CommandService.approvalDecide('run-1', approved, { comment: 'looks fine' });
      expect(await exited).toBe(0);
      expect(received.find((r) => r.event === 'approvalDecide')?.data.payload).toEqual({
        pipelineIdentifier: 'run-1',
        approved,
        comment: 'looks fine',
        decidedBy: 'cli',
      });
      expect(messages()).toContain(said);
    });

    // Stops the stand-in Core, so it stays last.
    it('still says Core is down when it really is', async () => {
      core.server.stop();
      const exited = exitCode();
      CommandService.pluginList();
      expect(await exited).toBe(1);
      expect(errors().join()).toContain('not running');
    });
  });
});
