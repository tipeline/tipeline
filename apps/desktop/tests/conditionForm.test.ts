import { describe, expect, it } from 'vitest';
import { DependencyType } from '@/components/ui/auto-form/interface';
import {
  conditionCompareToField,
  conditionDependencies,
  operatorAfterTypeChange,
} from '@/utils/conditionForm';

const deps = conditionDependencies('secondOperand');
const active = (target: string, type: DependencyType, values: Record<string, unknown>) =>
  deps.filter((d) => d.targetField === target && d.type === type && d.when(values[d.sourceField as string], undefined));

describe('conditionCompareToField', () => {
  it('knows the condition steps and their compare-with field', () => {
    expect(conditionCompareToField('flow', 'ifConditional')).toBe('secondOperand');
    expect(conditionCompareToField('flow', 'conditionalLoop')).toBe('secondOperand');
    expect(conditionCompareToField('array', 'filter')).toBe('value');
    expect(conditionCompareToField('flow', 'caseConditional')).toBeUndefined();
    expect(conditionCompareToField('system', 'message')).toBeUndefined();
  });
});

describe('conditionDependencies', () => {
  it('hides the operator and compare-with until a type is picked', () => {
    expect(active('operator', DependencyType.HIDES, {})).toHaveLength(1);
    expect(active('secondOperand', DependencyType.HIDES, {})).toHaveLength(1);
    expect(active('operator', DependencyType.HIDES, { compareAs: 'string' })).toHaveLength(0);
  });

  it('offers only the chosen type\'s operators', () => {
    const [numberOps] = active('operator', DependencyType.SETS_OPTIONS, { compareAs: 'number' }) as any[];
    expect(numberOps.options).toContain('gt');
    expect(numberOps.options).not.toContain('startsWith');
    const [dateOps] = active('operator', DependencyType.SETS_OPTIONS, { compareAs: 'date' }) as any[];
    expect(dateOps.options).toContain('before');
  });

  it('hides compare-with for operators that take none', () => {
    expect(active('secondOperand', DependencyType.HIDES, { compareAs: 'boolean', operator: 'isTrue' })).toHaveLength(1);
    expect(active('secondOperand', DependencyType.HIDES, { compareAs: 'string', operator: 'empty' })).toHaveLength(1);
    expect(active('secondOperand', DependencyType.HIDES, { compareAs: 'string', operator: 'eq' })).toHaveLength(0);
  });

  it('names compare-with per operator', () => {
    const [label] = active('secondOperand', DependencyType.SETS_LABEL, { operator: 'startsWith' }) as any[];
    expect(label.label).toBe('Prefix');
  });

  it('shows ignore case only for text comparisons', () => {
    const hidden = (values: Record<string, unknown>) => active('ignoreCase', DependencyType.HIDES, values).length > 0;
    expect(hidden({ compareAs: 'string', operator: 'eq' })).toBe(false);
    expect(hidden({ compareAs: 'array', operator: 'contains' })).toBe(false);
    expect(hidden({ compareAs: 'number', operator: 'eq' })).toBe(true);
    expect(hidden({ compareAs: 'string', operator: 'lengthGt' })).toBe(true);
  });

  it('targets value on array steps', () => {
    expect(conditionDependencies('value').some((d) => d.targetField === 'value')).toBe(true);
  });
});

describe('operatorAfterTypeChange', () => {
  it('keeps an operator the new type has, clears one it does not', () => {
    expect(operatorAfterTypeChange('number', 'eq')).toBe('eq');
    expect(operatorAfterTypeChange('number', 'startsWith')).toBeUndefined();
    expect(operatorAfterTypeChange('array', 'contains')).toBe('contains');
    expect(operatorAfterTypeChange(undefined, 'eq')).toBeUndefined();
  });
});
