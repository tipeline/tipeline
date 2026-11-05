import { describe, expect, it } from 'vitest';
import { authorizeCancel, type CancelAuthDeps } from '../src/ws/cancelAuthorization.js';

const editor = { id: 'u-ed', role: 'editor' };
const admin = { id: 'u-admin', role: 'admin' };

function deps(overrides: Partial<CancelAuthDeps> = {}): CancelAuthDeps {
  return {
    getRun: async (id) =>
      id === 'p-pay'
        ? { task: { identifier: 'wf-pay' } }
        : id === 'p-secret'
          ? { task: { identifier: 'wf-private' } }
          : null,
    getOwner: async (task) =>
      task === 'wf-private' ? { user_id: 'u-other', visibility: 'private' } : null,
    ownsRequest: (cid) => cid === 'c-mine',
    ...overrides,
  };
}

describe('authorizeCancel', () => {
  it('allows a run of a workflow the user can see', async () => {
    expect(await authorizeCancel({ pipelineIdentifier: 'p-pay' }, editor, deps())).toEqual({
      allowed: true,
      target: { pipelineIdentifier: 'p-pay' },
      taskIdentifier: 'wf-pay',
    });
  });

  it("reports someone else's private workflow, or an unknown run, as not found", async () => {
    const notFound = { allowed: false, error: 'Run not found' };
    expect(await authorizeCancel({ pipelineIdentifier: 'p-secret' }, editor, deps())).toEqual(notFound);
    expect(await authorizeCancel({ pipelineIdentifier: 'p-nope' }, editor, deps())).toEqual(notFound);
    expect(
      await authorizeCancel({ pipelineIdentifier: 'p-pay' }, editor, deps({ getRun: async () => { throw new Error('x'); } }))
    ).toEqual(notFound);
    // admins see every workflow
    expect((await authorizeCancel({ pipelineIdentifier: 'p-secret' }, admin, deps())).allowed).toBe(true);
  });

  it('lets only the connection that started a run that does not persist cancel it', async () => {
    expect(await authorizeCancel({ correlationId: 'c-mine' }, editor, deps())).toMatchObject({
      allowed: true,
      target: { correlationId: 'c-mine' },
    });
    expect((await authorizeCancel({ correlationId: 'c-theirs' }, admin, deps())).allowed).toBe(false);
    expect((await authorizeCancel({}, editor, deps())).allowed).toBe(false);
  });
});
