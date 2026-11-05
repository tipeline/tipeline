// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import TabsWidget from '@/components/app/widgets/TabsWidget.vue';
import { APP_CANVAS, APP_PAGE_GRID } from '@/components/app/appCanvasKey';

// A grid stand-in that shows which step is drawn.
const Grid = defineComponent({
  props: { parentId: String, tab: String },
  setup: (p) => () => h('div', { class: 'grid' }, p.tab),
});

const STEPS = {
  display: 'steps',
  tabs: [
    { id: 'who', label: 'Who' },
    { id: 'what', label: 'What' },
    { id: 'done', label: 'Confirm' },
  ],
};

function mountSteps(activeTab: string, checkStep = vi.fn(() => true), extra: Record<string, unknown> = {}) {
  const wrapper = mount(TabsWidget, {
    props: { props: { ...STEPS, ...extra }, state: { activeTab }, componentId: 'wizard' },
    global: {
      plugins: [i18n],
      provide: {
        [APP_CANVAS as symbol]: { grid: Grid },
        [APP_PAGE_GRID as symbol]: { runtime: { checkStep } },
      },
    },
  });
  return { wrapper, checkStep };
}

const button = (w: ReturnType<typeof mount>, text: string) =>
  w.findAll('button').find((b) => b.text().includes(text))!;

describe('TabsWidget as steps', () => {
  it('numbers the steps, marks done ones, and draws the current step', () => {
    const { wrapper } = mountSteps('what');
    const states = wrapper.findAll('[data-step-state]').map((b) => b.attributes('data-step-state'));
    expect(states).toEqual(['done', 'current', 'upcoming']);
    expect(wrapper.find('.grid').text()).toBe('what');
    expect(wrapper.text()).toContain('Step 2 of 3');
    // later steps can't be opened from the header
    expect(wrapper.findAll('[data-step-state]')[2].attributes('disabled')).toBeDefined();
  });

  it('Next checks the step first and moves on only when it passes', async () => {
    const failing = mountSteps('who', vi.fn(() => false));
    expect(button(failing.wrapper, 'Back')).toBeUndefined(); // no Back on the first step
    await button(failing.wrapper, 'Next').trigger('click');
    expect(failing.checkStep).toHaveBeenCalledWith('wizard', 'who');
    expect(failing.wrapper.emitted('event')).toBeUndefined();

    const passing = mountSteps('who');
    await button(passing.wrapper, 'Next').trigger('click');
    expect(passing.wrapper.emitted('event')).toEqual([['change', { activeTab: 'what' }]]);
  });

  it('Back and earlier steps in the header open without a check', async () => {
    const { wrapper, checkStep } = mountSteps('done');
    await button(wrapper, 'Back').trigger('click');
    await wrapper.findAll('[data-step-state]')[0].trigger('click');
    expect(wrapper.emitted('event')).toEqual([
      ['change', { activeTab: 'what' }],
      ['change', { activeTab: 'who' }],
    ]);
    expect(checkStep).not.toHaveBeenCalled();
  });

  it('the last step has Finish (custom label), which checks the step and fires finish', async () => {
    const { wrapper, checkStep } = mountSteps('done', undefined, { finishLabel: 'Create account' });
    expect(button(wrapper, 'Next')).toBeUndefined();
    await button(wrapper, 'Create account').trigger('click');
    expect(checkStep).toHaveBeenCalledWith('wizard', 'done');
    expect(wrapper.emitted('event')).toEqual([['finish']]);
  });

  it('display tabs (default) keeps the plain tab row', () => {
    const { wrapper } = mountSteps('who', undefined, { display: undefined });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
    expect(wrapper.find('[data-step-state]').exists()).toBe(false);
  });
});
