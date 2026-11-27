// Picks the few Hub items Home suggests. A hub marks the ones it promotes with `featured`
// in its hub.json: a number is the position (1 first), `true` comes after the numbered ones
// in the hub's own order. Featured items always come first, installed or not: they're the
// familiar tools a new user should see straight away (an installed one is marked as such).
// Any room left is filled from everything else, taking a workflow, a plugin and an app in
// turn so it isn't all one kind. The filler leaves out what is already installed from that
// hub, and plugins whose action group is installed some other way (e.g. by hand).

export type HubItemType = 'task' | 'app' | 'plugin';

export type HubSuggestionItem = {
  type: HubItemType;
  identifier: string;
  name: string;
  description?: string;
  image?: string;
  /** Plugins only: the action group the plugin provides. */
  group?: string;
  featured?: boolean | number;
};

export type HubSuggestion = HubSuggestionItem & {
  hubId: string;
  hubName: string;
  installed: boolean;
};

export type HubCatalog = {
  hubId: string;
  hubName: string;
  items: HubSuggestionItem[];
};

/** The setting that hides the card. Missing or anything but 'false' shows it. */
export const HOME_HUB_SUGGESTIONS_KEY = 'homeHubSuggestions';

export const HUB_SUGGESTION_COUNT = 4;

const FILL_ORDER: HubItemType[] = ['task', 'plugin', 'app'];

/** Whether a hub promotes the item: `featured: true` or a position number. */
export function isFeatured(item: { featured?: unknown }) {
  return (
    item.featured === true ||
    (typeof item.featured === 'number' && Number.isFinite(item.featured))
  );
}

/** Where a featured item goes: by its number, then the `true` ones. */
function featuredRank(item: { featured?: unknown }) {
  return typeof item.featured === 'number' ? item.featured : Infinity;
}

/** `type:hubId:identifier`, how installed hub items are matched. */
export function hubItemKey(
  type: HubItemType,
  hubId: string,
  identifier: string
) {
  return `${type}:${hubId}:${identifier}`;
}

/** How an installed plugin's action group is matched, whatever it was installed from. */
export function pluginGroupKey(group: string) {
  return `plugin-group:${group}`;
}

export function pickHubSuggestions(
  catalogs: HubCatalog[],
  installed: Set<string>,
  count = HUB_SUGGESTION_COUNT
): HubSuggestion[] {
  const seen = new Set<string>();
  const candidates: HubSuggestion[] = [];
  for (const catalog of catalogs) {
    for (const item of catalog.items) {
      if (!FILL_ORDER.includes(item.type)) continue;
      const isInstalled =
        installed.has(hubItemKey(item.type, catalog.hubId, item.identifier)) ||
        (item.type === 'plugin' &&
          !!item.group &&
          installed.has(pluginGroupKey(item.group)));
      if (isInstalled && !isFeatured(item)) continue;
      // The same item on two hubs is suggested once, from the first hub.
      const key = `${item.type}:${item.identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        ...item,
        hubId: catalog.hubId,
        hubName: catalog.hubName,
        installed: isInstalled,
      });
    }
  }

  // sort is stable, so equal ranks keep the hubs' own order.
  const picked = candidates
    .filter(isFeatured)
    .sort((a, b) => featuredRank(a) - featuredRank(b))
    .slice(0, count);
  const byType = new Map<HubItemType, HubSuggestion[]>(
    FILL_ORDER.map((type) => [
      type,
      candidates.filter((c) => !isFeatured(c) && c.type === type),
    ])
  );
  while (picked.length < count) {
    let added = false;
    for (const type of FILL_ORDER) {
      const next = byType.get(type)!.shift();
      if (!next) continue;
      picked.push(next);
      added = true;
      if (picked.length === count) break;
    }
    if (!added) break;
  }
  return picked;
}
