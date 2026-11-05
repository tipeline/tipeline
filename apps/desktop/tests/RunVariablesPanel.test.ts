// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import RunVariablesPanel, { type RunVariable } from '@/components/task/RunVariablesPanel.vue';

function variable(name: string, value: unknown, extra: Partial<RunVariable> = {}): RunVariable {
  return { name, value, type: 'string', scope: 'task', hidden: false, ...extra };
}

function mountPanel(variables: RunVariable[], live = false) {
  return mount(RunVariablesPanel, {
    props: { variables, live },
    global: { plugins: [i18n] },
  });
}

describe('RunVariablesPanel', () => {
  it('shows each variable with its value, objects as JSON', () => {
    const wrapper = mountPanel([
      variable('total', 42, { type: 'number' }),
      variable('customer', { id: 7, name: 'Acme' }, { type: 'object' }),
    ]);
    const text = wrapper.text();

    expect(text).toContain('total');
    expect(text).toContain('42');
    expect(text).toContain('"name": "Acme"');
    expect(text).toContain('Values at the end of the run');
  });

  it('says a hidden variable is hidden, and why, without a value or copy button', () => {
    const wrapper = mountPanel([
      variable('password', null, { hidden: true }),
      variable('dbUrl', null, { hidden: true, scope: 'env' }),
    ]);
    const text = wrapper.text();

    expect(text).toContain('Hidden — secret');
    expect(text).toContain('Hidden — from the environment');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it("explains a connection-like type that couldn't be saved", () => {
    const wrapper = mountPanel([variable('browser', null, { type: 'browser' })]);

    expect(wrapper.text()).toContain("Not saved (a browser can't be stored)");
  });

  it('labels non-workflow scopes', () => {
    const wrapper = mountPanel([variable('company', 'Acme', { scope: 'global' })]);

    expect(wrapper.text()).toContain('global');
  });

  it('filters by name once the list is long', async () => {
    const many = Array.from({ length: 8 }, (_, i) => variable(`var${i}`, i));
    const wrapper = mountPanel([...many, variable('orderTotal', 99)]);

    await wrapper.find('input').setValue('order');

    expect(wrapper.text()).toContain('orderTotal');
    expect(wrapper.text()).not.toContain('var3');
  });

  it('says the values are not final while the run is live', () => {
    const wrapper = mountPanel([variable('total', 1)], true);

    expect(wrapper.text()).toContain('they update when the run ends');
  });

  it('has an empty state', () => {
    expect(mountPanel([]).text()).toContain('This run has no variables.');
  });
});
