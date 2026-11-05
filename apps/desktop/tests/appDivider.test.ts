// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import DividerWidget from '@/components/app/widgets/DividerWidget.vue';
import { PALETTE_BY_KEY, WIDGETS_BY_TYPE, frameOf } from '@/components/app/widgets/registry';

const mountDivider = (props: Record<string, unknown>, editable = false) =>
  mount(DividerWidget, { props: { props, componentId: 'd', editable }, global: { plugins: [i18n] } });
const lines = (w: ReturnType<typeof mount>) =>
  w.findAll('[data-testid="divider"] > span').filter((s) => s.attributes('data-testid') !== 'divider-label');

describe('DividerWidget', () => {
  it('a plain line: one segment, a separator for screen readers, in the border color', () => {
    const w = mountDivider({});
    expect(w.get('[role="separator"]').attributes('aria-orientation')).toBe('horizontal');
    expect(lines(w)).toHaveLength(1);
    expect(lines(w)[0].attributes('style')).toContain('border-top-width: 1px; border-top-style: solid; border-top-color: var(--border)');
  });

  it('a label in the middle, at the start or at the end', () => {
    const middle = mountDivider({ label: 'Billing' });
    expect(middle.get('[data-testid="divider-label"]').text()).toBe('Billing');
    expect(lines(middle)).toHaveLength(2);
    expect(middle.get('[role="separator"]').attributes('aria-label')).toBe('Billing');
    const start = mountDivider({ label: 'Billing', align: 'start' });
    expect(start.find('[data-testid="divider"] > span').attributes('data-testid')).toBe('divider-label');
    expect(lines(start)).toHaveLength(1);
    const end = mountDivider({ label: 'Billing', align: 'end' });
    expect(lines(end)).toHaveLength(1);
    expect(end.findAll('[data-testid="divider"] > span').at(-1)!.attributes('data-testid')).toBe('divider-label');
  });

  it('vertical, dashed, thicker, colored; thickness kept to 1–8', () => {
    const w = mountDivider({ orientation: 'vertical', lineStyle: 'dashed', thickness: 3, color: 'blue' });
    expect(w.get('[role="separator"]').attributes('aria-orientation')).toBe('vertical');
    expect(lines(w)[0].attributes('style')).toContain('border-left-width: 3px; border-left-style: dashed; border-left-color: #3b82f6');
    expect(lines(mountDivider({ thickness: 40 }))[0].attributes('style')).toContain('8px');
  });

  it('a spacer: nothing at run time, a faint outline in the builder', () => {
    const run = mountDivider({ lineStyle: 'none' });
    expect(run.find('[role="separator"]').exists()).toBe(false);
    expect(run.get('[data-testid="spacer"]').text()).toBe('');
    const builder = mountDivider({ lineStyle: 'none' }, true);
    expect(builder.get('[data-testid="spacer"]').classes()).toContain('border-dashed');
    expect(builder.text()).toBe('Spacer');
  });

  it('hidden when visible is false', () => {
    expect(mountDivider({ visible: 'false' }).find('.app-widget-hidden').exists()).toBe(true);
  });

  it('no card around it; Spacer is in the palette as a divider with no line', () => {
    expect(frameOf({ type: 'divider' } as any)).toBe('none');
    expect(WIDGETS_BY_TYPE.divider).toBeTruthy();
    expect(PALETTE_BY_KEY.spacer).toMatchObject({ type: 'divider', defaultProps: { lineStyle: 'none' } });
  });
});
