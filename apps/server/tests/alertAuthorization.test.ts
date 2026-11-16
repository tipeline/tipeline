import { describe, expect, it } from 'vitest';
import { authorizeAlertTargets, visibleAlerts } from '../src/ws/alertAuthorization.js';

const admin = { id: 'u-admin', role: 'admin' };
const editor = { id: 'u-ed', role: 'editor' };
const viewer = { id: 'u-view', role: 'viewer' };

const owners: Record<string, { user_id: string; visibility: string }> = {
  'wf-private': { user_id: 'u-other', visibility: 'private' },
  'wf-mine': { user_id: 'u-ed', visibility: 'private' },
  'wf-shared': { user_id: 'u-other', visibility: 'public' },
};
const deps = { getOwner: async (id: string) => owners[id] ?? null };

const alerts = [
  { id: 'a-private', taskIdentifier: 'wf-private', status: 'open', title: 'Theirs' },
  { id: 'a-mine', taskIdentifier: 'wf-mine', status: 'open', title: 'Mine' },
  { id: 'a-shared', taskIdentifier: 'wf-shared', status: 'open', title: 'Shared' },
  {
    id: 'a-shared-done',
    taskIdentifier: 'wf-shared',
    status: 'dismissed',
    title: 'Shared, acknowledged',
  },
  { id: 'a-unowned', taskIdentifier: 'wf-unknown', status: 'open', title: 'Before the server' },
];
const ids = (items: { id: string }[]) => items.map((a) => a.id);

describe('visibleAlerts', () => {
  it("hides alerts from other people's private workflows", async () => {
    expect(ids(await visibleAlerts(alerts, editor, deps))).toEqual([
      'a-mine',
      'a-shared',
      'a-shared-done',
      'a-unowned',
    ]);
    expect(ids(await visibleAlerts(alerts, viewer, deps))).toEqual([
      'a-shared',
      'a-shared-done',
      'a-unowned',
    ]);
  });

  it('admins see everything', async () => {
    expect(await visibleAlerts(alerts, admin, deps)).toHaveLength(alerts.length);
  });
});

describe('authorizeAlertTargets', () => {
  it('anyone who can see an alert may dismiss it, viewers too', async () => {
    const result = await authorizeAlertTargets({ id: 'a-shared' }, alerts, viewer, deps, true);
    expect(result).toEqual({ allowed: true, items: [alerts[2]] });
  });

  it('a hidden alert gets the same answer as a missing one', async () => {
    const hidden = await authorizeAlertTargets({ id: 'a-private' }, alerts, editor, deps, true);
    const missing = await authorizeAlertTargets({ id: 'nope' }, alerts, editor, deps, true);
    expect(hidden).toEqual({ allowed: false, error: 'Alert not found' });
    expect(missing).toEqual(hidden);
  });

  it('one hidden id in a list refuses the whole request', async () => {
    const result = await authorizeAlertTargets(
      { ids: ['a-shared', 'a-private'] },
      alerts,
      editor,
      deps,
      true
    );
    expect(result.allowed).toBe(false);
  });

  it("all means the open alerts this user can see, never other people's", async () => {
    const result = await authorizeAlertTargets({ all: true }, alerts, editor, deps, true);
    expect(result.allowed && ids(result.items)).toEqual(['a-mine', 'a-shared', 'a-unowned']);
  });

  it('all is only for dismiss', async () => {
    const result = await authorizeAlertTargets({ all: true }, alerts, admin, deps, false);
    expect(result).toEqual({ allowed: false, error: 'Say which alert: id or ids' });
  });

  it('refuses a request that names nothing, or ids that are not strings', async () => {
    expect((await authorizeAlertTargets({}, alerts, admin, deps, true)).allowed).toBe(false);
    expect((await authorizeAlertTargets({ ids: [1] }, alerts, admin, deps, true)).allowed).toBe(
      false
    );
  });
});
