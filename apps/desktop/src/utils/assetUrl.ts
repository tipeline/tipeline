/**
 * Resolves a relative path under `~/.tipeline` (e.g. "assets/apps/<id>.png")
 * to a URL the renderer can load directly in an <img> tag, served by the
 * `tipeline-data://` protocol registered in electron/main/index.ts.
 *
 * A remote plugin/hub image is already a full http(s) URL — returned as-is.
 * `null`/`undefined`/empty is returned as `null` so callers can fall back to
 * a placeholder icon rather than requesting `tipeline-data://undefined`.
 */
export function toAssetUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  if (/^(https?:|data:)/.test(relativePath)) return relativePath;
  return `tipeline-data://${relativePath}`;
}
