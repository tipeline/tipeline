import { describe, expect, it } from 'vitest';
import {
  bindingReferences,
  bindingReferenceTokens,
  bindingSegmentRanges,
  renameComponentReferences,
  renameRunnableReferences,
} from '@/utils/appRefactor';

describe('renameComponentReferences', () => {
  it('rewrites root references inside bindings only', () => {
    const value = {
      label: 'status table',
      content: 'Selected {{ table1.selectedRow.name | default: "table1" }}',
      data: '{= table1.selectedRow =}',
      rule: '{% if table1.selectedRow %}true{% endif %}',
      other: '{{ state.table1 }} {{ table10.value }} {{ mytable1.x }}',
      nested: [{ v: '{= table1 =}' }],
    };

    expect(renameComponentReferences(value, 'table1', 'records')).toEqual({
      label: 'status table',
      content: 'Selected {{ records.selectedRow.name | default: "table1" }}',
      data: '{= records.selectedRow =}',
      rule: '{% if records.selectedRow %}true{% endif %}',
      other: '{{ state.table1 }} {{ table10.value }} {{ mytable1.x }}',
      nested: [{ v: '{= records =}' }],
    });
  });
});

describe('renameRunnableReferences', () => {
  it('rewrites runnables.<old> and nothing else', () => {
    expect(
      renameRunnableReferences(
        {
          a: '{= runnables.load.outputs.rows =}',
          b: '{{ runnables.loader.data }} {{ load.value }}',
          c: 'runnables.load',
        },
        'load',
        'fetchRows'
      )
    ).toEqual({
      a: '{= runnables.fetchRows.outputs.rows =}',
      b: '{{ runnables.loader.data }} {{ load.value }}',
      c: 'runnables.load',
    });
  });
});

describe('bindingReferences', () => {
  it('lists the paths bindings mention, ignoring string literals and plain text', () => {
    expect(
      bindingReferences({
        a: 'Total {{ runnables.records.outputs.summary.total | default: "none.here" }}',
        b: '{= form1.values.email =}',
        c: '{% if state.selected %}x{% endif %} plain.text',
        d: ['{{ rows[0].name }}'],
      }).sort()
    ).toEqual(
      [
        'form1.values.email',
        'rows[0].name',
        'runnables.records.outputs.summary.total',
        'state.selected',
      ].sort()
    );
  });

  it('skips loop variables', () => {
    expect(
      bindingReferences(
        '{% for r in runnables.x.data %}{{ r.name }}{% endfor %}'
      )
    ).toEqual(['runnables.x.data']);
  });
});

describe('bindingReferenceTokens / bindingSegmentRanges', () => {
  it('locates each referenced path, skipping literals, filters and loop variables', () => {
    const text =
      'Hi {{ form1.values.name | default: "x.y" }} {% for r in runnables.a.data %}{{ r.id }}{% endfor %}';
    const tokens = bindingReferenceTokens(text);
    expect(tokens.map((t) => t.path)).toEqual(['form1.values.name', 'runnables.a.data']);
    for (const t of tokens) expect(text.slice(t.from, t.to)).toBe(t.path);
  });

  it('locates every binding segment', () => {
    const text = 'a {{ x }} b {= y =} {% if z %}';
    expect(bindingSegmentRanges(text).map((r) => text.slice(r.from, r.to))).toEqual([
      '{{ x }}',
      '{= y =}',
      '{% if z %}',
    ]);
  });
});
