import {
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  bindingQueryAt,
  containerPrefix,
  insertBinding,
  insertPathPrefix,
  matchSuggestions,
  textEdit,
  type ExpressionSuggestion,
} from '@/utils/expressionField';

// `{{` autocomplete for CodeMirror template editors, offering exactly what ExpressionInput
// offers in a text field (same suggestions, same matching): typing `{{ cus` lists
// `customer`, picking it writes `{{ customer }}`; picking an object or list that only
// holds fitting fields types `customer.` and goes on with what's inside. Inside a Liquid
// tag (`{% if cus`, `{% for item in ord`) a pick is the bare path.

/** The variable path being typed inside an open `{% … %}` tag (after its keyword), if any. */
export function liquidTagQueryAt(text: string, caret: number): { query: string } | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf('{%');
  if (open < 0 || before.includes('%}', open)) return null;
  // The tag's keyword, a space, then the path just before the caret (after anything
  // that isn't part of a path: `{% for item in ord`, `{% if a == b`).
  const m = before.slice(open + 2).match(/^-?\s*[a-z]+\s(?:[\s\S]*[^\w.[\]])?([\w.[\]]*)$/);
  return m ? { query: m[1] } : null;
}

function dispatchLineEdit(view: EditorView, next: { text: string; caret: number }) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const edit = textEdit(line.text, next.text);
  view.dispatch({
    changes: { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert },
    selection: { anchor: line.from + next.caret },
    userEvent: 'input.complete',
  });
}

/** The caret's line and its offset in it. */
function caretLine(view: EditorView) {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return { text: line.text, caret: head - line.from };
}

// Picking a container types its prefix (`customer.`): ask again for what's inside.
function reopen(view: EditorView) {
  setTimeout(() => startCompletion(view));
}

export function expressionCompletionSource(
  getSuggestions: () => ExpressionSuggestion[] | undefined
) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const suggestions = getSuggestions();
    if (!suggestions?.length) return null;
    const line = ctx.state.doc.lineAt(ctx.pos);
    const caret = ctx.pos - line.from;
    const binding = bindingQueryAt(line.text, caret);
    const tag = binding ? null : liquidTagQueryAt(line.text, caret);
    const query = binding?.query ?? tag?.query;
    if (query === undefined) return null;
    // In a tag, wait for a letter (or Ctrl+Space): not every word there is a variable.
    if (tag && !query && !ctx.explicit) return null;

    const options = matchSuggestions(suggestions, query, 50)
      .filter((s) => !s.disabled)
      .map((s): Completion => {
        const apply = (view: EditorView, _c: Completion, from: number, to: number) => {
          if (s.container) {
            const prefix = containerPrefix(suggestions, s.path);
            if (binding) {
              const { text, caret: at } = caretLine(view);
              dispatchLineEdit(view, insertPathPrefix(text, at, prefix));
            } else
              view.dispatch({
                changes: { from, to, insert: prefix },
                selection: { anchor: from + prefix.length },
                userEvent: 'input.complete',
              });
            reopen(view);
            return;
          }
          if (binding) {
            const { text, caret: at } = caretLine(view);
            dispatchLineEdit(view, insertBinding(text, at, s.path));
          } else
            view.dispatch({
              changes: { from, to, insert: s.path },
              selection: { anchor: from + s.path.length },
              userEvent: 'input.complete',
            });
        };
        return {
          label: s.path,
          detail: s.detail,
          info: s.note,
          type: s.container ? 'namespace' : s.parent ? 'property' : 'variable',
          apply,
        };
      });
    if (!options.length) return null;
    // Already matched and ranked like ExpressionInput's list: keep that order.
    return { from: ctx.pos - query.length, options, filter: false };
  };
}

/**
 * The extension: adds the source to the autocompletion `basicSetup` already runs
 * (vue-codemirror always includes it), alongside a language's own (HTML tags, CSS).
 */
export function expressionCompletion(getSuggestions: () => ExpressionSuggestion[] | undefined) {
  const autocomplete = expressionCompletionSource(getSuggestions);
  return EditorState.languageData.of(() => [{ autocomplete }]);
}
