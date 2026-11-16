// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useAgentStore } from '@/store/agentStore';
import { useConnectionStore } from '@/store/connectionStore';

// On a Server workspace the Server's own Assistant answers: no key on this machine, the
// request goes to the Server, and its run, picks and history are the Server's.
const listeners = new Map<string, (event: unknown, response: any) => void>();
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  listeners.clear();
  (window as any).ipcRenderer = {
    send: vi.fn(),
    on: vi.fn((channel: string, handler: any) => listeners.set(channel, handler)),
    off: vi.fn((channel: string) => listeners.delete(channel)),
    invoke: vi.fn(),
  };
  const connection = useConnectionStore();
  connection.activeId = 'server-1';
  connection.serverMe = { id: 'u-ed', email: 'ed@acme.com', name: 'Ed', role: 'editor' };
});

const sent = () => vi.mocked((window as any).ipcRenderer.send).mock.calls;

describe('the Assistant on a Server workspace', () => {
  it('asks the Server, with no key set on this machine', async () => {
    const agent = useAgentStore();
    expect(agent.configured).toBe(true);
    expect(await agent.submit('greet a client')).toBe(true);

    expect(sent()).toHaveLength(1);
    const [channel, message] = sent()[0];
    expect(channel).toBe(SEND.ASSISTANT_ASK);
    expect(message.payload).toEqual({ prompt: 'greet a client' });
    expect(agent.turns[0]).toMatchObject({ prompt: 'greet a client', phase: 'thinking' });
  });

  it("runs the proposal as part of the Server's request", async () => {
    const agent = useAgentStore();
    await agent.submit('greet a client');
    const id = agent.turns[0].id;
    listeners.get(`agent:${id}`)!(null, {
      requestId: 'req-1',
      phase: 'proposal',
      text: "I'd run Greet a client.",
      proposal: { identifier: 'wf-greet', name: 'Greet a client', variables: { client: 'Northwind' }, inputs: [], alternatives: [] },
    });
    expect(agent.turns[0]).toMatchObject({ phase: 'proposal', requestId: 'req-1' });

    await agent.runProposal(id, { client: 'Northwind' });
    const [channel, message] = sent()[1];
    expect(channel).toBe(SEND.ASSISTANT_RUN);
    expect(message).toEqual({
      correlationId: id,
      payload: { requestId: 'req-1', identifier: 'wf-greet', name: 'Greet a client', variables: { client: 'Northwind' } },
    });

    listeners.get(`agent:${id}`)!(null, { requestId: 'req-1', phase: 'done', result: { status: 'completed', outputs: {} }, answer: 'Done.' });
    expect(agent.turns[0]).toMatchObject({ phase: 'done', answer: 'Done.' });
  });

  it("remembers a pick on the Server, per user, not in this machine's settings", async () => {
    vi.mocked(invokeCore).mockResolvedValue(undefined);
    const agent = useAgentStore();
    agent.turns.push({
      id: 't1',
      prompt: 'greet',
      phase: 'choice',
      requestKey: 'greet',
      choice: {
        options: [
          { identifier: 'wf-a', name: 'Greet A', inputs: [] },
          { identifier: 'wf-b', name: 'Greet B', inputs: [] },
        ],
        variables: {},
      },
    } as any);
    agent.choose('t1', 'wf-b');
    await vi.waitFor(() =>
      expect(invokeCore).toHaveBeenCalledWith(SEND.ASSISTANT_CHOOSE, { requestKey: 'greet', identifier: 'wf-b', name: 'Greet B' })
    );
    expect(invokeCore).not.toHaveBeenCalledWith(SEND.SETTINGS_SET, expect.anything());
  });

  it("shows the Server's history", async () => {
    vi.mocked(invokeCore).mockResolvedValue([
      {
        id: 'req-1',
        prompt: 'greet a client',
        status: 'completed',
        taskIdentifier: 'wf-greet',
        taskName: 'Greet a client',
        pipelineIdentifier: 'p1',
        answer: 'Done.',
        error: null,
        createdAt: '2026-11-15T10:00:00Z',
        updatedAt: '2026-11-15T10:00:05Z',
        user: { id: 'u-ed', email: 'ed@acme.com', name: 'Ed' },
      },
    ]);
    const agent = useAgentStore();
    await agent.loadHistory();
    expect(invokeCore).toHaveBeenCalledWith(SEND.ASSISTANT_HISTORY, {});
    expect(agent.history[0]).toMatchObject({
      correlation_id: 'req-1',
      status: 'done',
      task_name: 'Greet a client',
      pipeline_identifier: 'p1',
      finished_at: '2026-11-15T10:00:05Z',
    });
  });

  it('is not offered to viewers', () => {
    useConnectionStore().serverMe = { id: 'u-vi', email: 'vi@acme.com', name: 'Vi', role: 'viewer' };
    expect(useConnectionStore().assistantAvailable).toBe(false);
  });
});
