import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { findVariableReferenceTokens, isKnownVariableName, localTemplateBindings } from '@/utils/templateReferences';

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

export const unknownVariableTheme = EditorView.baseTheme({
  '.cm-unknown-variable': {
    textDecoration: 'underline wavy',
    textDecorationColor: '#e5484d',
    textUnderlineOffset: '2px',
  },
});
