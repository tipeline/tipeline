import os from 'os';
import path from 'path';
import fs from 'fs';

export const ASSETS_DIR = path.join(os.homedir(), 'Tipeline', 'assets');
export const TIPELINE_DIR = path.join(os.homedir(), 'Tipeline');

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

export type AssetKind = 'apps' | 'tasks' | 'plugins';

export class AssetService {
  /**
   * Decodes a `data:<mime>;base64,...` upload, validates its type/size, and
   * writes it to `~/Tipeline/assets/<kind>/<identifier>.<ext>` — overwriting
   * any previously-saved image for that identifier regardless of its old
   * extension. Returns the path relative to `~/Tipeline`.
   */
  static saveImage(kind: AssetKind, identifier: string, dataUrl: string): string {
    const match = DATA_URL_PATTERN.exec(dataUrl);
    if (!match) throw new Error('Invalid image data URL');

    const [, mime, base64] = match;
    const ext = MIME_EXTENSIONS[mime];
    if (!ext) throw new Error(`Unsupported image type: ${mime}. Allowed: PNG, JPEG, WebP`);

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 2MB)`);
    }

    const dir = path.join(ASSETS_DIR, kind);
    fs.mkdirSync(dir, { recursive: true });

    this.deleteImage(kind, identifier);

    const filePath = path.join(dir, `${identifier}.${ext}`);
    fs.writeFileSync(filePath, buffer);

    return path.relative(TIPELINE_DIR, filePath);
  }

  /** Copies bytes already on disk (e.g. a hub's local-folder asset) into the asset store. */
  static saveImageFromFile(kind: AssetKind, identifier: string, sourcePath: string): string {
    const ext = path.extname(sourcePath).replace(/^\./, '') || 'png';
    const dir = path.join(ASSETS_DIR, kind);
    fs.mkdirSync(dir, { recursive: true });

    this.deleteImage(kind, identifier);

    const filePath = path.join(dir, `${identifier}.${ext}`);
    fs.copyFileSync(sourcePath, filePath);

    return path.relative(TIPELINE_DIR, filePath);
  }

  static deleteImage(kind: AssetKind, identifier: string): void {
    const dir = path.join(ASSETS_DIR, kind);
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(`${identifier}.`)) {
        fs.rmSync(path.join(dir, entry), { force: true });
      }
    }
  }

  /** Resolves a path relative to `~/Tipeline`, guarding against traversal outside it. */
  static resolveAbsolutePath(relativePath: string): string {
    const resolved = path.resolve(TIPELINE_DIR, relativePath);
    if (!resolved.startsWith(TIPELINE_DIR + path.sep)) {
      throw new Error('Invalid asset path');
    }
    return resolved;
  }
}
