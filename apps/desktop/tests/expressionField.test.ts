// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  decorateExpression,
  domPointAt,
  matchSuggestions,
  readText,
  textEdit,
  textOffset,
  type ExpressionAnalyzer,
} from '@/utils/expressionField';

function field(html: string): HTMLDivElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('decorateExpression', () => {
  it('escapes plain text and leaves it unwrapped without an analyzer', () => {
    expect(decorateExpression('a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;');
  });

  it('wraps resolved references and marks issues with their message', () => {
    const analyze: ExpressionAnalyzer = () => [
      { from: 0, to: 7 },
      { from: 8, to: 15, issue: { severity: 'error', message: 'Unknown "y"' } },
      { from: 16, to: 23, issue: { severity: 'warning', message: 'maybe' } },
    ];
    const html = decorateExpression('{{ x }} {{ y }} {{ z }}', analyze);
    const el = field(html);
    const spans = [...el.querySelectorAll('span')];
    expect(spans.map((s) => s.textContent)).toEqual(['{{ x }}', '{{ y }}', '{{ z }}']);
    expect(spans[0].className).toContain('text-primary');
    expect(spans[0].title).toBe('');
    expect(spans[1].className).toContain('text-destructive');
    expect(spans[1].title).toBe('Unknown "y"');
    expect(spans[2].className).toContain('text-amber-600');
  });

  it('lets the worst of overlapping references win, piece by piece', () => {
    // A whole binding, with one bad path inside it.
    const text = 'Hi {{ a.b | default: c }}!';
    const analyze: ExpressionAnalyzer = () => [
      { from: 3, to: 25 },
      { from: 21, to: 22, issue: { severity: 'error', message: 'no c' } },
    ];
    const el = field(decorateExpression(text, analyze));
    const spans = [...el.querySelectorAll('span')];
    expect(spans.map((s) => s.textContent)).toEqual(['{{ a.b | default: ', 'c', ' }}']);
    expect(spans[1].className).toContain('text-destructive');
    expect(spans[0].className).toBe(spans[2].className);
    expect(readText(el)).toBe(text);
  });

  it('merges adjacent pieces that look the same and ignores out-of-range references', () => {
    const analyze: ExpressionAnalyzer = () => [
      { from: 0, to: 2 },
      { from: 2, to: 4 },
      { from: 3, to: 99 },
    ];
    expect(field(decorateExpression('abcd', analyze)).querySelectorAll('span')).toHaveLength(1);
  });
});

describe('readText', () => {
  it('reads decorated text back exactly, newlines included', () => {
    const text = 'line {{ a }}\n<b> {= c =}';
    const el = field(decorateExpression(text, () => [{ from: 5, to: 12 }]));
    expect(readText(el)).toBe(text);
  });

  it('reads <br> and Chromium <div> lines as newlines', () => {
    expect(readText(field('a<br>b'))).toBe('a\nb');
    expect(readText(field('abc<div>def</div><div>g</div>'))).toBe('abc\ndef\ng');
    expect(readText(field('abc<div><br></div><div>x</div>'))).toBe('abc\n\nx');
  });
});

describe('textOffset / domPointAt', () => {
  it('map plain-string offsets to DOM positions and back, across token spans', () => {
    const text = 'Total {{ runnables.r.data }} rows\nnext';
    const el = field(decorateExpression(text, () => [{ from: 6, to: 28 }]));
    for (let i = 0; i <= text.length; i++) {
      const point = domPointAt(el, i);
      expect(textOffset(el, point.node, point.offset)).toBe(i);
    }
  });

  it('clamps past the end', () => {
    const el = field('ab');
    expect(textOffset(el, domPointAt(el, 10).node, domPointAt(el, 10).offset)).toBe(2);
  });
});

describe('textEdit', () => {
  it('finds the smallest replacement', () => {
    expect(textEdit('Total {{ ru', 'Total {{ runnables.r.data }}')).toEqual({
      from: 11,
      to: 11,
      insert: 'nnables.r.data }}',
    });
    expect(textEdit('a {{ x }} b', 'a {{ yy }} b')).toEqual({ from: 5, to: 6, insert: 'yy' });
    expect(textEdit('same', 'same')).toEqual({ from: 4, to: 4, insert: '' });
  });
});

describe('matchSuggestions', () => {
  it('puts prefix matches before substring matches', () => {
    const s = [{ path: 'state.total' }, { path: 'table.total' }, { path: 'total' }];
    expect(matchSuggestions(s, 'tot').map((x) => x.path)).toEqual([
      'total',
      'state.total',
      'table.total',
    ]);
    expect(matchSuggestions(s, '', 2)).toHaveLength(2);
  });
});
