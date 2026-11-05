import fs from 'fs';
import path from 'path';
import type { Hub } from '@database/models/Hub';
import type { HubCatalogItem, HubProvider } from '@/hub/HubProvider';
import { verifyHubFile } from '@/hub/HubChecksum';

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export class LocalFolderHubProvider implements HubProvider {
  async fetchCatalog(hub: Hub): Promise<HubCatalogItem[]> {
    const catalogPath = path.join(hub.target, 'hub.json');
    if (!fs.existsSync(catalogPath)) {
      throw new Error(`Hub catalog not found at "${catalogPath}"`);
    }
    const raw = fs.readFileSync(catalogPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const items: HubCatalogItem[] = parsed?.items ?? [];

    // The renderer has no direct filesystem access to an arbitrary hub
    // folder, so a local image is inlined as base64 here — a one-shot cost
    // per hub-tab-open, unlike an installed entity's image which is read on
    // every list render via the `tipeline-asset://` protocol handler.
    return items.map((item) => {
      if (!item.image || /^https?:\/\//.test(item.image)) return item;
      const imagePath = path.isAbsolute(item.image) ? item.image : path.join(hub.target, item.image);
      if (!fs.existsSync(imagePath)) return { ...item, image: undefined };
      const mime = IMAGE_MIME_BY_EXT[path.extname(imagePath).toLowerCase()];
      if (!mime) return { ...item, image: undefined };
      const base64 = fs.readFileSync(imagePath).toString('base64');
      return { ...item, image: `data:${mime};base64,${base64}` };
    });
  }

  async fetchFile(hub: Hub, item: HubCatalogItem): Promise<string> {
    const filePath = path.isAbsolute(item.file) ? item.file : path.join(hub.target, item.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Hub item file not found at "${filePath}"`);
    }
    // Checked in place: the file belongs to the hub folder, not a download, so
    // a mismatch leaves it where it is.
    await verifyHubFile(hub, item, filePath);
    return filePath;
  }

  async fetchImageFile(): Promise<string | null> {
    // fetchCatalog already inlines local images as base64 — nothing left to fetch as a file.
    return null;
  }
}
