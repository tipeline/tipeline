// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';

const store = vi.hoisted(() => ({ runProposal: vi.fn(), scheduleProposal: vi.fn(), dismissProposal: vi.fn(), switchProposal: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/store/agentStore', () => ({ useAgentStore: () => store }));
vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import AgentProposalCard from '@/components/agent/AgentProposalCard.vue';
import type { AgentTurn } from '@/store/agentStore';

const source = {
  pipeline: {
    variables: [{ type: 'number', name: 'count', label: 'Count', value: 7, visibility: 'public' }],
    actions: [],
  },
};

function mountCard(schedule?: string) {
  const turn = {
    id: 't1',
    prompt: 'i need to run the random numbers every 40 seconds',
    phase: 'proposal',
    proposal: { identifier: 'wf-random', name: 'Random Numbers', variables: {}, inputs: [], alternatives: [] },
    ...(schedule ? { schedule } : {}),
  } as AgentTurn;
  return mount(AgentProposalCard, { props: { turn }, global: { plugins: [i18n, createPinia()] }, attachTo: document.body });
}

const buttons = (w: ReturnType<typeof mountCard>) => w.findAll('button').map((b) => b.text());

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.mocked(invokeCore).mockImplementation(async (channel: string) =>
    channel === SEND.TASK_DETAIL ? { source: JSON.stringify(source) } : undefined
  );
});

describe('a proposal for an existing workflow, with a timing', () => {
  it('offers to create the schedule, reading the timing, and still to run once', async () => {
    const wrapper = mountCard('every 40 seconds');
    await flushPromises();

    expect(wrapper.find('[data-testid="proposal-schedule"]').text()).toContain('Every 40 seconds');
    expect(buttons(wrapper)).toEqual(expect.arrayContaining(['Create schedule', 'Run once now']));
  });

  it('creates the schedule with the values from the form', async () => {
    const wrapper = mountCard('every 40 seconds');
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Create schedule')!.trigger('click');
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    expect(store.scheduleProposal).toHaveBeenCalledWith('t1', { count: 7 }, 'every 40 seconds');
    expect(store.runProposal).not.toHaveBeenCalled();
  });

  it("won't create a schedule it can't read", async () => {
    const wrapper = mountCard('every 40 seconds');
    await flushPromises();
    await wrapper.find('[data-testid="proposal-schedule"] input').setValue('every 3 seconds');

    expect(wrapper.text()).toContain('Schedules can run at most every 10 seconds.');
    const create = wrapper.findAll('button').find((b) => b.text() === 'Create schedule')!;
    expect(create.attributes('disabled')).toBeDefined();
  });

  it('is a plain run proposal when the request gave no timing', async () => {
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('[data-testid="proposal-schedule"]').exists()).toBe(false);
    expect(buttons(wrapper)).toContain('Run');
    expect(buttons(wrapper)).not.toContain('Create schedule');
  });
});
