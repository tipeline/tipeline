import { describe, expect, it } from 'vitest';
import {
  MAX_SLICES,
  OTHER_COLOR,
  SERIES_COLORS,
  funnelShare,
  shapeChart,
  shapeHeatmap,
  sparkPoints,
  sparkValues,
} from '@/utils/appChart';

const rows = [
  { month: 'Jan', revenue: 100, cost: 60, note: 'x' },
  { month: 'Feb', revenue: '120', cost: 70, note: 'y' },
];

describe('shapeChart', () => {
  it('bar/line: one dataset per series, colored by series position', () => {
    const shaped = shapeChart(
      'bar',
      rows,
      'month',
      [{ key: 'revenue', label: 'Revenue' }, { key: 'cost' }],
      'light'
    );
    expect(shaped.labels).toEqual(['Jan', 'Feb']);
    expect(shaped.datasets).toEqual([
      {
        key: 'revenue',
        label: 'Revenue',
        data: [100, 120],
        color: SERIES_COLORS.light[0],
      },
      {
        key: 'cost',
        label: 'cost',
        data: [60, 70],
        color: SERIES_COLORS.light[1],
      },
    ]);
  });

  it('infers numeric series when none are configured', () => {
    expect(
      shapeChart('line', rows, 'month', undefined, 'dark').datasets.map((d) => [
        d.key,
        d.color,
      ])
    ).toEqual([
      ['revenue', SERIES_COLORS.dark[0]],
      ['cost', SERIES_COLORS.dark[1]],
    ]);
  });

  it('keeps a series color when other rows are filtered out (never by rank)', () => {
    const all = shapeChart(
      'bar',
      rows,
      'month',
      [{ key: 'revenue' }, { key: 'cost' }],
      'light'
    );
    const filtered = shapeChart(
      'bar',
      rows.slice(1),
      'month',
      [{ key: 'revenue' }, { key: 'cost' }],
      'light'
    );
    expect(filtered.datasets.map((d) => d.color)).toEqual(
      all.datasets.map((d) => d.color)
    );
  });

  it('pie: slices in fixed color order, past eight folded into "Other"', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      name: `S${i + 1}`,
      value: i + 1,
    }));
    const shaped = shapeChart(
      'pie',
      many,
      'name',
      [{ key: 'value' }],
      'light',
      'Otros'
    );
    expect(shaped.labels).toHaveLength(MAX_SLICES);
    expect(shaped.labels.at(-1)).toBe('Otros');
    expect(shaped.datasets[0].data.at(-1)).toBe(8 + 9 + 10 + 11);
    expect(shaped.datasets[0].colors).toEqual([
      ...SERIES_COLORS.light.slice(0, MAX_SLICES - 1),
      OTHER_COLOR.light,
    ]);
    expect(shaped.rows.at(-1)).toBeNull();
    expect(shaped.rows[0]).toEqual(many[0]);
  });

  it('non-numeric values plot as 0 rather than breaking the chart', () => {
    expect(
      shapeChart('bar', [{ m: 'a', v: 'n/a' }], 'm', [{ key: 'v' }], 'light')
        .datasets[0].data
    ).toEqual([0]);
  });
});

describe('shapeChart: scatter', () => {
  it('keeps rows with a numeric x and gives each series x/y points', () => {
    const data = [
      { hours: 2, score: 60, name: 'a' },
      { hours: 'n/a', score: 70, name: 'b' },
      { hours: '5', score: 90, name: 'c' },
    ];
    const shaped = shapeChart('scatter', data, 'hours', [{ key: 'score' }], 'light');
    expect(shaped.rows).toEqual([data[0], data[2]]);
    expect(shaped.datasets[0].points).toEqual([
      { x: 2, y: 60 },
      { x: 5, y: 90 },
    ]);
  });

  it('has nothing without an x key', () => {
    expect(shapeChart('scatter', rows, undefined, undefined, 'light').rows).toEqual([]);
  });
});

describe('shapeChart: funnel', () => {
  const stages = [
    { stage: 'Visits', count: 1000, other: 1 },
    { stage: 'Signups', count: 300, other: 2 },
    { stage: 'Paid', count: 450, other: 3 },
  ];

  it('uses the first series only, in the order given (never sorted)', () => {
    const shaped = shapeChart('funnel', stages, 'stage', undefined, 'light');
    expect(shaped.labels).toEqual(['Visits', 'Signups', 'Paid']);
    expect(shaped.datasets).toHaveLength(1);
    expect(shaped.datasets[0].data).toEqual([1000, 300, 450]);
  });

  it('gives each stage its share of the first', () => {
    expect(funnelShare([1000, 300], 1)).toBe(0.3);
    expect(funnelShare([0, 5], 1)).toBe(0);
  });
});

describe('shapeHeatmap', () => {
  const data = [
    { day: 'Mon', hour: '9', tickets: 3 },
    { day: 'Mon', hour: '10', tickets: 5 },
    { day: 'Tue', hour: '9', tickets: 1 },
    { day: 'Mon', hour: '9', tickets: 2 },
    { day: '', hour: '9', tickets: 99 },
  ];

  it('builds rows × columns in first-seen order, adding up shared cells', () => {
    const heat = shapeHeatmap(data, 'hour', 'day', 'tickets');
    expect(heat.xs).toEqual(['9', '10']);
    expect(heat.ys).toEqual(['Mon', 'Tue']);
    expect(heat.cells.get('Mon\u00009')?.value).toBe(5);
    expect(heat.cells.get('Tue\u000010')).toBeUndefined();
    expect([heat.min, heat.max]).toEqual([1, 5]);
  });

  it('counts rows when there is no value key', () => {
    const heat = shapeHeatmap(data, 'hour', 'day', undefined);
    expect(heat.cells.get('Mon\u00009')?.value).toBe(2);
  });

  it('is empty without both keys', () => {
    expect(shapeHeatmap(data, 'hour', undefined, 'tickets').cells.size).toBe(0);
  });
});

describe('sparklines', () => {
  it('takes numbers, or a key of rows, skipping what is not a number', () => {
    expect(sparkValues([1, '2', 'x', null, 4])).toEqual([1, 2, 4]);
    expect(sparkValues([{ v: 3 }, { v: '5' }, { w: 1 }], 'v')).toEqual([3, 5]);
    expect(sparkValues('nope')).toEqual([]);
  });

  it('fits the points in the box (highest at the top), flat when all are equal', () => {
    expect(sparkPoints([0, 10], 100, 20)).toBe('2.0,18.0 98.0,2.0');
    expect(sparkPoints([4, 4, 4], 100, 20)).toBe('2.0,10.0 50.0,10.0 98.0,10.0');
    expect(sparkPoints([1], 100, 20)).toBe('');
  });
});
