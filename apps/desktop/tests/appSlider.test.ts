// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import AppField from '@/components/app/widgets/AppField.vue';
import InputWidget from '@/components/app/widgets/InputWidget.vue';
import { WIDGETS_BY_TYPE } from '@/components/app/widgets/registry';
import { validateForm } from '@/utils/appForm';
import { formatSliderNumber, sliderBounds, sliderInitial, sliderPositions, sliderValue } from '@/utils/appSlider';

describe('slider values', () => {
  it('bounds default to 0..100 step 1; a max below min is swapped; bindings resolved to text count', () => {
    expect(sliderBounds()).toEqual({ min: 0, max: 100, step: 1, range: false });
    expect(sliderBounds({ min: '50', max: 10, step: 0, range: 'true' })).toEqual({ min: 10, max: 50, step: 1, range: true });
  });

  it('keeps one value inside the bounds and on the step (no float noise)', () => {
    const b = sliderBounds({ min: 0, max: 1, step: 0.1 });
    expect(sliderPositions(0.30000000000000004, b)).toEqual([0.3]);
    expect(sliderPositions(7, b)).toEqual([1]);
    expect(sliderPositions('x', b)).toEqual([0]);
    expect(sliderValue([0.7], b)).toBe(0.7);
  });

  it('a range is [from, to] in order, from typed text too, filling missing ends with min / max', () => {
    const b = sliderBounds({ max: 2000, step: 50, range: true });
    expect(sliderPositions([1200, 300], b)).toEqual([300, 1200]);
    expect(sliderPositions('[310, 1190]', b)).toEqual([300, 1200]);
    expect(sliderPositions('300, 1200', b)).toEqual([300, 1200]);
    expect(sliderPositions(null, b)).toEqual([0, 2000]);
    expect(sliderValue([500, 100], b)).toEqual([100, 500]);
    expect(sliderInitial(undefined, { range: true, min: 5, max: 9 })).toEqual([5, 9]);
    // required without a default: unanswered until touched
    expect(sliderInitial(undefined, { required: true })).toBeNull();
    expect(sliderInitial(3, { required: true })).toBe(3);
  });

  it('shows money with currency, else the number and its unit', () => {
    expect(formatSliderNumber(1200, { currency: 'USD', locale: 'en' })).toBe('$1,200');
    expect(formatSliderNumber(12, { unit: 'km', locale: 'en' })).toBe('12 km');
    expect(formatSliderNumber(80, { unit: '%', locale: 'en' })).toBe('80%');
    expect(formatSliderNumber(0.5, { step: 0.1, locale: 'en' })).toBe('0.5');
  });

  it('a required slider is filled once it has a value', () => {
    expect(validateForm([{ name: 's', type: 'slider', required: true }], { s: 0 })).toEqual({});
    expect(validateForm([{ name: 's', type: 'slider', required: true }], { s: null })).toEqual({ s: 'required' });
  });
});

describe('AppField — slider', () => {
  // reka fills the handles' aria values a moment after mounting.
  const field = async (props: Record<string, unknown>) => {
    const w = mount(AppField, { props: { id: 'f', type: 'slider', label: 'Price', ...props } as any, global: { plugins: [i18n] }, attachTo: document.body });
    await new Promise((r) => setTimeout(r, 10));
    return w;
  };

  it('shows where it is next to the label, and moves with the arrow keys', async () => {
    const w = await field({ modelValue: 40, unit: 'km', step: 5 });
    expect(w.get('[data-testid="slider-value"]').text()).toBe('40 km');
    const thumb = w.get('[role="slider"]');
    expect(thumb.attributes('aria-valuenow')).toBe('40');
    expect(thumb.attributes('aria-label')).toBe('Price');
    await thumb.trigger('focus');
    await thumb.trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([45]);
    w.unmount();
  });

  it('a range has two named handles and gives back [from, to]', async () => {
    const w = await field({ modelValue: [300, 1200], range: true, max: 2000, step: 50, currency: 'USD' });
    expect(w.get('[data-testid="slider-value"]').text()).toBe('$300 – $1,200');
    const thumbs = w.findAll('[role="slider"]');
    expect(thumbs.map((t) => t.attributes('aria-label'))).toEqual(['Price: from', 'Price: to']);
    // the handle with focus is the one that moves
    await thumbs[1].trigger('focus');
    await thumbs[1].trigger('keydown', { key: 'ArrowLeft' });
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([[300, 1150]]);
    w.unmount();
  });

  it('unanswered (required, no default) shows "–"; the first touch answers it, even at min', async () => {
    const w = await field({ modelValue: null, max: 10, required: true });
    expect(w.get('[data-testid="slider-value"]').text()).toBe('–');
    expect(w.get('[data-slot="slider"]').attributes('data-unset')).toBeDefined();
    const thumb = w.get('[role="slider"]');
    await thumb.trigger('focus');
    await thumb.trigger('keydown', { key: 'ArrowLeft' }); // already at 0: still answers 0
    expect(w.emitted('update:modelValue')?.[0]).toEqual([0]);
    w.unmount();
  });

  it('in the builder it is shown but cannot move', async () => {
    const w = await field({ modelValue: 10, editable: true });
    expect(w.get('[data-slot="slider"]').attributes('data-disabled')).toBeDefined();
    w.unmount();
  });
});

describe('builder: Input settings by type', () => {
  const shown = (inputType: string) =>
    WIDGETS_BY_TYPE.input.fields.filter((f) => !f.when || f.when({ inputType })).map((f) => f.key);

  it('slider settings only for a slider; currency, language and format only where they apply', () => {
    expect(shown('slider')).toEqual(expect.arrayContaining(['min', 'max', 'step', 'range', 'unit', 'currency']));
    expect(shown('slider')).not.toContain('language');
    expect(shown('text')).not.toEqual(expect.arrayContaining(['min']));
    expect(shown('text').filter((k) => ['min', 'currency', 'language', 'format'].includes(k))).toEqual([]);
    expect(shown('code')).toContain('language');
    expect(shown('richtext')).toContain('format');
    expect(shown('currency')).toContain('currency');
  });
});

describe('Input — slider', () => {
  it('its value follows every move; change fires once it settles', async () => {
    const w = mount(InputWidget, {
      props: { props: { inputType: 'slider', label: 'Distance', max: 50 }, state: { value: 10 }, componentId: 'distance' },
      global: { plugins: [i18n] },
    });
    const field = w.findComponent(AppField);
    field.vm.$emit('update:modelValue', 11);
    field.vm.$emit('update:modelValue', 12);
    expect(w.emitted('state')).toEqual([[{ value: 11, error: null }], [{ value: 12, error: null }]]);
    expect(w.emitted('event')).toBeUndefined();
    field.vm.$emit('commit', 12);
    expect(w.emitted('event')).toEqual([['change', { value: 12 }]]);
    w.unmount();
  });
});
