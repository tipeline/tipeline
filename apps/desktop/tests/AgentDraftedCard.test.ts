// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import AgentDraftedCard from '@/components/agent/AgentDraftedCard.vue';
import type { AgentTurn } from '@/store/agentStore';

function mountCard(incomplete?: string[]) {
  const turn: AgentTurn = {
    id: 't1',
    prompt: 'save my battery level',
    phase: 'drafted',
    draft: {
      kind: 'drafted',
      identifier: 'new-1',
      name: 'Battery Report',
      summary: '- Writes a file',
      todos: [],
      warnings: [],
      ...(incomplete ? { incomplete } : {}),
    },
  };
  return mount(AgentDraftedCard, { props: { turn }, global: { plugins: [i18n, createPinia()] } });
}

describe('AgentDraftedCard', () => {
  it('shows a complete draft as saved', () => {
    const text = mountCard().text();
    expect(text).toContain('Saved as a draft and opened in the builder.');
    expect(text).not.toContain('Incomplete draft');
  });

  it('marks an incomplete draft and lists what it leaves out', () => {
    const text = mountCard(['Reading the battery level: no action reads it.']).text();
    expect(text).toContain('Incomplete draft');
    expect(text).toContain("Saved as a draft, but it doesn't do everything you asked.");
    expect(text).toContain('Not included');
    expect(text).toContain('Reading the battery level: no action reads it.');
  });
});
