import { describe, expect, it } from 'vitest';
import { authorizeDecision, canDecide, visibleApprovals } from '../src/ws/approvalAuthorization.js';

const admin = { id: 'u-admin', email: 'boss@acme.com', role: 'admin' };
const editor = { id: 'u-ed', email: 'ed@acme.com', role: 'editor' };
const viewer = { id: 'u-view', email: 'Finance@Acme.com', role: 'viewer' };

const owners: Record<string, { user_id: string; visibility: string }> = {
  'wf-private': { user_id: 'u-other', visibility: 'private' },
  'wf-mine': { user_id: 'u-ed', visibility: 'private' },
  'wf-shared': { user_id: 'u-other', visibility: 'public' },
};
// p-ed-started was started by the editor; nothing else has a known requester.
const requesters: Record<string, { id: string; email: string }> = {
  'p-ed-started': { id: 'u-ed', email: 'ed@acme.com' },
  'p-admin-started': { id: 'u-admin', email: 'boss@acme.com' },
};
const deps = {
  getOwner: async (id: string) => owners[id] ?? null,
  getRequester: async (id: string) => requesters[id] ?? null,
};

describe('canDecide', () => {
  it('without approvers: anyone who can run the workflow (editors and admins)', () => {
    expect(canDecide(admin, null)).toBe(true);
    expect(canDecide(editor, [])).toBe(true);
    expect(canDecide(viewer, undefined)).toBe(false);
  });

  it('with approvers: listed emails (any role, any case), listed roles and above, and admins always', () => {
    expect(canDecide(viewer, ['finance@acme.com'])).toBe(true);
    expect(canDecide(editor, ['finance@acme.com'])).toBe(false);
    expect(canDecide(editor, ['editor'])).toBe(true);
    expect(canDecide(editor, ['admin'])).toBe(false);
    expect(canDecide(viewer, ['editor'])).toBe(false);
    expect(canDecide(admin, ['finance@acme.com'])).toBe(true);
  });
});

describe('visibleApprovals', () => {
  const items = [
    { pipelineIdentifier: 'p-1', taskIdentifier: 'wf-private', approvers: null },
    { pipelineIdentifier: 'p-2', taskIdentifier: 'wf-mine', approvers: ['admin'] },
    { pipelineIdentifier: 'p-3', taskIdentifier: 'wf-shared', approvers: null },
    { pipelineIdentifier: 'p-4', taskIdentifier: 'wf-unowned', approvers: ['finance@acme.com'] },
  ];

  it('hides private workflows owned by someone else and says what the user may decide', async () => {
    expect(await visibleApprovals(items, editor, deps)).toEqual([
      { ...items[1], canDecide: false, blockedBy: 'approvers', requestedBy: null },
      { ...items[2], canDecide: true, blockedBy: null, requestedBy: null },
      { ...items[3], canDecide: false, blockedBy: 'approvers', requestedBy: null },
    ]);
    expect(
      (await visibleApprovals(items, viewer, deps)).map((i) => [i.pipelineIdentifier, i.canDecide])
    ).toEqual([
      ['p-3', false],
      ['p-4', true],
    ]);
    expect(await visibleApprovals(items, admin, deps)).toHaveLength(4);
  });
});

describe('authorizeDecision', () => {
  const pending = [
    { pipelineIdentifier: 'p-1', taskIdentifier: 'wf-private', approvers: null },
    {
      pipelineIdentifier: 'p-3',
      taskIdentifier: 'wf-shared',
      approvers: ['admin', 'finance@acme.com'],
    },
    { pipelineIdentifier: 'p-5', taskIdentifier: 'wf-shared', approvers: null },
  ];

  it('allows a permitted user and returns the pending item', async () => {
    await expect(authorizeDecision('p-3', pending, viewer, deps)).resolves.toEqual({
      allowed: true,
      item: pending[1],
    });
  });

  it('answers a hidden run exactly like a missing one', async () => {
    const hidden = await authorizeDecision('p-1', pending, editor, deps);
    const missing = await authorizeDecision('p-404', pending, editor, deps);
    expect(hidden).toEqual(missing);
    expect(hidden).toEqual({
      allowed: false,
      error: 'Nothing is waiting for approval on this run',
    });
    await expect(authorizeDecision({ evil: true }, pending, admin, deps)).resolves.toMatchObject({
      allowed: false,
    });
  });

  it('says who may decide when the user may not', async () => {
    await expect(authorizeDecision('p-3', pending, editor, deps)).resolves.toEqual({
      allowed: false,
      error: 'Permission denied: only admin, finance@acme.com can decide this approval',
    });
    await expect(authorizeDecision('p-5', pending, viewer, deps)).resolves.toEqual({
      allowed: false,
      error: 'Permission denied: only editors and admins can decide this approval',
    });
  });
});

describe('four-eyes rule (allowSelfApproval: false)', () => {
  const strict = [
    {
      pipelineIdentifier: 'p-ed-started',
      taskIdentifier: 'wf-shared',
      approvers: null,
      allowSelfApproval: false,
    },
    {
      pipelineIdentifier: 'p-admin-started',
      taskIdentifier: 'wf-shared',
      approvers: null,
      allowSelfApproval: false,
    },
  ];

  it('keeps the person who started the run from deciding it — admins included', async () => {
    await expect(authorizeDecision('p-ed-started', strict, editor, deps)).resolves.toEqual({
      allowed: false,
      error: 'Permission denied: you started this run, so someone else has to decide it',
    });
    await expect(authorizeDecision('p-admin-started', strict, admin, deps)).resolves.toMatchObject({
      allowed: false,
    });
    await expect(authorizeDecision('p-ed-started', strict, admin, deps)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(authorizeDecision('p-admin-started', strict, editor, deps)).resolves.toMatchObject(
      { allowed: true }
    );
  });

  it('marks why, and shows who started it', async () => {
    const [mine] = await visibleApprovals(strict, editor, deps);
    expect(mine).toMatchObject({
      canDecide: false,
      blockedBy: 'requester',
      requestedBy: 'ed@acme.com',
    });
  });

  it('allows the requester when the request does not ask for it (the default)', async () => {
    const relaxed = [{ ...strict[0], allowSelfApproval: true }];
    await expect(authorizeDecision('p-ed-started', relaxed, editor, deps)).resolves.toMatchObject({
      allowed: true,
    });
  });
});
