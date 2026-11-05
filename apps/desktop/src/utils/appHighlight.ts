import { matchesCondition, type CompareAs, type ConditionOperator } from '@tipeline/utils';
import type { BadgeColor } from './appBadge';

// Table cell highlight rules and progress colorRules: the first rule a value matches
// colors it. Rules are the same conditions a workflow's If uses
// (`{ compareAs: number, operator: gt, value: 1000, color: green }`); a cell that
// can't be read as `compareAs` ("overdue" in a number column) just doesn't match.

export interface HighlightRule {
  compareAs: CompareAs;
  operator: ConditionOperator;
  value?: unknown;
  ignoreCase?: boolean;
  color: BadgeColor;
}

/** The color of the first rule `value` matches, if any. */
export function highlightColor(value: unknown, rules: unknown): BadgeColor | null {
  if (!Array.isArray(rules)) return null;
  for (const rule of rules as HighlightRule[]) {
    if (!rule) continue;
    const hit = matchesCondition({
      value,
      compareAs: rule.compareAs,
      operator: rule.operator,
      compareTo: rule.value,
      ignoreCase: rule.ignoreCase,
    });
    if (hit) return rule.color;
  }
  return null;
}
