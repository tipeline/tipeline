import { describe, expect, it } from 'vitest';
import { collapseHidden, isHidden } from '@/components/app/widgets/visibility';

describe('isHidden', () => {
  it('hides an alert with no title or message', () => {
    expect(isHidden('alert', { message: '' })).toBe(true);
    expect(isHidden('alert', { message: '  ', title: '' })).toBe(true);
    expect(isHidden('alert', { message: 'Saved' })).toBe(false);
    expect(isHidden('alert', { title: 'Heads up' })).toBe(false);
  });

  it('follows `visible`', () => {
    expect(isHidden('alert', { message: 'Saved', visible: 'false' })).toBe(true);
    expect(isHidden('container', { visible: '' })).toBe(true);
    expect(isHidden('container', {})).toBe(false);
  });
});

describe('collapseHidden', () => {
  const item = (id: string, x: number, y: number, w: number, h: number) => ({
    id,
    layout: { x, y, w, h },
  });

  it('drops hidden items and moves the rows below up', () => {
    const items = [item('alert', 0, 0, 12, 7), item('table', 0, 7, 12, 30)];
    expect(collapseHidden(items, (i) => i.id === 'alert')).toEqual([item('table', 0, 0, 12, 30)]);
  });

  it('keeps rows a shown item still uses', () => {
    const items = [
      item('alert', 0, 0, 6, 7),
      item('kpi', 6, 0, 6, 4),
      item('table', 0, 7, 12, 30),
    ];
    expect(collapseHidden(items, (i) => i.id === 'alert')).toEqual([
      item('kpi', 6, 0, 6, 4),
      item('table', 0, 4, 12, 30),
    ]);
  });

  it('returns the same items when nothing is hidden', () => {
    const items = [item('a', 0, 0, 12, 7)];
    expect(collapseHidden(items, () => false)).toBe(items);
  });
});
