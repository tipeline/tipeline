import type { PluginActionDocs } from '@tipeline/types';

export type { PluginActionDocs };

/** group → action → per-action description/example, shown in the builder UI */
export const PluginDocsRegistry: Record<string, Record<string, PluginActionDocs>> = {};
