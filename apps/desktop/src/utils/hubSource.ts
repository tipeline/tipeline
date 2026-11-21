type SourceItem = { source_type?: string | null; hub_name?: string | null };

/**
 * Where an item came from, as lists show it: the name of the hub it was installed from,
 * or "Local". A hub that was removed or renamed out from under it falls back to "Hub".
 */
export function sourceLabel(item: SourceItem, t: (key: string) => string): string {
  if (item.source_type !== 'hub') return t('tasks.local');
  return item.hub_name?.trim() || t('tasks.hub');
}

/** Hover text for a hub source label: says it's a hub, since the label is only its name. */
export function sourceTitle(item: SourceItem, t: (key: string) => string): string | undefined {
  if (item.source_type !== 'hub') return undefined;
  return item.hub_name ? `${t('tasks.hub')}: ${item.hub_name}` : t('tasks.hub');
}
