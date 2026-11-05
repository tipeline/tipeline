// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';

const store = vi.hoisted(() => ({
  draft: vi.fn(),
  dismissProposal: vi.fn(),
  removeReuse: vi.fn(),
  adoptInstalledReuse: vi.fn(),
}));
vi.mock('@/store/agentStore', () => ({ useAgentStore: () => store }));
const invokeCore = vi.hoisted(() => vi.fn());
vi.mock('@/utils/invoke', () => ({ invokeCore }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import AgentNoMatchCard from '@/components/agent/AgentNoMatchCard.vue';
import { SEND } from '@/ipc-channels';
import type { AgentTurn } from '@/store/agentStore';

const hub = { id: 'main', name: 'Main hub', itemIdentifier: 'send-email', version: '1.0.0' };

function mountCard(extra: Partial<AgentTurn> = {}) {
  const turn: AgentTurn = {
    id: 't1',
    prompt: 'email me the versions',
    phase: 'nomatch',
    text: 'No single workflow does all of this.',
    draftRequest: 'Gets the PHP version and emails it.',
    ...extra,
  };
  return mount(AgentNoMatchCard, { props: { turn }, global: { plugins: [i18n, createPinia()] } });
}

const button = (wrapper: ReturnType<typeof mountCard>, text: string) =>
  wrapper.findAll('button').find((b) => b.text().includes(text) || b.attributes('aria-label') === text)!;

describe('AgentNoMatchCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the schedule apart from the description, and drafts with it', async () => {
    const wrapper = mountCard({ draftRequest: 'Generates random numbers.', schedule: 'every 30 seconds' });
    const box = wrapper.find('[data-testid="nomatch-schedule"]');

    expect(box.text()).toContain('Runs on its own');
    expect(box.text()).toContain('Every 30 seconds');
    await button(wrapper, 'Draft this workflow').trigger('click');
    expect(store.draft).toHaveBeenCalledWith('t1', 'Generates random numbers.', [], 'every 30 seconds');
  });

  it('lets the schedule be edited or cleared, and refuses one it cannot read', async () => {
    const wrapper = mountCard({ schedule: 'every 30 seconds' });
    const input = wrapper.find('[data-testid="nomatch-schedule"] input');

    await input.setValue('every 5 seconds');
    expect(wrapper.text()).toContain('Schedules can run at most every 10 seconds.');
    expect(button(wrapper, 'Draft this workflow').attributes('disabled')).toBeDefined();

    await input.setValue('');
    await button(wrapper, 'Draft this workflow').trigger('click');
    expect(store.draft).toHaveBeenCalledWith('t1', 'Gets the PHP version and emails it.', [], '');
  });

  it('shows no schedule box when the request gave no timing', () => {
    expect(mountCard().find('[data-testid="nomatch-schedule"]').exists()).toBe(false);
  });

  it('shows no workflow list when there is nothing to reuse', () => {
    expect(mountCard({ reuse: [] }).text()).not.toContain('Uses your workflows');
  });

  it('lists the workflows to reuse, with an install button only for ones on a hub', () => {
    const wrapper = mountCard({
      reuse: [
        { identifier: 'php-version', name: 'Get PHP Version' },
        { identifier: 'hub:main:send-email', name: 'Send Email', hub },
      ],
    });
    const text = wrapper.text();

    expect(text).toContain('Uses your workflows');
    expect(text).toContain('Get PHP Version');
    expect(text).toContain('From Main hub · not installed');
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Install')).toHaveLength(1);
    expect(text).toContain('the draft builds this part itself');
  });

  it('installs a hub workflow and hands the installed copy to the store', async () => {
    invokeCore.mockResolvedValue({ identifier: 'send-email-1', name: 'Send Email' });
    const wrapper = mountCard({ reuse: [{ identifier: 'hub:main:send-email', name: 'Send Email', hub }] });

    await button(wrapper, 'Install').trigger('click');
    await flushPromises();

    expect(invokeCore).toHaveBeenCalledWith(SEND.HUB_INSTALL_TASK, { hubId: 'main', itemIdentifier: 'send-email' });
    expect(store.adoptInstalledReuse).toHaveBeenCalledWith('t1', 'hub:main:send-email', {
      identifier: 'send-email-1',
      name: 'Send Email',
    });
  });

  it('leaves a workflow out when its remove button is clicked', async () => {
    const wrapper = mountCard({ reuse: [{ identifier: 'php-version', name: 'Get PHP Version' }] });

    await button(wrapper, 'Leave out Get PHP Version').trigger('click');

    expect(store.removeReuse).toHaveBeenCalledWith('t1', 'php-version');
  });
});

describe('AgentNoMatchCard when drafting stopped', () => {
  beforeEach(() => vi.clearAllMocks());

  const gap = {
    missing: ['Reading the battery level: no action reads it.'],
    possible: 'Writes a file with the date.',
  };

  it("says what can't be done, what the rest would do, and that nothing was saved", () => {
    const text = mountCard({ draftGap: gap }).text();

    expect(text).toContain("It can't do all of this");
    expect(text).toContain('Reading the battery level: no action reads it.');
    expect(text).toContain('Without it, the workflow would: Writes a file with the date.');
    expect(text).toContain('Nothing was saved.');
  });

  it('drafts the rest, accepting what is missing, or tries again without accepting it', async () => {
    const wrapper = mountCard({ draftGap: gap });

    await button(wrapper, 'Create incomplete draft').trigger('click');
    expect(store.draft).toHaveBeenLastCalledWith('t1', 'Gets the PHP version and emails it.', gap.missing, '');

    await button(wrapper, 'Try again').trigger('click');
    expect(store.draft).toHaveBeenLastCalledWith('t1', 'Gets the PHP version and emails it.', [], '');
  });

  it('offers no incomplete draft until drafting has stopped', () => {
    expect(mountCard().text()).not.toContain('Create incomplete draft');
  });
});
