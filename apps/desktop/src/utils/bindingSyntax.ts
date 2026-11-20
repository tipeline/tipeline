import { Liquid } from 'liquidjs';
import { findUnfinishedPath } from '@tipeline/utils';

// Whether a `{{ }}` / `{% %}` / `{= =}` value is well-formed, by the same rules core
// (parseParams.ts) and the app runtime (appBindings.ts) apply: `{= path =}` must be the
// whole value, and everything else is a LiquidJS template. Core fails the action on a
// broken one, and the app runtime silently renders it as '' — so without this check a
// typo like `{{ state.tab }` just does nothing.

const liquid = new Liquid({ strictVariables: false });

export type BindingSyntaxCode = 'unclosed' | 'rawNotAlone' | 'rawPath' | 'unfinishedPath' | 'invalid';

export interface BindingSyntaxIssue {
  /** The broken part, as plain-string offsets. */
  from: number;
  to: number;
  code: BindingSyntaxCode;
  /**
   * Message parameters: `closer` for unclosed, `path` (as typed) for unfinishedPath,
   * `detail` (LiquidJS's own) for invalid.
   */
  params: Record<string, string>;
}

const RAW = /^\{=\s*[\w.[\]]+\s*=\}$/;

// LiquidJS and core both run `{{ a.b. }}` / `{= a.b. =}` as `a.b`, without a word.
function unfinishedPathIssue(text: string): BindingSyntaxIssue | null {
  const found = findUnfinishedPath(text);
  return found && { from: found.from, to: found.to, code: 'unfinishedPath', params: { path: found.path } };
}

/** The first syntax problem in `text`, or null when it's fine (or has no bindings). */
export function bindingSyntaxIssue(text: string): BindingSyntaxIssue | null {
  if (text.includes('{=') && !RAW.test(text)) {
    const open = text.indexOf('{=');
    const close = text.indexOf('=}', open + 2);
    if (close === -1)
      return { from: open, to: text.length, code: 'unclosed', params: { closer: '=}' } };
    const whole = text.slice(open, close + 2) === text;
    return {
      from: open,
      to: close + 2,
      code: whole ? 'rawPath' : 'rawNotAlone',
      params: {},
    };
  }
  if (!text.includes('{{') && !text.includes('{%')) return unfinishedPathIssue(text);
  try {
    liquid.parse(text);
    return unfinishedPathIssue(text);
  } catch (e: any) {
    const message = String(e?.message ?? '').split('\n')[0].replace(/, line:\d+, col:\d+$/, '');
    let from = Math.max(0, Math.min(Number(e?.token?.begin ?? 0), text.length));
    let to = Math.max(from, Math.min(Number(e?.token?.end ?? text.length), text.length));
    if (to === from) {
      // An empty token (`{{ }}`): mark the whole binding around it.
      from = Math.max(0, text.lastIndexOf('{', from) - 1);
      const end = text.indexOf('}', to);
      to = end === -1 ? text.length : Math.min(text.length, end + 2);
    }
    if (/^output .* not closed$/.test(message))
      return { from, to, code: 'unclosed', params: { closer: '}}' } };
    if (/^tag .* not closed$/.test(message)) {
      // `{% if x` lacks its `%}`; a complete `{% if x %}` lacks its `{% endif %}`.
      const tag = text.slice(from, to);
      const name = tag.match(/^\{%-?\s*(\w+)/)?.[1];
      const closer = !tag.endsWith('%}') ? '%}' : name ? `{% end${name} %}` : '%}';
      return { from, to, code: 'unclosed', params: { closer } };
    }
    return { from, to, code: 'invalid', params: { detail: message } };
  }
}

/** How the messages show the two syntaxes (passed as params: i18n messages can't hold braces). */
export const SYNTAX_PARAMS = { raw: '{= … =}', template: '{{ … }}' };

/** The field tooltip for a syntax problem. */
export function bindingSyntaxMessage(
  t: (key: string, params: Record<string, unknown>) => string,
  issue: BindingSyntaxIssue
): string {
  return t(`expressionInput.syntax.${issue.code}`, { ...SYNTAX_PARAMS, ...issue.params });
}

export interface ParamSyntaxProblem {
  /** The step param it's in (top-level key: `content`, `body`…). */
  field: string;
  issue: BindingSyntaxIssue;
}

/**
 * The syntax problems in a step's params, one per param, walking every string the way
 * core's parseStepParams does (nested objects and lists too, but not a flow step's inner
 * steps, which are checked in their own dialogs). Core fails the step on each of these
 * when it runs, so the step dialog won't save them.
 */
export function paramSyntaxProblems(params: unknown, group?: string): ParamSyntaxProblem[] {
  if (!params || typeof params !== 'object') return [];
  const first = (value: unknown): BindingSyntaxIssue | null => {
    if (typeof value === 'string') return bindingSyntaxIssue(value);
    if (value && typeof value === 'object')
      for (const item of Object.values(value)) {
        const issue = first(item);
        if (issue) return issue;
      }
    return null;
  };
  const problems: ParamSyntaxProblem[] = [];
  for (const [field, value] of Object.entries(params)) {
    if (group === 'flow' && field === 'actions') continue;
    const issue = first(value);
    if (issue) problems.push({ field, issue });
  }
  return problems;
}
