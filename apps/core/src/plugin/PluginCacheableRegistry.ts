/**
 * group → the plugin's version and the actions it says can be cached (its optional
 * `cacheable: ['action', …]` export). A plugin action is never cached unless listed
 * here; the version goes into the cache key, so updating the plugin starts fresh.
 */
export const PluginCacheableRegistry: Record<string, { version: string; actions: string[] }> = {};

export const isPluginActionCacheable = (group: string, name: string): boolean =>
  PluginCacheableRegistry[group]?.actions.includes(name) ?? false;
