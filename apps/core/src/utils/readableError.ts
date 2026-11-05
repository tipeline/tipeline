/**
 * A step's param check fails with Zod's issue list as its message — a JSON array
 * of { path, message }. Read that way it's noise; this turns it into one line,
 * "multiplier: Must be a number…; multiplicand: …". Any other message is
 * returned unchanged.
 */
export function readableValidationError(message: string): string {
  const text = message.trim();
  if (!text.startsWith('[')) return message;
  try {
    const issues = JSON.parse(text);
    if (!Array.isArray(issues) || issues.length === 0) return message;
    if (!issues.every((issue) => issue && typeof issue.message === 'string')) return message;
    return issues
      .map((issue) => {
        const path = Array.isArray(issue.path) && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        return `${path}${issue.message}`;
      })
      .join('; ');
  } catch {
    return message;
  }
}
