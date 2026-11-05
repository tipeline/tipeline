import { describe, expect, it } from 'vitest';
import { coreValidations } from '@tipeline/schemas';
import { fillLayouts } from '@/components/app/gridGeometry';

const item = (id: string, y: number, h: number, fill?: boolean, x = 0, w = 12) => ({
  id,
  layout: { x, y, w, h },
  ...(fill ? { fill } : {}),
});

describe('fillLayouts', () => {
  it('stretches the lowest fill item to the last row that fits', () => {
    const items = [item('kpi', 0, 10), item('table', 10, 35, true)];
    const placed = fillLayouts(items, 80);
    expect(placed[0]).toBe(items[0]);
    expect(placed[1].layout).toEqual({ x: 0, y: 10, w: 12, h: 70 });
  });

  it('leaves a fill item alone when something sits below it in its columns', () => {
    const items = [item('table', 0, 35, true), item('chart', 35, 20)];
    expect(fillLayouts(items, 80)).toEqual(items);
  });

  it('ignores what sits below in other columns, and reaches the grid bottom', () => {
    // Team Directory: the list on the left, details and a taller table on the right.
    const items = [
      item('directory', 19, 33, true, 0, 4),
      item('person', 19, 18, false, 4, 8),
      item('projects', 37, 51, false, 4, 8),
    ];
    // Window shorter than the page: down to the table's bottom (row 88).
    expect(fillLayouts(items, 60)[0].layout.h).toBe(69);
    // Window taller: down to the last row that fits.
    expect(fillLayouts(items, 100)[0].layout.h).toBe(81);
    // Not measured (e.g. a dialog): still lines up with the grid bottom.
    expect(fillLayouts(items, null)[0].layout.h).toBe(69);
    expect(fillLayouts(items, 100)[2]).toBe(items[2]);
  });

  it('never shrinks an item below its own height', () => {
    const items = [item('table', 10, 35, true)];
    expect(fillLayouts(items, 45)).toEqual(items);
    expect(fillLayouts(items, 30)).toEqual(items);
  });

  it('stretches the lowest fill item of each column', () => {
    const items = [
      item('left', 10, 20, true, 0, 6),
      item('right', 10, 20, true, 6, 6),
      item('note', 0, 10, false, 6, 6),
      item('top', 0, 10, true, 0, 6),
    ];
    const placed = fillLayouts(items, 60);
    expect(placed[0].layout.h).toBe(50);
    expect(placed[1].layout.h).toBe(50);
    expect(placed[2]).toBe(items[2]);
    // `left` sits below it.
    expect(placed[3]).toBe(items[3]);
  });

  it('does nothing without a fill item', () => {
    const plain = [item('table', 0, 35)];
    expect(fillLayouts(plain, 80)).toBe(plain);
  });
});

describe('component fill', () => {
  it('is accepted on any component', () => {
    for (const type of ['table', 'chart', 'container'] as const) {
      const parsed = coreValidations.appObject.appComponentSchema.safeParse({
        id: 'c1',
        type,
        name: 'C',
        layout: { x: 0, y: 0, w: 12, h: 35 },
        fill: true,
      });
      expect(parsed.success).toBe(true);
    }
  });
});
