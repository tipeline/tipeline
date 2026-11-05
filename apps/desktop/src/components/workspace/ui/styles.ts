import { formatDistanceToNow } from 'date-fns';

// Shared class strings for the workspace dashboard tabs, so every tab renders the same
// card / table / badge / button language.

export const tableClass = [
  'w-full border-collapse text-[13px]',
  '[&_thead_th]:text-left [&_thead_th]:text-[11.5px] [&_thead_th]:font-semibold',
  '[&_thead_th]:text-muted-foreground [&_thead_th]:uppercase [&_thead_th]:tracking-wide',
  '[&_thead_th]:px-4 [&_thead_th]:py-2.5 [&_thead_th]:border-b',
  '[&_tbody_td]:px-4 [&_tbody_td]:py-2.5 [&_tbody_td]:border-b [&_tbody_td]:align-middle',
  '[&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-accent/50',
].join(' ');

// Two-column key/value table used inside card bodies (Connection details, Account, …).
export const detailTableClass = [
  'w-full border-collapse text-[13px]',
  '[&_td]:py-2.5 [&_td]:border-b [&_tr:last-child_td]:border-b-0',
  '[&_td:first-child]:w-44 [&_td:first-child]:text-muted-foreground',
].join(' ');

export const btnClass =
  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium rounded-md border bg-transparent hover:bg-accent transition-colors disabled:opacity-50 disabled:pointer-events-none [&_svg]:h-3.5 [&_svg]:w-3.5';

export const btnPrimaryClass =
  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium rounded-md border border-transparent bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none [&_svg]:h-3.5 [&_svg]:w-3.5';

export const btnDangerClass =
  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium rounded-md border border-destructive/40 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50 disabled:pointer-events-none';

export const iconBtnClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none [&_svg]:h-3.5 [&_svg]:w-3.5';

export const iconBtnDangerClass = `${iconBtnClass} hover:text-destructive! hover:border-destructive/40`;

export const badgeBase =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap [&_svg]:h-2.75 [&_svg]:w-2.75';

export function roleBadgeClass(role: string): string {
  if (role === 'admin') return `${badgeBase} bg-amber-500/15 text-amber-600 dark:text-amber-400`;
  if (role === 'editor') return `${badgeBase} bg-blue-500/15 text-blue-600 dark:text-blue-400`;
  return `${badgeBase} bg-muted text-muted-foreground`;
}

export const mutedBadgeClass = `${badgeBase} bg-muted text-muted-foreground`;
export const successBadgeClass = `${badgeBase} bg-green-500/15 text-green-600 dark:text-green-400`;

export const avatarClass =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11.5px] font-semibold';

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
