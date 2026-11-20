// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxIssueHighlighter } from '@/utils/codemirrorVariableHighlight';

function marks(doc: string) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [syntaxIssueHighlighter((issue) => `${issue.code}: ${issue.params.path ?? ''}`)],
    }),
    parent: document.body,
  });
  const found = [...view.dom.querySelectorAll('.cm-syntax-issue')].map((el) => ({
    text: el.textContent,
    title: el.getAttribute('title'),
  }));
  view.destroy();
  return found;
}

describe('syntaxIssueHighlighter', () => {
  it('marks an unfinished path with its message', () => {
    expect(marks('<p>{{ node.attributes. }}</p>')).toEqual([
      { text: 'node.attributes.', title: 'unfinishedPath: node.attributes.' },
    ]);
  });

  it('marks only the first line of an unclosed binding', () => {
    expect(marks('{{ title\n<p>more</p>')).toEqual([{ text: '{{ title', title: 'unclosed: ' }]);
  });

  it('leaves a well-formed template alone', () => {
    expect(marks('{% for o in orders %}{{ o.name }}{% endfor %}')).toEqual([]);
  });
});
