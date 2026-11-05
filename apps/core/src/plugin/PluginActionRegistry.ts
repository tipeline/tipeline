import type { ActionHandler } from '@action/Action';

/** group → action name → handler, for enabled plugins only (core lives in ActionRegistry). */
export const PluginActionRegistry: Record<string, Record<string, ActionHandler>> = {};
