import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node-ipc', () => ({ default: { config: {}, connectTo: vi.fn(), disconnect: vi.fn() } }));
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

/** Runs `tipeline pipeline cancel <id>` with core answering `response`. */
async function cancelWith(response: any) {
  let sent: { event: string; payload: any } | null = null;
  vi.spyOn(CommandService, 'connectAndHandle').mockImplementation(((
    event: string,
    payload: any,
    listeners: Record<string, (r: any) => void>
  ) => {
    sent = { event, payload };
    listeners.onPipelineCancel(response);
  }) as any);
  await CommandService.pipelineCancel('p-1');
  return sent!;
}

describe('tipeline pipeline cancel', () => {
  let exit: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    vi.mocked(Printer.printMessage).mockReset();
    vi.mocked(Printer.printError).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('asks core to cancel the run, as the CLI', async () => {
    const sent = await cancelWith({ success: true, data: { status: 'canceling' } });
    expect(sent.event).toBe('pipelineCancel');
    expect(sent.payload.payload).toEqual({ pipelineIdentifier: 'p-1', canceledBy: 'cli' });
    expect(Printer.printMessage).toHaveBeenCalledWith(
      expect.stringContaining('ends right away')
    );
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('says when it was canceled right away, or had already ended', async () => {
    await cancelWith({ success: true, data: { status: 'canceled' } });
    expect(Printer.printMessage).toHaveBeenLastCalledWith('Run "p-1" canceled.');
    await cancelWith({ success: true, data: { status: 'not_running' } });
    expect(Printer.printMessage).toHaveBeenLastCalledWith(
      'Run "p-1" had already ended — nothing to cancel.'
    );
    expect(exit).not.toHaveBeenCalledWith(1);
  });

  it('fails with what core says', async () => {
    await cancelWith({ success: false, error: 'Run not found' });
    expect(Printer.printError).toHaveBeenCalledWith('Run not found');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
