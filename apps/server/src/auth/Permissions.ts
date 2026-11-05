export type Role = 'admin' | 'editor' | 'viewer';

export const ROLES: Role[] = ['admin', 'editor', 'viewer'];

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export type Permission =
  | 'tasks:view'
  | 'tasks:run'
  | 'tasks:edit'
  | 'tasks:delete'
  | 'members:manage'
  | 'tokens:manage_own'
  | 'tokens:manage_all'
  | 'webhooks:manage'
  | 'audit:view'
  | 'security:manage';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'tasks:view',
    'tasks:run',
    'tasks:edit',
    'tasks:delete',
    'members:manage',
    'tokens:manage_own',
    'tokens:manage_all',
    'webhooks:manage',
    'audit:view',
    'security:manage',
  ],
  editor: ['tasks:view', 'tasks:run', 'tasks:edit', 'tokens:manage_own'],
  viewer: ['tasks:view', 'tokens:manage_own'],
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

export function hasPermission(role: string, permission: Permission): boolean {
  return isRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}

/** Clamps a requested token scope so it can never exceed the granting user's own role. */
export function clampScope(userRole: string, requestedScope: string | undefined | null): Role {
  const base: Role = isRole(userRole) ? userRole : 'viewer';
  if (!requestedScope || !isRole(requestedScope)) return base;
  return ROLE_RANK[requestedScope] <= ROLE_RANK[base] ? requestedScope : base;
}

export function roleRank(role: string): number {
  return isRole(role) ? ROLE_RANK[role] : -1;
}
