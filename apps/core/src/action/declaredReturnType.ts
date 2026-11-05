import { getValidation } from '@tipeline/schemas';
import { PluginReturnsRegistry } from '@/plugin/PluginReturnsRegistry';

/**
 * An action's declared output type: built-ins report it via their Zod
 * validation's `returns` meta (packages/schemas), plugins via the optional
 * `returns` export PluginLoader collects into PluginReturnsRegistry.
 * Undeclared/'any' means "no constraint". Shared by a run's destination check
 * (pipeline/Block.ts) and the assistant's workflow check (engine/WorkflowAuthoring.ts),
 * so a draft that passes the check can't fail the run on this.
 */
export function declaredReturnType(group: string, name: string, source?: string): string | undefined {
  if (source === 'plugin') {
    return PluginReturnsRegistry[group]?.[name];
  }
  try {
    return getValidation(group as any, name, 'runtime').returns;
  } catch {
    return PluginReturnsRegistry[group]?.[name];
  }
}
