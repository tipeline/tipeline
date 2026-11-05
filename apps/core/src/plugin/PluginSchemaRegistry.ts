import type { ZodTypeAny } from 'zod';

/**
 * group → action → the real Zod schema derived from that action's
 * PluginParamsRegistry entry (+ PluginRulesRegistry entry) by
 * @tipeline/schemas's buildPluginSchema. Built once per plugin load/reload
 * in PluginLoader, enforced by ActionFactory at Action creation time — the
 * same seam that already enforces core actions' 'creation' schemas.
 */
export const PluginSchemaRegistry: Record<string, Record<string, ZodTypeAny>> = {};
