import { badgeColor, BADGE_COLORS, type BadgeColor } from './appBadge';
import { valueAt } from './appFormat';

// Avatars: a person's picture — or, without one (or while it can't load), their initials
// on a color of their own (the same name is always the same color, as badges are).

/** "Ada Lovelace" → "AL", "grace" → "G", "ada@example.com" → "A"; nothing → "". */
export function initials(name: unknown): string {
  const text = String(name ?? '').trim().replace(/@.*$/, '');
  const words = text.split(/[\s._-]+/).filter((w) => /\p{L}|\p{N}/u.test(w));
  if (!words.length) return '';
  const first = (w: string) => [...w.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '';
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])).toUpperCase();
}

/** The avatar's color: the one asked for, else one picked from the name. */
export function avatarColor(name: unknown, color?: unknown): BadgeColor {
  if ((BADGE_COLORS as readonly unknown[]).includes(color)) return color as BadgeColor;
  // Not from the status words (a person called "Done" isn't green): a hash of the name.
  return badgeColor(`@${String(name ?? '')}`, null);
}

/** online / away / busy / offline get the usual dot colors; other words as badges. */
export function statusColor(status: unknown): BadgeColor | null {
  const key = String(status ?? '').trim().toLowerCase();
  if (!key) return null;
  return ({ online: 'green', available: 'green', away: 'amber', idle: 'amber', busy: 'red', dnd: 'red', offline: 'gray' } as Record<string, BadgeColor>)[key] ?? badgeColor(key, null);
}

export interface AvatarPerson {
  name: string;
  src: unknown;
  subtitle: string;
  status: unknown;
  row: unknown;
  index: number;
}

const NAME_KEYS = ['name', 'fullName', 'title', 'label', 'email', 'username'];
const SRC_KEYS = ['avatar', 'src', 'image', 'photo', 'picture', 'url'];
const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** A group's people from rows (or plain names), by the given keys or the usual ones. */
export function avatarPeople(
  data: unknown,
  keys: { nameKey?: string; srcKey?: string; subtitleKey?: string; statusKey?: string } = {}
): AvatarPerson[] {
  const list = Array.isArray(data) ? data : [];
  return list
    .map((row, index): AvatarPerson | null => {
      if (row === null || row === undefined || row === '') return null;
      if (typeof row !== 'object') return { name: text(row), src: null, subtitle: '', status: null, row, index };
      const pick = (key: string | undefined, fallbacks: string[]) =>
        key ? valueAt(row, key) : fallbacks.map((k) => (row as Record<string, unknown>)[k]).find((v) => v !== undefined && v !== null && v !== '');
      return {
        name: text(pick(keys.nameKey, NAME_KEYS)),
        src: pick(keys.srcKey, SRC_KEYS) ?? null,
        subtitle: text(keys.subtitleKey ? valueAt(row, keys.subtitleKey) : ''),
        status: keys.statusKey ? valueAt(row, keys.statusKey) : (row as Record<string, unknown>).status,
        row,
        index,
      };
    })
    .filter((p): p is AvatarPerson => !!p);
}
