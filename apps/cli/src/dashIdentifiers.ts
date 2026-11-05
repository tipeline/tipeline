// Older identifiers can start with "-", which Commander reads as an unknown option. They're
// masked while it parses and restored before the command runs, so they work as they are.
const IDENTIFIER_WITH_DASH = /^-[A-Za-z0-9_-]{20}$/;
const MASK = 'tipeline-dash-identifier:';

export const maskDashIdentifiers = (argv: string[]): string[] => {
  const end = argv.indexOf('--');
  return argv.map((arg, index) =>
    (end === -1 || index < end) && IDENTIFIER_WITH_DASH.test(arg) ? `${MASK}${arg}` : arg
  );
};

const unmask = (value: unknown): unknown => {
  if (typeof value === 'string' && value.startsWith(MASK)) return value.slice(MASK.length);
  return Array.isArray(value) ? value.map(unmask) : value;
};

/** Restores the identifiers in what Commander parsed. For a `preAction` hook. */
export function unmaskDashIdentifiers(command: {
  processedArgs: unknown[];
  opts(): Record<string, unknown>;
  setOptionValue(key: string, value: unknown): unknown;
}) {
  command.processedArgs = command.processedArgs.map(unmask);
  for (const [key, value] of Object.entries(command.opts())) command.setOptionValue(key, unmask(value));
}
