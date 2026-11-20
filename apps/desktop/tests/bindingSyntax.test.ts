import { describe, expect, it } from 'vitest';
import { bindingSyntaxIssue, paramSyntaxProblems } from '@/utils/bindingSyntax';

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

  it('flags a path left unfinished, which Liquid and core would run as the path before it', () => {
    expect(at('{{ fetchedNode.attributes. }}')).toEqual({
      code: 'unfinishedPath',
      part: 'fetchedNode.attributes.',
      path: 'fetchedNode.attributes.',
    });
    expect(at('{= rows[] =}')).toMatchObject({ code: 'unfinishedPath', part: 'rows[]' });
    expect(at('{% if a. %}y{% endif %}')).toMatchObject({ code: 'unfinishedPath', part: 'a.' });
  });

  it('reports a parse error before an unfinished path', () => {
    expect(at('{{ a. }} {{ b')).toMatchObject({ code: 'unclosed' });
  });
});

describe('paramSyntaxProblems', () => {
  const fields = (params: unknown, group?: string) =>
    paramSyntaxProblems(params, group).map((p) => [p.field, p.issue.code]);

  it('reports one problem per param, nested values included', () => {
    expect(
      fields({
        content: '{{ node.attributes. }}',
        title: 'Hi {{ name }}',
        body: { data: { x: ['ok', '{{ a'] } },
        count: 3,
      })
    ).toEqual([
      ['content', 'unfinishedPath'],
      ['body', 'unclosed'],
    ]);
  });

  it('leaves unknown variables alone (only syntax counts)', () => {
    expect(fields({ content: '{{ notAVariable }}' })).toEqual([]);
  });

  it("skips a flow step's inner steps, like core does", () => {
    const inner = [{ group: 'string', name: 'template', params: { content: '{{ a' } }];
    expect(fields({ actions: inner }, 'flow')).toEqual([]);
    expect(fields({ actions: inner }, 'other')).toEqual([['actions', 'unclosed']]);
  });
});
