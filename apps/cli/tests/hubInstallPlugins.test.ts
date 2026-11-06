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

const CALENDAR = {
  group: 'googlecalendar',
  state: 'notInstalled',
  hubPlugin: { hubId: 'h1', hubName: 'Local', identifier: 'google-calendar', name: 'Google Calendar' },
};

/** Runs `tipeline hub install workflow h1 calendar-events` with Core answering each channel. */
async function installWith(replies: Record<string, any>) {
  const sent: string[] = [];
  vi.spyOn(CommandService, 'connectAndHandle').mockImplementation(((
    event: string,
    _payload: any,
    listeners: Record<string, (r: any) => void>
  ) => {
    sent.push(event);
    const [handler] = Object.values(listeners);
    handler(replies[event]);
  }) as any);
  await CommandService.hubInstall('workflow', 'h1', 'calendar-events');
  return sent;
}

const errors = () => vi.mocked(Printer.printError).mock.calls.map(([m]) => m).join('\n');

describe('tipeline hub install workflow', () => {
  let exit: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    vi.mocked(Printer.printMessage).mockReset();
    vi.mocked(Printer.printError).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('names a missing plugin with the commands to install and turn it on, and installs nothing', async () => {
    const sent = await installWith({ hubPreviewTask: { success: true, data: { missingPlugins: [CALENDAR] } } });

    expect(sent).toEqual(['hubPreviewTask']);
    expect(errors()).toContain('Workflow "calendar-events" uses plugins that aren\'t ready, so nothing was installed.');
    expect(errors()).toContain(
      'Needs Google Calendar. Install it, then turn it on: tipeline hub install plugin h1 google-calendar && tipeline plugin enable google-calendar'
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('a plugin that is installed but off: says how to turn it on', async () => {
    const off = { group: 'googlecalendar', state: 'disabled', pluginName: 'Google Calendar', pluginIdentifier: 'google-calendar' };
    await installWith({ hubPreviewTask: { success: true, data: { missingPlugins: [off] } } });

    expect(errors()).toContain('Needs Google Calendar, which is turned off. Turn it on with: tipeline plugin enable google-calendar');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('installs as before when every plugin is ready', async () => {
    const sent = await installWith({
      hubPreviewTask: { success: true, data: { missingPlugins: [] } },
      hubInstallTask: { success: true, data: { identifier: 'calendar-events' } },
    });

    expect(sent).toEqual(['hubPreviewTask', 'hubInstallTask']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('a failed check leaves the install to report the problem', async () => {
    const sent = await installWith({
      hubPreviewTask: { success: false, error: 'task "calendar-events" not found on hub "Local"' },
      hubInstallTask: { success: false, error: 'task "calendar-events" not found on hub "Local"' },
    });

    expect(sent).toEqual(['hubPreviewTask', 'hubInstallTask']);
    expect(errors()).toContain('not found on hub "Local"');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
