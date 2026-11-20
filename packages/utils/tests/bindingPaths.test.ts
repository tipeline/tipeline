import { describe, expect, it } from 'vitest';
import { findUnfinishedPath } from '../src/bindingPaths';

const path = (text: string) => findUnfinishedPath(text)?.path ?? null;

describe('findUnfinishedPath', () => {
  it('finds a path ending in a dot or an empty []', () => {
    expect(path('{{ fetchedNode.attributes. }}')).toBe('fetchedNode.attributes.');
    expect(path('{{ a. | upcase }}')).toBe('a.');
    expect(path('{= rows[0]. =}')).toBe('rows[0].');
    expect(path('{= rows[] =}')).toBe('rows[]');
    expect(path('{% if node. %}y{% endif %}')).toBe('node.');
    expect(path('{% for x in items. %}{% endfor %}')).toBe('items.');
  });

  it('gives where it is and the binding around it', () => {
    expect(findUnfinishedPath('Hi {{ a.b. }}!')).toEqual({
      path: 'a.b.',
      from: 6,
      to: 10,
      binding: '{{ a.b. }}',
    });
  });

  it('passes finished paths and things that only look like one', () => {
    for (const ok of [
      'plain text. With dots.',
      'Hi {{ a.b }}. Bye.',
      '{{ a.b.c | default: "x." }}',
      "{{ 'end.' }}",
      '{{ a.b.[0] }}',
      '{% for i in (1..n) %}{{ i }}{% endfor %}',
      '{% for i in (n..5) %}{{ i }}{% endfor %}',
      '{{ 1.5 }}',
      '{= rows[0].name =}',
      '{{ a[0] }}',
    ])
      expect(path(ok)).toBeNull();
  });

  it('ignores text outside bindings', () => {
    expect(path('node. {{ node }}')).toBeNull();
  });
});
