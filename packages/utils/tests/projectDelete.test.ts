import { describe, expect, it } from 'vitest';
import { defaultDeleteSelection, outsideUsers } from '../src/projectDelete';

const user = (identifier: string, project: string | null = 'p-sales') => ({
  identifier,
  name: identifier,
  projects: project ? [{ identifier: project, name: project }] : [],
});

const workflow = (identifier: string, apps: any[] = [], workflows: any[] = []) => ({
  identifier,
  name: identifier,
  apps,
  workflows,
  schedules: [],
});

// Sales: crm is used by an Ops app; quote runs crm; idle is unused; deals uses quote.
const preview = {
  identifier: 'p-sales',
  name: 'Sales',
  workflows: [
    workflow('crm', [user('desk', 'p-ops')], [user('quote')]),
    workflow('quote', [user('deals')]),
    workflow('idle'),
    workflow('lookup', [], [user('crm')]),
  ],
  apps: [{ identifier: 'deals', name: 'Deals' }],
};

describe('outsideUsers', () => {
  it('leaves out users that are being deleted too', () => {
    const selection = { workflows: new Set(['quote']), apps: new Set(['deals']) };
    expect(outsideUsers(preview.workflows[0], selection)).toEqual({ apps: [user('desk', 'p-ops')], workflows: [] });
    expect(outsideUsers(preview.workflows[1], selection)).toEqual({ apps: [], workflows: [] });
  });

  it('counts a kept item of the same project as a user', () => {
    const selection = { workflows: new Set(['crm']), apps: new Set<string>() };
    expect(outsideUsers(preview.workflows[1], selection).apps.map((a) => a.identifier)).toEqual(['deals']);
  });
});

describe('defaultDeleteSelection', () => {
  it('ticks every app and the workflows nothing outside uses, following kept workflows through', () => {
    const selection = defaultDeleteSelection(preview);
    expect([...selection.apps]).toEqual(['deals']);
    // crm is kept (an Ops app uses it), so lookup, which crm runs, is kept as well.
    expect([...selection.workflows].sort()).toEqual(['idle', 'quote']);
  });

  it('ticks everything when nothing outside uses the project', () => {
    const selection = defaultDeleteSelection({ ...preview, workflows: [workflow('a', [], [user('b')]), workflow('b')] });
    expect([...selection.workflows].sort()).toEqual(['a', 'b']);
  });

  it('never ticks a workflow or app that is also in another project, and keeps what it runs', () => {
    const also = { alsoIn: [{ identifier: 'p-ops', name: 'Ops' }] };
    const selection = defaultDeleteSelection({
      workflows: [{ ...workflow('shared', [], []), ...also }, workflow('helper', [], [user('shared')]), workflow('alone')],
      apps: [{ identifier: 'board', ...also }, { identifier: 'desk' }],
    });
    expect([...selection.workflows]).toEqual(['alone']);
    expect([...selection.apps]).toEqual(['desk']);
  });
});
