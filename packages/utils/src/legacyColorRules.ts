// Upgrades app color rules written before they shared the workflow condition format.
// Used by the app schema v3 → v4 migration.

const isNumeric = (v: unknown) =>
  (typeof v === 'number' && !Number.isNaN(v)) ||
  (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.trim())));
const looksLikeDate = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) && !Number.isNaN(new Date(v.trim()).getTime());

const HIGHLIGHT_OPS: Record<string, string> = {
  '=': 'eq',
  '!=': 'neq',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  contains: 'contains',
  empty: 'empty',
  notEmpty: 'notEmpty',
};
const DATE_ORDER: Record<string, string> = { gt: 'after', gte: 'afterOrEqual', lt: 'before', lte: 'beforeOrEqual' };

/**
 * Upgrades an app color rule `{ when: '>', value, color }` to
 * `{ compareAs, operator, value, color }`. Text comparisons ignored case before,
 * so they keep doing so.
 */
export function upgradeHighlightRule(rule: any): any {
  if (!rule || typeof rule !== 'object' || !('when' in rule) || 'operator' in rule) return rule;
  const { when, ...rest } = rule;
  const operator = HIGHLIGHT_OPS[when as string];
  if (!operator) return rule;

  if (operator === 'empty' || operator === 'notEmpty') return { compareAs: 'string', operator, ...rest };
  if (operator === 'contains') return { compareAs: 'string', operator, ignoreCase: true, ...rest };
  if (isNumeric(rule.value)) return { compareAs: 'number', operator, ...rest };
  if (operator in DATE_ORDER && looksLikeDate(rule.value))
    return { compareAs: 'date', operator: DATE_ORDER[operator], ...rest };
  if (operator === 'eq' || operator === 'neq')
    return { compareAs: 'string', operator, ignoreCase: true, ...rest };
  return { compareAs: 'number', operator, ...rest };
}
