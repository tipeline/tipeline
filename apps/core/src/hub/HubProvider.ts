import type { Hub } from '@database/models/Hub';

export type HubCatalogItemType = 'task' | 'app' | 'plugin';

export interface HubCatalogItem {
  type: HubCatalogItemType;
  identifier: string;
  name: string;
  description?: string;
  author?: string;
  version: string;
  updatedAt?: string;
  /** Path to the item's file, resolved against the hub's `target` (base URL or folder). */
  file: string;
  checksum?: string;
  /**
   * Thumbnail shown in the Hub browser. For a remote hub this is a plain URL
   * the renderer can load directly; for a local-folder hub it's already
   * inlined as a base64 data URL by `fetchCatalog` (see LocalFolderHubProvider),
   * since the renderer has no direct filesystem access to an arbitrary hub folder.
   */
  image?: string;
  /**
   * Plugins only: the action group the plugin provides (the `group` its code
   * exports). Lets a workflow that needs that group point at this plugin.
   */
  group?: string;
}

export interface HubProvider {
  fetchCatalog(hub: Hub): Promise<HubCatalogItem[]>;
  /** Resolves an item's `file` to a local filesystem path (downloads to a temp file for remote hubs). */
  fetchFile(hub: Hub, item: HubCatalogItem): Promise<string>;
  /** Resolves an item's `image` to a local filesystem path, for copying into the installed entity's own storage. Returns null if the item has no image or it's a remote URL (nothing to copy — the URL is used as-is). */
  fetchImageFile(hub: Hub, item: HubCatalogItem): Promise<string | null>;
}
