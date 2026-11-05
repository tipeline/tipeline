// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import AppField from '@/components/app/widgets/AppField.vue';
import AppColorPicker from '@/components/app/widgets/AppColorPicker.vue';
import AppColorChip from '@/components/app/widgets/AppColorChip.vue';
import InputWidget from '@/components/app/widgets/InputWidget.vue';
import KeyValueWidget from '@/components/app/widgets/KeyValueWidget.vue';
import { WIDGETS_BY_TYPE } from '@/components/app/widgets/registry';
import { formatError, validateForm } from '@/utils/appForm';
import { cssColor, hsvToRgb, normalizeColor, parseColor, rgbToHsv, swatchList, toHex } from '@/utils/appColor';

describe('color values', () => {
  it('reads hex, short hex and rgb(); stores lower-case hex', () => {
    expect(normalizeColor('#3B82F6')).toBe('#3b82f6');
    expect(normalizeColor('abc')).toBe('#aabbcc');
    expect(normalizeColor('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(normalizeColor('rgba(255 0 128 / 50%)', true)).toBe('#ff008080');
    expect(normalizeColor('#ff008080')).toBe('#ff0080'); // no alpha: opacity dropped
    expect(normalizeColor('#ff0080ff', true)).toBe('#ff0080'); // opaque: 6 digits
    expect(['red', '#12', 'rgb(300,0,0)', 7, null].map((v) => normalizeColor(v))).toEqual([null, null, null, null, null]);
  });

  it('HSV goes there and back', () => {
    for (const hex of ['#3b82f6', '#000000', '#ffffff', '#ff0000', '#22c55e']) {
      expect(toHex(hsvToRgb(rgbToHsv(parseColor(hex)!)))).toBe(hex);
    }
    expect(rgbToHsv(parseColor('#ff0000')!)).toEqual({ h: 0, s: 1, v: 1, a: 1 });
  });

  it('only colors reach a style; swatches are cleaned up', () => {
    expect(cssColor('#ff000080')).toBe('rgba(255, 0, 0, 0.502)');
    expect(cssColor('red; background: url(x)')).toBeNull();
    expect(swatchList(['#F00', 'nope', '#ff0000', 'rgb(0,0,255)'])).toEqual(['#ff0000', '#0000ff']);
    expect(swatchList('#000, #fff')).toEqual(['#000000', '#ffffff']);
  });

  it('a filled color must be one; required checks it is there', () => {
    expect(formatError('color', '#12')).toBe('invalidColor');
    expect(formatError('color', '#123')).toBeNull();
    expect(validateForm([{ name: 'c', type: 'color', required: true }], { c: null })).toEqual({ c: 'required' });
  });
});

describe('the color picker', () => {
  const mountPicker = (props: Record<string, unknown>) =>
    mount(AppColorPicker, { props: { id: 'c', modelValue: '#3b82f6', ...props } as any, global: { plugins: [i18n] }, attachTo: document.body });

  it('typing: a color is taken as it comes, not rewritten while typing; Enter commits', async () => {
    const w = mountPicker({});
    const box = w.get('[data-testid="color-text"]');
    expect((box.element as HTMLInputElement).value).toBe('#3b82f6');
    await box.setValue('#abc');
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['#aabbcc']);
    await w.setProps({ modelValue: '#aabbcc' });
    expect((box.element as HTMLInputElement).value).toBe('#abc');
    await box.trigger('keydown', { key: 'Enter' });
    expect((box.element as HTMLInputElement).value).toBe('#aabbcc');
    expect(w.emitted('commit')!.at(-1)).toEqual(['#aabbcc']);
    w.unmount();
  });

  it('the palette: swatches pick and commit; arrows move the shade, settling on key up', async () => {
    const w = mountPicker({ swatches: ['#ef4444', '#22c55e'] });
    await w.get('[data-testid="color-swatch"]').trigger('click');
    await flushPromises();
    const swatch = document.querySelector<HTMLButtonElement>('[data-testid="color-swatches"] button[aria-label="#22c55e"]')!;
    swatch.click();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['#22c55e']);
    expect(w.emitted('commit')!.at(-1)).toEqual(['#22c55e']);

    await w.setProps({ modelValue: '#ff0000' });
    const area = document.querySelector<HTMLElement>('[data-testid="color-area"]')!;
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['#e60000']); // 10% darker
    const commits = w.emitted('commit')!.length;
    area.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }));
    expect(w.emitted('commit')!.length).toBe(commits + 1);
    expect(document.querySelector('[data-testid="color-alpha"]')).toBeNull();
    w.unmount();
  });

  it('with alpha: an opacity strip and #rrggbbaa', async () => {
    const w = mountPicker({ alpha: true, modelValue: '#ff0000' });
    await w.get('[data-testid="color-swatch"]').trigger('click');
    await flushPromises();
    const strip = document.querySelector<HTMLElement>('[data-testid="color-alpha"]')!;
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['#ff0000e6']);
    w.unmount();
  });

  it('leaving text that isn’t a color keeps it and fires nothing', async () => {
    const w = mountPicker({});
    const box = w.get('[data-testid="color-text"]');
    await box.setValue('#12');
    await w.setProps({ modelValue: '#12' });
    await box.trigger('blur');
    expect((box.element as HTMLInputElement).value).toBe('#12');
    expect(w.emitted('commit')).toBeUndefined();
    expect(w.emitted('blur')).toHaveLength(1);
    w.unmount();
  });

  it('clear empties it', async () => {
    const w = mountPicker({});
    await w.get('[data-testid="color-clear"]').trigger('click');
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([null]);
    expect(w.emitted('commit')!.at(-1)).toEqual([null]);
    w.unmount();
  });

  it('a wrong color says so once the field is left', async () => {
    const w = mount(AppField, { props: { id: 'f', type: 'color', modelValue: '#12' }, global: { plugins: [i18n] }, attachTo: document.body });
    expect(w.find('[data-testid="field-error"]').exists()).toBe(false);
    await w.get('[data-testid="color-text"]').trigger('blur');
    expect(w.get('[data-testid="field-error"]').text()).toContain('#3b82f6');
    w.unmount();
  });
});

describe('Input — color', () => {
  it('its value follows the picker; change fires once it settles', () => {
    const w = mount(InputWidget, {
      props: { props: { inputType: 'color', label: 'Brand' }, state: { value: '#000000' }, componentId: 'brand' },
      global: { plugins: [i18n] },
    });
    const field = w.findComponent(AppField);
    field.vm.$emit('update:modelValue', '#111111');
    expect(w.emitted('state')).toEqual([[{ value: '#111111', error: null }]]);
    expect(w.emitted('event')).toBeUndefined();
    field.vm.$emit('commit', '#111111');
    expect(w.emitted('event')).toEqual([['change', { value: '#111111' }]]);
    w.unmount();
  });

  it('builder: opacity and swatches only for a color', () => {
    const shown = (inputType: string) =>
      WIDGETS_BY_TYPE.input.fields.filter((f) => !f.when || f.when({ inputType })).map((f) => f.key);
    expect(shown('color')).toEqual(expect.arrayContaining(['alpha', 'swatches']));
    expect(shown('text')).not.toContain('swatches');
  });
});

describe('format: color', () => {
  it('a swatch and the hex; anything else as written', () => {
    const chip = mount(AppColorChip, { props: { value: '#22C55E' } });
    expect(chip.text()).toBe('#22c55e');
    expect(chip.get('[data-testid="color-chip-swatch"]').attributes('style')).toContain('rgba(34, 197, 94, 1)');
    expect(mount(AppColorChip, { props: { value: 'teal' } }).text()).toBe('teal');
  });

  it('in Details', () => {
    const w = mount(KeyValueWidget, {
      props: { props: { data: { name: 'Ocean', primary: '#0ea5e9' }, fields: [{ key: 'name' }, { key: 'primary', format: 'color' }] }, componentId: 'd' },
      global: { plugins: [i18n] },
    });
    expect(w.get('[data-testid="color-chip"]').text()).toBe('#0ea5e9');
  });
});
