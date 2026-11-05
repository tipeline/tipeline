import { computed, inject, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ExpressionAnalyzer, ExpressionReference } from '@/utils/expressionField';
import { bindingSyntaxIssue, bindingSyntaxMessage } from '@/utils/bindingSyntax';
import { bindingIssue, type BindingScope } from '@/utils/appProblems';
import { bindingReferenceTokens, bindingSegmentRanges } from '@/utils/appRefactor';
import { BINDING_SUGGESTIONS } from '@/pages/apps/builder/bindingSuggestions';

/**
 * How an app builder field marks its bindings — every app field that can hold them
 * (text fields and JSON props alike) uses this, so they all look and check the same.
 * Each binding is colored as a whole; a reference inside it the problems list would
 * report is underlined on its own (same check, so the two never disagree), and a
 * malformed binding — which renders as an empty value at runtime, silently — gets the
 * loudest mark. Call in setup: it reads the page's scope from the properties panel —
 * which, as the provider, can't inject it and passes its own `scope` instead.
 */
export function useBindingAnalyzer(
  ownScope?: Ref<BindingScope | null>
): ComputedRef<ExpressionAnalyzer> {
  const { t } = useI18n();
  const injected = inject(BINDING_SUGGESTIONS, null);

  function syntaxRefs(text: string): ExpressionReference[] {
    const syntax = bindingSyntaxIssue(text);
    if (!syntax) return [];
    const message = bindingSyntaxMessage(t, syntax);
    return [{ from: syntax.from, to: syntax.to, issue: { severity: 'error', message } }];
  }

  return computed<ExpressionAnalyzer>(() => {
    const scope = ownScope ? ownScope.value : injected?.scope.value;
    if (!scope) return (text) => [...bindingSegmentRanges(text), ...syntaxRefs(text)];
    return (text) => [
      ...bindingSegmentRanges(text),
      ...bindingReferenceTokens(text).flatMap((token) => {
        const issue = bindingIssue(token.path, scope);
        if (!issue) return [];
        const message = t(`builder.problems.codes.${issue.code}`, issue.params);
        return [{ from: token.from, to: token.to, issue: { severity: issue.severity, message } }];
      }),
      ...syntaxRefs(text),
    ];
  });
}
