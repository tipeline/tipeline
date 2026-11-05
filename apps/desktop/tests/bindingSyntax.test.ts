import { describe, expect, it } from 'vitest';
import { bindingSyntaxIssue } from '@/utils/bindingSyntax';

const at = (text: string) => {
  const issue = bindingSyntaxIssue(text);
  return issue && { code: issue.code, part: text.slice(issue.from, issue.to), ...issue.params };
};

describe('bindingSyntaxIssue', () => {
  it('passes plain text and well-formed bindings', () => {
    for (const ok of [
      'plain',
      '{{ state.tab }}',
      'Hi {{ a.b | default: "x" }}!',
      '{% if a %}y{% endif %}',
      '{= runnables.r.data =}',
      '{= rows[0].name =}',
      '{{ a }} }}', // a stray closer is just text
    ])
      expect(bindingSyntaxIssue(ok)).toBeNull();
  });

  it('flags an output missing its closer, marking just that binding', () => {
    expect(at('{{ state.tab }')).toEqual({ code: 'unclosed', part: '{{ state.tab }', closer: '}}' });
    expect(at('Hi {{ a }} and {{ b')).toEqual({ code: 'unclosed', part: '{{ b', closer: '}}' });
  });

  it('tells a tag missing %} from one missing its end tag', () => {
    expect(at('{% if x')).toMatchObject({ code: 'unclosed', closer: '%}' });
    expect(at('a {% if x %}y')).toEqual({ code: 'unclosed', part: '{% if x %}', closer: '{% endif %}' });
    expect(at('{% for r in rows %}x')).toMatchObject({ closer: '{% endfor %}' });
  });

  it('applies the {= =} rules core applies', () => {
    expect(at('Total: {= state.total =}')).toEqual({ code: 'rawNotAlone', part: '{= state.total =}' });
    expect(at('{= a b =}')).toEqual({ code: 'rawPath', part: '{= a b =}' });
    expect(at('{= state.total')).toEqual({ code: 'unclosed', part: '{= state.total', closer: '=}' });
  });

  it('reports other template errors with LiquidJS’s own message', () => {
    expect(at('{% iff x %}')).toEqual({ code: 'invalid', part: '{% iff x %}', detail: 'tag "iff" not found' });
    expect(at('x {{ }} y')).toMatchObject({ code: 'invalid', part: '{{ }}' });
  });
});
