import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import type { Hub } from '@database/models/Hub';
import type { HubCatalogItem, HubProvider } from '@/hub/HubProvider';
import { expectedSha256, verifyHubFile } from '@/hub/HubChecksum';

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * The hub's base URL, without a trailing slash. A GitHub repo link is read
 * through raw.githubusercontent.com, so a user can paste the link they see in
 * the browser:
 *   https://github.com/owner/repo                → …/owner/repo/HEAD (the default branch)
 *   https://github.com/owner/repo/tree/v2/hub    → …/owner/repo/v2/hub
 * The `tree/<ref>` form takes the first segment as the ref, so a branch name
 * with a slash needs the raw.githubusercontent.com address instead.
 */
export function resolveHubBase(target: string): string {
  const trimmed = target.trim().replace(/\/+$/, '');
  const github = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(\/.*)?)?$/i.exec(trimmed);
  if (!github) return trimmed;
  const [, owner, repo, ref, rest] = github;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref ?? 'HEAD'}${rest ?? ''}`;
}

export class RemoteHubProvider implements HubProvider {
  async fetchCatalog(hub: Hub): Promise<HubCatalogItem[]> {
    const base = resolveHubBase(hub.target);
    const catalogUrl = `${base}/hub.json`;
    const response = await axios.get(catalogUrl, this.requestConfig(hub, catalogUrl));
    const items: HubCatalogItem[] = response.data?.items ?? [];
    return Promise.all(items.map((item) => this.withDisplayImage(hub, item)));
  }

  async fetchFile(hub: Hub, item: HubCatalogItem): Promise<string> {
    const fileUrl = this.resolveUrl(hub, item.file);
    // An unsupported checksum format is refused before anything is downloaded.
    expectedSha256(hub, item);
    const downloadPath = await this.download(hub, fileUrl, item.file);
    try {
      await verifyHubFile(hub, item, downloadPath);
    } catch (err) {
      fs.rmSync(path.dirname(downloadPath), { recursive: true, force: true });
      throw err;
    }
    return downloadPath;
  }

  async fetchImageFile(hub: Hub, item: HubCatalogItem): Promise<string | null> {
    if (!item.image) return null;
    // A remote catalog's image is already a plain URL the renderer can load
    // directly — nothing to download for *display*. This is only used at
    // install time, to copy the bytes into the installed entity's own storage.
    return this.download(hub, this.resolveUrl(hub, item.image), item.image);
  }

  /**
   * The renderer loads a catalog image by itself, so it needs an absolute URL
   * it can open without the token. A relative path becomes an absolute URL on
   * the hub; with a token, an image on the hub's own host is inlined as a data
   * URL instead, since a private repo won't serve it without the token.
   */
  private async withDisplayImage(hub: Hub, item: HubCatalogItem): Promise<HubCatalogItem> {
    if (!item.image || item.image.startsWith('data:')) return item;
    const imageUrl = this.resolveUrl(hub, item.image);
    if (!this.sendsToken(hub, imageUrl)) return { ...item, image: imageUrl };
    try {
      const response = await axios.get(imageUrl, { ...this.requestConfig(hub, imageUrl), responseType: 'arraybuffer' });
      const mime =
        IMAGE_MIME_BY_EXT[path.extname(new URL(imageUrl).pathname).toLowerCase()] ??
        String(response.headers?.['content-type'] ?? '').split(';')[0];
      if (!mime.startsWith('image/')) return { ...item, image: undefined };
      return { ...item, image: `data:${mime};base64,${Buffer.from(response.data).toString('base64')}` };
    } catch {
      return { ...item, image: undefined };
    }
  }

  private resolveUrl(hub: Hub, file: string): string {
    if (/^https?:\/\//.test(file)) return file;
    return `${resolveHubBase(hub.target)}/${file.replace(/^\//, '')}`;
  }

  /** The token only goes to the hub's own host — never to a full URL in the catalog that points elsewhere. */
  private sendsToken(hub: Hub, url: string): boolean {
    if (!hub.token) return false;
    try {
      return new URL(url).origin === new URL(resolveHubBase(hub.target)).origin;
    } catch {
      return false;
    }
  }

  private requestConfig(hub: Hub, url: string): { headers?: Record<string, string> } {
    return this.sendsToken(hub, url) ? { headers: { Authorization: `Bearer ${hub.token}` } } : {};
  }

  private async download(hub: Hub, url: string, name: string): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-hub-'));
    const downloadPath = path.join(tmpDir, path.basename(name));

    const response = await axios.get(url, { responseType: 'stream', ...this.requestConfig(hub, url) });
    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(downloadPath));
      writer.on('error', reject);
    });
  }
}
