import { describe, expect, it } from 'vitest';
import { markersFrom } from '@/utils/appMap';

describe('markersFrom', () => {
  it('finds coordinates under the usual names, or the keys given (paths too)', () => {
    expect(markersFrom([{ name: 'A', lat: 9.9, lng: -84.1 }, { title: 'B', Latitude: '10', Lon: '-84' }])).toMatchObject([
      { lat: 9.9, lng: -84.1, label: 'A' },
      { lat: 10, lng: -84, label: 'B' },
    ]);
    expect(markersFrom([{ where: { y: 1, x: 2 }, who: 'C' }], { latKey: 'where.y', lngKey: 'where.x', labelKey: 'who' })).toMatchObject([
      { lat: 1, lng: 2, label: 'C', index: 0 },
    ]);
  });

  it('skips rows without usable coordinates, keeping the others’ positions', () => {
    const markers = markersFrom([{ lat: 'x', lng: 1 }, { lat: 95, lng: 0 }, null, { lat: 0, lng: 0, name: 'Null Island' }]);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ label: 'Null Island', index: 3 });
  });

  it('colors by a key like badges do (status words, explicit colors, a default)', () => {
    const rows = [
      { lat: 1, lng: 1, status: 'active' },
      { lat: 1, lng: 1, status: 'overdue' },
      { lat: 1, lng: 1, status: 'vip' },
    ];
    expect(markersFrom(rows, { colorKey: 'status', colors: { vip: 'purple' } }).map((m) => m.color)).toEqual(['green', 'red', 'purple']);
    expect(markersFrom(rows).map((m) => m.color)).toEqual(['blue', 'blue', 'blue']);
    expect(markersFrom(rows, { defaultColor: 'amber' })[0].color).toBe('amber');
  });

  it('one object is one marker; anything else none', () => {
    expect(markersFrom({ lat: 1, lng: 2 })).toHaveLength(1);
    expect(markersFrom('nope')).toEqual([]);
  });
});
