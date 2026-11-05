import type { VariableType } from '@tipeline/types';

/** group → action → declared output type (omitted/absent means "any") */
export const PluginReturnsRegistry: Record<string, Record<string, VariableType | 'any'>> = {};
