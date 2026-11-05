import type { PluginFieldRule } from '@tipeline/types';

export type { PluginFieldRule };

/** group → action → cross-field rules (e.g. "require ccEmail when sendCopy is true") */
export const PluginRulesRegistry: Record<string, Record<string, PluginFieldRule[]>> = {};
