import { Liquid } from 'liquidjs';

// Whether a `{{ }}` / `{% %}` / `{= =}` value is well-formed, by the same rules core
// (parseParams.ts) and the app runtime (appBindings.ts) apply: `{= path =}` must be the
// whole value, and everything else is a LiquidJS template. Core fails the action on a
// broken one, and the app runtime silently renders it as '' — so without this check a
// typo like `{{ state.tab }` just does nothing.

const liquid = new Liquid({ strictVariables: false });

export type BindingSyntaxCode = 'unclosed' | 'rawNotAlone' | 'rawPath' | 'invalid';

export interface BindingSyntaxIssue {
  /** The broken part, as plain-string offsets. */
  from: number;
  to: number;
  code: BindingSyntaxCode;
  /** Message parameters: `closer` for unclosed, `detail` (LiquidJS's own) for invalid. */
  params: Record<string, string>;
}

const RAW = /^\{=\s*[\w.[\]]+\s*=\}$/;

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
  if (!text.includes('{{') && !text.includes('{%')) return null;
  try {
    liquid.parse(text);
    return null;
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
