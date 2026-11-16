// Who may see and dismiss alerts (alert.raise) through the server. Core lists and
// dismisses alerts for anyone who asks; on a server the gateway decides who that is:
//
//  - Seeing: the same rule as other workflow reads — an alert from a private workflow
//    owned by someone else is hidden (admins see everything).
//  - Dismissing and reopening: anyone who can see the alert. Dismiss is shared — it
//    acknowledges the alert for everyone — and is audit-logged as alert.dismiss.
//
// Dismissing "all" means all the alerts this user can see, never other people's.

export interface AlertUser {
  id: string;
  role: string;
}

export interface AlertListItem {
  id: string;
  taskIdentifier: string;
  status?: string;
  title?: string;
  [key: string]: unknown;
}

export interface AlertAuthDeps {
  getOwner(taskIdentifier: string): Promise<{ user_id: string; visibility: string } | null>;
}

async function isHidden(
  item: AlertListItem,
  user: AlertUser,
  deps: AlertAuthDeps
): Promise<boolean> {
  if (user.role === 'admin') return false;
  const owner = await deps.getOwner(item.taskIdentifier);
  return !!owner && owner.user_id !== user.id && owner.visibility === 'private';
}

/** The alerts this user may see. */
export async function visibleAlerts<T extends AlertListItem>(
  items: T[],
  user: AlertUser,
  deps: AlertAuthDeps
): Promise<T[]> {
  const out: T[] = [];
  for (const item of items) if (!(await isHidden(item, user, deps))) out.push(item);
  return out;
}

export type AlertTargetResult =
  | { allowed: true; items: AlertListItem[] }
  | { allowed: false; error: string };

/**
 * Which alerts a dismiss or reopen may touch: `{ id }`, `{ ids }` or `{ all: true }`
 * (only for dismiss: every open alert this user can see). `alerts` is Core's full list,
 * closed ones included. A hidden alert gets the same answer as a missing one.
 */
export async function authorizeAlertTargets(
  params: { id?: unknown; ids?: unknown; all?: unknown },
  alerts: AlertListItem[],
  user: AlertUser,
  deps: AlertAuthDeps,
  allowAll: boolean
): Promise<AlertTargetResult> {
  const visible = await visibleAlerts(alerts, user, deps);
  if (allowAll && params.all === true) {
    return { allowed: true, items: visible.filter((a) => (a.status ?? 'open') === 'open') };
  }
  const ids = [
    ...(Array.isArray(params.ids) ? params.ids : []),
    ...(params.id !== undefined ? [params.id] : []),
  ];
  if (!ids.length || ids.some((id) => typeof id !== 'string')) {
    return { allowed: false, error: 'Say which alert: id or ids' };
  }
  const byId = new Map(visible.map((a) => [a.id, a]));
  const items: AlertListItem[] = [];
  for (const id of ids as string[]) {
    const item = byId.get(id);
    if (!item) return { allowed: false, error: 'Alert not found' };
    items.push(item);
  }
  return { allowed: true, items };
}
