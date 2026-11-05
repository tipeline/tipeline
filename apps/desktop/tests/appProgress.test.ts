// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import ProgressWidget from '@/components/app/widgets/ProgressWidget.vue';
import { progressOf } from '@/utils/appProgress';

describe('progressOf', () => {
  it('a value out of max (default 100), never below 0; text numbers count', () => {
    expect(progressOf(40, undefined)).toEqual({ value: 40, max: 100, percent: 40, fill: 40 });
    expect(progressOf('37', '50')).toEqual({ value: 37, max: 50, percent: 74, fill: 74 });
    expect(progressOf(210, 200)).toEqual({ value: 210, max: 200, percent: 105, fill: 100 });
    expect(progressOf(-5, 10).percent).toBe(0);
    expect(progressOf(5, 0).max).toBe(100); // a bad max falls back
  });

  it('nothing loaded yet is no value', () => {
    for (const v of [null, undefined, '', 'abc', NaN]) expect(progressOf(v, 10)).toEqual({ value: null, max: 10, percent: null, fill: 0 });
  });
});

describe('ProgressWidget', () => {
  const mountP = (props: Record<string, unknown>, busy = false) =>
    mount(ProgressWidget, { props: { props, busy }, global: { plugins: [i18n] } });

  it('a bar filled to the percentage, with the percent or "value / max"', () => {
    const w = mountP({ label: 'Quota', value: 37, max: 50 });
    expect(w.find('[data-testid="progress-fill"]').attributes('style')).toContain('width: 74%');
    expect(w.find('[data-testid="progress-text"]').text()).toBe('74%');
    expect(mountP({ value: 37, max: 50, showValue: 'value' }).find('[data-testid="progress-text"]').text()).toBe('37 / 50');
    expect(w.attributes('aria-valuenow')).toBe('37');
  });

  it('color rules on the percentage win over the color', () => {
    const rules = [
      { compareAs: 'number', operator: 'gte', value: 90, color: 'red' },
      { compareAs: 'number', operator: 'gte', value: 60, color: 'amber' },
    ];
    expect(mountP({ value: 95, color: 'green', colorRules: rules }).attributes('data-color')).toBe('red');
    expect(mountP({ value: 70, color: 'green', colorRules: rules }).attributes('data-color')).toBe('amber');
    expect(mountP({ value: 10, color: 'green', colorRules: rules }).attributes('data-color')).toBe('green');
    expect(mountP({ value: 10 }).attributes('data-color')).toBe('primary');
  });

  it('over max: a full bar, the real numbers, rules past 100', () => {
    const over = [{ compareAs: 'number', operator: 'gt', value: 100, color: 'red' }];
    const w = mountP({ value: 210, max: 200, colorRules: over });
    expect(w.find('[data-testid="progress-fill"]').attributes('style')).toContain('width: 100%');
    expect(w.find('[data-testid="progress-text"]').text()).toBe('105%');
    expect(w.attributes('data-color')).toBe('red');
    expect(w.attributes('aria-valuenow')).toBe('200');
    expect(mountP({ value: 210, max: 200, showValue: 'value' }).find('[data-testid="progress-text"]').text()).toBe('210 / 200');
    const ring = mountP({ value: 210, max: 200, display: 'circle' }).find('[data-testid="progress-ring"]');
    expect(Number(ring.attributes('stroke-dashoffset'))).toBeCloseTo(0);
    expect(mountP({ value: 200, max: 200, colorRules: over }).attributes('data-color')).toBe('primary');
  });

  it('a circle draws the ring to the percentage', () => {
    const w = mountP({ value: 25, display: 'circle' });
    const ring = w.find('[data-testid="progress-ring"]');
    const full = Number(ring.attributes('stroke-dasharray'));
    expect(Number(ring.attributes('stroke-dashoffset'))).toBeCloseTo(full * 0.75);
    expect(w.find('[data-testid="progress-text"]').text()).toBe('25%');
  });

  it('no value: "—", or a moving bar while its workflow loads', () => {
    expect(mountP({ value: null }).find('[data-testid="progress-text"]').text()).toBe('—');
    const loading = mountP({ value: '' }, true);
    expect(loading.find('[data-testid="progress-fill"]').exists()).toBe(false);
  });
});
