import type { PluginParamDef } from '@tipeline/types';

export type { PluginParamDef };

/** group → action → param definitions */
export const PluginParamsRegistry: Record<string, Record<string, PluginParamDef[]>> = {};
