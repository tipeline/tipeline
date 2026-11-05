import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { expressionMarks, type ExpressionAnalyzer } from '@/utils/expressionField';

function build(view: EditorView, analyze: ExpressionAnalyzer): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const mark of expressionMarks(view.state.doc.toString(), analyze))
    builder.add(
      mark.from,
      mark.to,
      Decoration.mark({
        // `cm-expression` lets the editor's theme hand its color to the syntax
        // highlighting inside (a binding usually sits in a JSON string).
        class: `cm-expression ${mark.className}`,
        attributes: mark.title ? { title: mark.title } : undefined,
      })
    );
  return builder.finish();
}

/**
 * Marks references in a CodeMirror document exactly as ExpressionInput marks them in a
 * field (same `expressionMarks`), so a binding inside JSON looks and checks the same as
 * one in a text field. Rebuilt on every edit with the analyzer `getAnalyze` returns
 * then; to re-mark an unchanged document (the analyzer's inputs changed), pass a new
 * extension — vue-codemirror reconfigures when `extensions` changes.
 */
export function expressionHighlighter(getAnalyze: () => ExpressionAnalyzer) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, getAnalyze());
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = build(update.view, getAnalyze());
      }
    },
    { decorations: (v) => v.decorations }
  );
}
