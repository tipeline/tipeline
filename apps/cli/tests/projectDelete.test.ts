import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node-ipc', () => ({ default: { config: {}, of: {}, connectTo: vi.fn(), disconnect: vi.fn() } }));
vi.mock('@tipeline/agent', () => ({
  McpClient: class {},
  createProvider: vi.fn(),
  runAgentPrompt: vi.fn(),
  PROVIDERS: [],
}));
vi.mock('../src/Printer', () => ({
  default: { printMessage: vi.fn(), printError: vi.fn() },
}));

import CommandService from '../src/CommandService';
import Printer from '../src/Printer';

const user = (identifier: string, name: string, project_name: string | null) => ({ identifier, name, project_name });

// Sales: CRM lookup is used by an Ops app; Quote only by Sales' own app, and has a schedule.
const PREVIEW = {
  identifier: 'p-sales',
  name: 'Sales',
  workflows: [
    { identifier: 'wf-crm', name: 'CRM lookup', apps: [user('app-desk', 'Desk', 'Ops')], workflows: [], schedules: [] },
    { identifier: 'wf-quote', name: 'Quote', apps: [user('app-deals', 'Deals', 'Sales')], workflows: [], schedules: [{}] },
  ],
  apps: [{ identifier: 'app-deals', name: 'Deals' }],
};

/** Runs `tipeline project delete` with Core answering each channel; returns what was sent. */
async function deleteWith(name: string, options: any, answers: Record<string, any> = {}) {
  const sent: { event: string; payload: any }[] = [];
  const replies: Record<string, any> = {
    projectList: { success: true, data: [{ identifier: 'p-sales', name: 'Sales' }] },
    projectDeletePreview: { success: true, data: PREVIEW },
    projectDelete: { success: true, data: {} },
    ...answers,
  };
  vi.spyOn(CommandService, 'connectAndHandle').mockImplementation(((
    event: string,
    payload: any,
    listeners: Record<string, (r: any) => void>
  ) => {
    sent.push({ event, payload: payload.payload });
    const [handler] = Object.values(listeners);
    handler(replies[event]);
  }) as any);
  await CommandService.projectDelete(name, options);
  return sent;
}

const printed = () => vi.mocked(Printer.printMessage).mock.calls.map(([m]) => m).join('\n');

describe('tipeline project delete', () => {
  let exit: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    vi.mocked(Printer.printMessage).mockReset();
    vi.mocked(Printer.printError).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the workflows and apps by default, found by name in any case', async () => {
    const sent = await deleteWith('sales', { yes: true });
    expect(printed()).toContain('Its 2 workflows and 1 app stay, in no project.');
    expect(sent.at(-1)).toEqual({ event: 'projectDelete', payload: { identifier: 'p-sales' } });
    expect(printed()).toContain('Project deleted.');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('with --with-contents, keeps a workflow used elsewhere and says what uses it', async () => {
    const sent = await deleteWith('Sales', { withContents: true, yes: true });
    expect(printed()).toContain('workflow  Quote');
    expect(printed()).toContain('1 schedule goes with it');
    expect(printed()).toContain('workflow  CRM lookup — used by Desk (Ops)');
    expect(sent.at(-1)?.payload).toEqual({ identifier: 'p-sales', workflows: ['wf-quote'], apps: ['app-deals'] });
    expect(printed()).toContain('Project deleted; 2 items moved to the Trash.');
  });

  it('with --include-used, deletes those too and says what breaks', async () => {
    const sent = await deleteWith('Sales', { withContents: true, includeUsed: true, yes: true });
    expect(printed()).toContain('will stop working: Desk (Ops)');
    expect(sent.at(-1)?.payload).toEqual({ identifier: 'p-sales', workflows: ['wf-quote', 'wf-crm'], apps: ['app-deals'] });
  });

  it("won't delete without --yes when it can't ask", async () => {
    const sent = await deleteWith('Sales', {});
    expect(Printer.printError).toHaveBeenCalledWith('Nothing deleted. Run with --yes to delete without asking.');
    expect(sent.map((s) => s.event)).not.toContain('projectDelete');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('fails for an unknown project, or with what Core says', async () => {
    await deleteWith('Nope', { yes: true });
    expect(Printer.printError).toHaveBeenCalledWith('No project named "Nope".');

    await deleteWith('Sales', { yes: true }, { projectDelete: { success: false, error: 'Permission denied' } });
    expect(Printer.printError).toHaveBeenLastCalledWith('Permission denied');
    expect(exit).toHaveBeenLastCalledWith(1);
  });
});
