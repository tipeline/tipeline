import cronParser from 'cron-parser';

/**
 * When a schedule fires next, as an ISO string — null for a paused schedule or a cron
 * the parser can't read. Both runners fire on the machine's local clock, so this does too.
 */
export function nextRunAt(cron: string, enabled: boolean, from: Date = new Date()): string | null {
  if (!enabled) return null;
  try {
    return cronParser.parseExpression(cron, { currentDate: from }).next().toDate().toISOString();
  } catch {
    return null;
  }
}
