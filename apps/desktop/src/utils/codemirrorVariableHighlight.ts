import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { findVariableReferenceTokens, isKnownVariableName, localTemplateBindings } from '@/utils/templateReferences';
import { bindingSyntaxIssue, type BindingSyntaxIssue } from '@/utils/bindingSyntax';

const unknownMark = Decoration.mark({ class: 'cm-unknown-variable' });

function buildDecorations(view: EditorView, knownNames: Set<string> | null): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  const localNames = localTemplateBindings(text);
  for (const token of findVariableReferenceTokens(text)) {
    if (!isKnownVariableName(token.name, knownNames) && !localNames.has(token.name)) {
      builder.add(token.from, token.to, unknownMark);
    }
  }
  return builder.finish();
}

/**
 * Flags `{{ name }}` / `{= name =}` references, and `for`/`case` tag sources,
 * to variables that don't exist in the task — the same check TemplateField.vue
 * does for plain fields. A CodeMirror body has no innerHTML to redraw, so
 * this is a real ViewPlugin instead. `getKnownNames` is read fresh on every
 * doc change; to react to the
 * task's variable list itself changing, the caller should rebuild this
 * extension (new closure) when that list changes, which vue-codemirror picks
 * up automatically since it watches the `extensions` prop.
 */
export function unknownVariableHighlighter(getKnownNames: () => Set<string> | null) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getKnownNames());
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.view, getKnownNames());
        }
      }
    },
    { decorations: (instance) => instance.decorations }
  );
}

/**
 * Marks the first malformed binding in the document — unclosed, an unfinished path,
 * anything LiquidJS can't parse — with `bindingSyntaxIssue`, the check text fields and
 * app bindings use, and its message (from `describe`) as the tooltip — once the caret is
 * out of it, as those fields only mark on blur. Core fails the
 * action on most of these, and runs an unfinished path without a word.
 */
export function syntaxIssueHighlighter(describe: (issue: BindingSyntaxIssue) => string) {
  const build = (view: EditorView, issue: BindingSyntaxIssue | null): DecorationSet => {
    if (!issue) return Decoration.none;
    // An unclosed binding runs to the end of the document: mark its first line only.
    const to = Math.min(issue.to, view.state.doc.lineAt(issue.from).to);
    if (to <= issue.from) return Decoration.none;
    // Still being typed (`{{ cus` is unclosed until it's done): wait until the caret leaves.
    const head = view.state.selection.main.head;
    if (view.hasFocus && head >= issue.from && head <= issue.to) return Decoration.none;
    const mark = Decoration.mark({ class: 'cm-syntax-issue', attributes: { title: describe(issue) } });
    return Decoration.set([mark.range(issue.from, to)]);
  };
  return ViewPlugin.fromClass(
    class {
      // Parsed once per edit; caret moves only decide whether it shows.
      issue: BindingSyntaxIssue | null;
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.issue = bindingSyntaxIssue(view.state.doc.toString());
        this.decorations = build(view, this.issue);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.issue = bindingSyntaxIssue(update.state.doc.toString());
        if (update.docChanged || update.selectionSet || update.focusChanged)
          this.decorations = build(update.view, this.issue);
      }
    },
    { decorations: (instance) => instance.decorations }
  );
}

export const unknownVariableTheme = EditorView.baseTheme({
  '.cm-syntax-issue': {
    textDecoration: 'underline wavy',
    textDecorationColor: '#e5484d',
    textUnderlineOffset: '2px',
    backgroundColor: 'rgba(229, 72, 77, 0.1)',
  },
  // Amber like a text field's warning: only syntax errors are red (and block saving).
  '.cm-unknown-variable': {
    textDecoration: 'underline wavy',
    textDecorationColor: '#d97706',
    textUnderlineOffset: '2px',
  },
});
