// What a Media component plays: a web link (http / https), a data URL a workflow made
// (data:audio/… or data:video/…), or the path of a file a workflow wrote — played
// through tipeline-media:// (streamed, so it can seek; same file rules as an Image).
// Any other scheme is refused: an app can't hand in its own tipeline-media:// link
// (it would name the app whose file access it uses).

export type MediaKind = 'video' | 'audio';

export type MediaSource =
  | { kind: 'url'; url: string }
  | { kind: 'data'; url: string }
  | { kind: 'file'; path: string }
  | { kind: 'none' }
  | { kind: 'invalid' };

const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac']);
const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'mkv']);

export function mediaSource(src: unknown): MediaSource {
  if (typeof src !== 'string' || !src.trim()) return { kind: 'none' };
  const value = src.trim();
  if (/^https?:\/\//i.test(value)) return { kind: 'url', url: value };
  if (/^data:(audio|video)\/[\w.+-]+;base64,/i.test(value)) return { kind: 'data', url: value };
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) return { kind: 'invalid' };
  return { kind: 'file', path: value };
}

const extension = (text: string) => {
  const clean = text.split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
};

/** Video or audio: as `kind` says, else by the file's type (a video when unsure). */
export function mediaKind(source: MediaSource, kind?: unknown): MediaKind {
  if (kind === 'video' || kind === 'audio') return kind;
  if (source.kind === 'data') return /^data:audio\//i.test(source.url) ? 'audio' : 'video';
  const name = source.kind === 'url' ? new URL(source.url).pathname : source.kind === 'file' ? source.path : '';
  const ext = extension(name);
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'video';
}

/** The link the player loads a file from; `version` makes it read again (a rewritten file). */
export function mediaFileUrl(path: string, appIdentifier: string, version = 0): string {
  const query = new URLSearchParams({ path, app: appIdentifier });
  if (version) query.set('v', String(version));
  return `tipeline-media://play?${query.toString()}`;
}

/** "1:05", "1:02:03". */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
