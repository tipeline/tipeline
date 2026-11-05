import type { ComputedRef, InjectionKey } from 'vue';
import type { BindingSuggestion } from '@/utils/appSuggestions';
import type { BindingScope } from '@/utils/appProblems';

/** Binding autocomplete entries for the page being edited, provided by the properties panel. */
export const BINDING_SUGGESTIONS: InjectionKey<{
  /** Anywhere on the page. */
  page: ComputedRef<BindingSuggestion[]>;
  /** Inside a runnable's On success / On error (adds result.* and error.message). */
  handler: ComputedRef<BindingSuggestion[]>;
  /** What the page's bindings resolve against — binding fields underline the ones that don't. */
  scope: ComputedRef<BindingScope | null>;
}> = Symbol('appBindingSuggestions');
