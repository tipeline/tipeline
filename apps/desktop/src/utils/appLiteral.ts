import { coreValidations } from '@tipeline/schemas';

// Props kept exactly as written (a custom component's code): bindings in them are the
// code's own, so they're never resolved, checked or renamed (APP_LITERAL_PROPS).

const LITERAL = coreValidations.appObject.APP_LITERAL_PROPS as Partial<Record<string, readonly string[]>>;

export const literalProps = (type: string): readonly string[] => LITERAL[type] ?? [];

/** A component's props run through `rewrite`, its literal ones left as they are. */
export function mapBindableProps<T extends Record<string, unknown>>(
  type: string,
  props: T,
  rewrite: (bindable: Record<string, unknown>) => Record<string, unknown>
): T {
  const literal = literalProps(type);
  if (!literal.length) return rewrite(props) as T;
  const kept: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props ?? {})) (literal.includes(key) ? kept : rest)[key] = value;
  return { ...rewrite(rest), ...kept } as T;
}
