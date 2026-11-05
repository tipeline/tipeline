// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { invokeCore } from '@/utils/invoke';
import { toast } from '@/components/ui/sonner';
import { SEND } from '@/ipc-channels';
import { useAgentStore } from '@/store/agentStore';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  (window as any).ipcRenderer = { send: vi.fn(), on: vi.fn(), off: vi.fn(), invoke: vi.fn() };
});

function proposalTurn() {
  const agent = useAgentStore();
  agent.turns.push({
    id: 't1',
    prompt: 'run the random numbers every 40 seconds',
    phase: 'proposal',
    schedule: 'every 40 seconds',
    proposal: { identifier: 'wf-random', name: 'Random Numbers', variables: {}, inputs: [], alternatives: [] },
  } as any);
  return agent;
}

describe('scheduling a proposal', () => {
  it('creates the schedule in Core and shows it as scheduled, without running anything', async () => {
    vi.mocked(invokeCore).mockImplementation(async (channel: string) => {
      if (channel === SEND.SCHEDULE_SET) return { scheduleIdentifier: 's1', taskIdentifier: 'wf-random' };
      if (channel === SEND.SCHEDULE_LIST) {
        return [{ scheduleIdentifier: 's1', cron: null, runAt: null, everySeconds: 40, nextRunAt: '2026-10-22T16:00:40.000Z' }];
      }
    });
    const agent = proposalTurn();

    expect(await agent.scheduleProposal('t1', { count: 7 }, 'every 40 seconds')).toBe(true);

    expect(invokeCore).toHaveBeenCalledWith(SEND.SCHEDULE_SET, {
      identifier: 'wf-random',
      when: 'every 40 seconds',
      variables: { count: 7 },
    });
    expect(agent.turns[0].phase).toBe('scheduled');
    expect(agent.turns[0].scheduled).toMatchObject({ scheduleIdentifier: 's1', everySeconds: 40 });
    expect((window as any).ipcRenderer.send).not.toHaveBeenCalled();
  });

  it('keeps the proposal and says why when Core refuses', async () => {
    vi.mocked(invokeCore).mockRejectedValue(new Error('Schedules can run at most every 10 seconds.'));
    const agent = proposalTurn();

    expect(await agent.scheduleProposal('t1', {}, 'every 3 seconds')).toBe(false);
    expect(agent.turns[0].phase).toBe('proposal');
    expect(toast.error).toHaveBeenCalledWith("Couldn't create the schedule.", {
      description: 'Schedules can run at most every 10 seconds.',
    });
  });
});
