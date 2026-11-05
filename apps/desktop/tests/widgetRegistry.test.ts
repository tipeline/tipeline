import { describe, expect, it } from 'vitest';
import { WIDGETS, isBindable } from '@/components/app/widgets/registry';

describe('which props take bindings', () => {
  const all = WIDGETS.flatMap((w) => w.fields.map((f) => ({ widget: w.type, ...f })));

  const BINDING_TYPES = ['text', 'textarea', 'json', 'data'];

  it('every text, textarea, JSON and data prop binds — the runtime resolves them all', () => {
    const notBindable = all
      .filter((f) => BINDING_TYPES.includes(f.type) && !isBindable(f))
      .map((f) => `${f.widget}.${f.key}`);
    // Only names (identifiers) opt out.
    expect(notBindable).toEqual(['tree.idKey', 'tree.labelKey', 'tree.childrenKey', 'tree.parentKey', 'tree.iconKey', 'tree.countKey', 'avatar.nameKey', 'avatar.srcKey', 'avatar.subtitleKey', 'avatar.statusKey', 'gallery.srcKey', 'gallery.captionKey', 'calendar.titleKey', 'calendar.startKey', 'calendar.endKey', 'calendar.colorKey', 'map.labelKey', 'map.latKey', 'map.lngKey', 'map.colorKey', 'map.tiles', 'timeline.timeKey', 'timeline.titleKey', 'timeline.descriptionKey', 'timeline.colorKey', 'timeline.iconKey', 'kanban.groupKey', 'kanban.titleKey', 'kanban.colorKey', 'kanban.rowKey', 'chat.runnable', 'chat.reply', 'table.sortBy', 'table.rowKey', 'runConsole.runnable', 'listView.itemName', 'listView.indexName', 'listView.itemKey']);
  });

  it('switches, numbers, selects and the nested editors don’t', () => {
    for (const f of all.filter((f) => !BINDING_TYPES.includes(f.type)))
      expect(isBindable(f)).toBe(false);
  });

  it('data props (table, chart, details, JSON viewer, tree, avatar, gallery, calendar, map, custom, timeline, kanban, list view) are data fields: JSON written in, or a binding', () => {
    expect(all.filter((f) => f.key === 'data').map((f) => `${f.widget}:${f.type}`)).toEqual([
      'tree:data',
      'avatar:data',
      'gallery:data',
      'keyValue:data',
      'calendar:data',
      'map:data',
      'custom:data',
      'timeline:data',
      'kanban:data',
      'json:data',
      'table:data',
      'chart:data',
      'listView:data',
    ]);
  });
});
