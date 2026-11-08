import { describe, expect, it } from 'vitest';
import {
  applyPositions,
  clusterGrid,
  clusterLeaves,
  clusterSize,
  draftBrief,
  drawnEdge,
  edgeKindFor,
  emptyPlan,
  layoutFlow,
  layoutGroups,
  layoutLanes,
  laneByOf,
  laneOfNode,
  laneOrder,
  mergeMap,
  parsePlan,
  placeNode,
  MAP_NODE_H,
  MAP_NODE_W,
  type LiveMap,
  type ProjectMapPlan,
} from '../src/projectMap';

const project = { identifier: 'p', name: 'Caching', color: null };

const live: LiveMap = {
  nodes: [
    { key: 'task:sites', kind: 'helper', name: 'Data: sites', ref: 'sites', project },
    { key: 'task:report', kind: 'workflow', name: 'Cache hit report', ref: 'report', project, inputs: [], outputs: ['hitRatio'] },
    { key: 'task:purge', kind: 'workflow', name: 'Purge', ref: 'purge', project, inputs: ['tag'], outputs: [] },
    { key: 'app:console', kind: 'app', name: 'Purge console', ref: 'console', project },
    { key: 'app:dash', kind: 'app', name: 'Dashboard', ref: 'dash', project },
    { key: 'global:cacheTtl', kind: 'global', name: 'cacheTtl', ref: 'cacheTtl', project: null },
    { key: 'task:borrowed', kind: 'workflow', name: 'Borrowed', ref: 'borrowed', project: null, external: true },
  ],
  edges: [
    { from: 'app:dash', to: 'task:report', kind: 'runs' },
    { from: 'app:dash', to: 'global:cacheTtl', kind: 'reads' },
    { from: 'task:purge', to: 'task:sites', kind: 'calls' },
  ],
};

const plan = (patch: Partial<ProjectMapPlan>): ProjectMapPlan => ({ ...emptyPlan(), ...patch });

describe('edgeKindFor', () => {
  it('names the line by the kinds it joins, from the one doing it', () => {
    expect(edgeKindFor('workflow', 'helper')).toBe('calls');
    expect(edgeKindFor('app', 'workflow')).toBe('runs');
    expect(edgeKindFor('workflow', 'global')).toBe('writes');
    expect(edgeKindFor('app', 'global')).toBe('reads');
    expect(edgeKindFor('schedule', 'workflow')).toBe('triggers');
    expect(edgeKindFor('workflow', 'app')).toBeNull();
    expect(edgeKindFor('global', 'schedule')).toBeNull();
  });

  it('turns a line dragged from a global into a read, and one dragged backwards to an app or schedule', () => {
    expect(drawnEdge('global', 'workflow')).toEqual({ kind: 'reads', turned: true });
    expect(drawnEdge('global', 'app')).toEqual({ kind: 'reads', turned: true });
    expect(drawnEdge('workflow', 'global')).toEqual({ kind: 'writes', turned: false });
    expect(drawnEdge('workflow', 'app')).toEqual({ kind: 'runs', turned: true });
    expect(drawnEdge('workflow', 'schedule')).toEqual({ kind: 'triggers', turned: true });
    expect(drawnEdge('workflow', 'workflow')).toEqual({ kind: 'calls', turned: false });
    expect(drawnEdge('schedule', 'app')).toBeNull();
  });
});

describe('parsePlan', () => {
  it("turns a v1 plan's sub-workflow, app and read lines round, with their ignored keys and box positions", () => {
    const v1 = {
      version: 1,
      edges: [
        { id: 'a', from: 'task:child', to: 'task:parent', kind: 'feeds' },
        { id: 'b', from: 'task:wf', to: 'app:log', kind: 'runs' },
        { id: 'c', from: 'global:x', to: 'task:wf', kind: 'reads' },
        { id: 'd', from: 'task:wf', to: 'global:y', kind: 'writes' },
      ],
      ignored: ['unplanned|feeds|task:child|task:parent', 'unplanned|writes|task:wf|global:y'],
      positions: { 'cluster:feeds:in:task:parent': { x: 1, y: 2 }, 'task:wf': { x: 3, y: 4 } },
    };
    const p = parsePlan(JSON.stringify(v1));
    expect(p.version).toBe(2);
    expect(p.edges).toEqual([
      { id: 'a', from: 'task:parent', to: 'task:child', kind: 'calls' },
      { id: 'b', from: 'app:log', to: 'task:wf', kind: 'runs' },
      { id: 'c', from: 'task:wf', to: 'global:x', kind: 'reads' },
      { id: 'd', from: 'task:wf', to: 'global:y', kind: 'writes' },
    ]);
    expect(p.ignored).toEqual(['unplanned|calls|task:parent|task:child', 'unplanned|writes|task:wf|global:y']);
    expect(Object.keys(p.positions).sort()).toEqual(['cluster:calls:out:task:parent', 'task:wf']);
    // A v2 plan is read as it is.
    expect(parsePlan(JSON.stringify(p))).toEqual(p);
  });

  it('fills defaults and falls back to an empty plan for anything unreadable', () => {
    expect(parsePlan(JSON.stringify({ nodes: [{ id: 'a', kind: 'app', name: 'X' }] })).nodes[0]).toMatchObject({ inputs: [], outputs: [] });
    expect(parsePlan('{not json')).toEqual(emptyPlan());
    expect(parsePlan({ nodes: 'nope' })).toEqual(emptyPlan());
    expect(parsePlan(null)).toEqual(emptyPlan());
  });
});

describe('mergeMap', () => {
  it('shows live nodes as built and unlinked plan nodes as planned, with progress over own nodes', () => {
    const m = mergeMap(live, plan({ nodes: [{ id: 'n1', kind: 'workflow', name: 'Warm cache', inputs: [], outputs: [] }] }));
    expect(m.nodes.find((n) => n.key === 'plan:n1')).toMatchObject({ planned: true, status: 'idea', statusWhy: 'planned' });
    expect(m.nodes.find((n) => n.key === 'task:report')).toMatchObject({ planned: false, status: 'built', statusWhy: 'neverRun' });
    // Nothing has run yet: 6 own live nodes built, the planned one an idea; the borrowed one doesn't count.
    expect(m.progress).toEqual({ idea: 1, drafting: 0, built: 6, tested: 0, ready: 0, total: 7 });
    expect(m.differences).toEqual([]);
  });

  it('a planned line between built things that the definitions lack is a missing link', () => {
    const m = mergeMap(
      live,
      plan({ edges: [{ id: 'e1', from: 'app:console', to: 'task:purge', kind: 'runs' }] })
    );
    expect(m.edges.find((e) => e.planEdgeId === 'e1')).toMatchObject({ source: 'plan', difference: 'missing' });
    expect(m.differences).toEqual([
      expect.objectContaining({ kind: 'missing-link', from: 'app:console', to: 'task:purge', planEdgeId: 'e1' }),
    ]);
    expect(m.nodes.find((n) => n.key === 'app:console')!.differences).toBe(1);
  });

  it('a planned line to a planned node is just planned, not a difference', () => {
    const m = mergeMap(
      live,
      plan({
        nodes: [{ id: 'n1', kind: 'app', name: 'Later', inputs: [], outputs: [] }],
        edges: [{ id: 'e1', from: 'plan:n1', to: 'task:purge', kind: 'runs' }],
      })
    );
    expect(m.edges.find((e) => e.planEdgeId === 'e1')).toMatchObject({ from: 'plan:n1', source: 'plan' });
    expect(m.differences).toEqual([]);
  });

  it('a linked node takes the live key, its lines follow it, and real lines it has that the plan lacks are flagged', () => {
    const m = mergeMap(
      live,
      plan({
        nodes: [{ id: 'n1', kind: 'app', name: 'Dash (planned)', owner: 'Ana', inputs: [], outputs: [], link: 'app:dash' }],
        edges: [{ id: 'e1', from: 'plan:n1', to: 'task:report', kind: 'runs' }],
      })
    );
    const dash = m.nodes.find((n) => n.key === 'app:dash')!;
    expect(dash).toMatchObject({ planned: false, planId: 'n1', status: 'built', owner: 'Ana', name: 'Dashboard' });
    expect(m.nodes.some((n) => n.key === 'plan:n1')).toBe(false);
    // The planned line exists for real: both.
    expect(m.edges.find((e) => e.key === 'runs|app:dash|task:report')).toMatchObject({ source: 'both' });
    // Reading cacheTtl wasn't planned.
    expect(m.differences).toEqual([
      expect.objectContaining({ kind: 'not-on-plan', from: 'app:dash', to: 'global:cacheTtl', edgeKind: 'reads' }),
    ]);
  });

  it('ignored differences stay hidden', () => {
    const m = mergeMap(
      live,
      plan({
        nodes: [{ id: 'n1', kind: 'app', name: 'Dash', inputs: [], outputs: [], link: 'app:dash' }],
        ignored: ['unplanned|runs|app:dash|task:report', 'unplanned|reads|app:dash|global:cacheTtl'],
      })
    );
    expect(m.differences).toEqual([]);
    expect(m.edges.every((e) => !e.difference)).toBe(true);
  });

  it('compares planned outputs and inputs with the linked workflow', () => {
    const m = mergeMap(
      live,
      plan({
        nodes: [
          { id: 'n1', kind: 'workflow', name: 'Report', inputs: [], outputs: ['hitRate'], link: 'task:report' },
          { id: 'n2', kind: 'workflow', name: 'Purge', inputs: ['tag'], outputs: [], link: 'task:purge' },
        ],
      })
    );
    expect(m.differences.filter((d) => d.kind === 'outputs')).toEqual([
      expect.objectContaining({ nodeKey: 'task:report', planned: ['hitRate'], actual: ['hitRatio'] }),
    ]);
    expect(m.differences.some((d) => d.kind === 'inputs')).toBe(false);
  });

  it('a link to something deleted keeps the node planned and says so', () => {
    const m = mergeMap(live, plan({ nodes: [{ id: 'n1', kind: 'workflow', name: 'Gone', inputs: [], outputs: [], link: 'task:deleted' }] }));
    expect(m.nodes.find((n) => n.key === 'plan:n1')).toMatchObject({ planned: true, linkMissing: true });
    expect(m.differences).toEqual([expect.objectContaining({ kind: 'link-missing', nodeKey: 'plan:n1' })]);
  });

  it('notes on live nodes (owner, lane) come from meta', () => {
    const m = mergeMap(live, plan({ meta: { 'task:report': { owner: 'Ana', lane: 'AM' } } }));
    expect(m.nodes.find((n) => n.key === 'task:report')).toMatchObject({ owner: 'Ana', lane: 'AM' });
  });
});

describe('statuses', () => {
  const T0 = '2026-11-01T10:00:00.000Z';
  const T1 = '2026-11-02T10:00:00.000Z';
  const T2 = '2026-11-03T10:00:00.000Z';
  const wf = (key: string, extra: Partial<LiveMap['nodes'][number]> = {}): LiveMap['nodes'][number] => ({
    key,
    kind: 'workflow',
    name: key,
    ref: key.slice(5),
    project,
    changedAt: T1,
    ...extra,
  });
  const nodeOf = (m: ReturnType<typeof mergeMap>, key: string) => m.nodes.find((n) => n.key === key)!;

  it('works out a workflow from draft, last change and last successful run', () => {
    const m = mergeMap(
      {
        nodes: [
          wf('task:draft', { draft: true, lastSuccessAt: T2 }),
          wf('task:never'),
          wf('task:stale', { lastSuccessAt: T0 }),
          wf('task:ok', { lastSuccessAt: T2 }),
        ],
        edges: [],
      },
      emptyPlan()
    );
    expect(nodeOf(m, 'task:draft')).toMatchObject({ status: 'drafting', statusWhy: 'draft' });
    expect(nodeOf(m, 'task:never')).toMatchObject({ status: 'built', statusWhy: 'neverRun' });
    expect(nodeOf(m, 'task:stale')).toMatchObject({ status: 'built', statusWhy: 'changedSinceRun' });
    expect(nodeOf(m, 'task:ok')).toMatchObject({ status: 'tested', statusWhy: 'ranSinceChange', canBeReady: true });
  });

  it('an app is tested when every workflow it runs is; a schedule when its workflow is and it is on', () => {
    const m = mergeMap(
      {
        nodes: [
          wf('task:a', { lastSuccessAt: T2 }),
          wf('task:b'),
          { key: 'app:one', kind: 'app', name: 'One', ref: 'one', project },
          { key: 'app:two', kind: 'app', name: 'Two', ref: 'two', project },
          { key: 'app:none', kind: 'app', name: 'None', ref: 'none', project },
          { key: 'schedule:on', kind: 'schedule', name: 'Daily', ref: 'on', project: null, enabled: true },
          { key: 'schedule:off', kind: 'schedule', name: 'Daily', ref: 'off', project: null, enabled: false },
        ],
        edges: [
          { from: 'app:one', to: 'task:a', kind: 'runs' },
          { from: 'app:two', to: 'task:a', kind: 'runs' },
          { from: 'app:two', to: 'task:b', kind: 'runs' },
          { from: 'schedule:on', to: 'task:a', kind: 'triggers' },
          { from: 'schedule:off', to: 'task:a', kind: 'triggers' },
        ],
      },
      emptyPlan()
    );
    expect(nodeOf(m, 'app:one')).toMatchObject({ status: 'tested', statusWhy: 'appTested' });
    expect(nodeOf(m, 'app:two')).toMatchObject({ status: 'built', statusWhy: 'appUntested' });
    expect(nodeOf(m, 'app:none')).toMatchObject({ status: 'built', statusWhy: 'appEmpty' });
    expect(nodeOf(m, 'schedule:on')).toMatchObject({ status: 'tested', statusWhy: 'scheduleTested' });
    expect(nodeOf(m, 'schedule:off')).toMatchObject({ status: 'built', statusWhy: 'scheduleOff' });
  });

  it('Ready holds while the node is still tested and unchanged since the sign-off', () => {
    const signed = plan({
      meta: {
        'task:ok': { readyAt: T2, readyBy: 'Ana' },
        'task:untested': { readyAt: T2 },
      },
    });
    const m = mergeMap({ nodes: [wf('task:ok', { lastSuccessAt: T2 }), wf('task:untested')], edges: [] }, signed);
    expect(nodeOf(m, 'task:ok')).toMatchObject({ status: 'ready', readyBy: 'Ana', readyStale: false });
    expect(nodeOf(m, 'task:untested')).toMatchObject({ status: 'built', readyStale: true });
    expect(m.progress).toMatchObject({ ready: 1, built: 1, total: 2 });

    // Changed after the sign-off and run again: tested, but Ready no longer holds.
    const later = mergeMap(
      { nodes: [wf('task:ok', { changedAt: '2026-11-04T00:00:00.000Z', lastSuccessAt: '2026-11-05T00:00:00.000Z' })], edges: [] },
      signed
    );
    expect(nodeOf(later, 'task:ok')).toMatchObject({ status: 'tested', readyStale: true });
  });

  it("a linked plan node's sign-off counts, and a global can be signed off once it exists", () => {
    const m = mergeMap(
      {
        nodes: [wf('task:ok', { lastSuccessAt: T2 }), { key: 'global:g', kind: 'global', name: 'g', ref: 'g', project: null }],
        edges: [],
      },
      plan({
        nodes: [{ id: 'n1', kind: 'workflow', name: 'OK', inputs: [], outputs: [], link: 'task:ok', readyAt: T2 }],
        meta: { 'global:g': { readyAt: T0 } },
      })
    );
    expect(nodeOf(m, 'task:ok').status).toBe('ready');
    expect(nodeOf(m, 'global:g').status).toBe('ready');
  });
});


describe('layout', () => {
  const nodes = live.nodes.map((n) => ({ key: n.key, lane: n.key === 'app:dash' ? 'AM' : undefined }));

  it('puts what runs a node in an earlier column, and gives every node a place', () => {
    const l = layoutFlow(nodes, live.edges);
    for (const n of nodes) expect(l.positions[n.key]).toBeDefined();
    expect(l.positions['task:purge'].x).toBeLessThan(l.positions['task:sites'].x);
    expect(l.positions['app:dash'].x).toBeLessThan(l.positions['task:report'].x);
    expect(l.width).toBeGreaterThan(l.positions['task:report'].x);
  });

  it('survives a cycle', () => {
    const l = layoutFlow(
      [{ key: 'a' }, { key: 'b' }],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ]
    );
    expect(Object.keys(l.positions)).toHaveLength(2);
  });

  it('splits nodes into lanes in the given order, unassigned last', () => {
    const l = layoutLanes(nodes, live.edges, ['TAM', 'AM']);
    expect(l.lanes.map((x) => x.name)).toEqual(['TAM', 'AM', '']);
    const am = l.lanes[1];
    expect(l.positions['app:dash'].y).toBeGreaterThanOrEqual(am.y);
    expect(l.positions['app:dash'].y).toBeLessThan(am.y + am.h);
  });

  it('boxes each project, with the rest in a shared box', () => {
    const l = layoutGroups(
      [
        { key: 'a', group: 'p1' },
        { key: 'b', group: 'p2' },
        { key: 'c', group: null },
      ],
      [],
      [
        { id: 'p1', name: 'One', color: null },
        { id: 'p2', name: 'Two', color: null },
      ],
      'Shared'
    );
    expect(l.groups.map((g) => g.name)).toEqual(['One', 'Two', 'Shared']);
    for (const g of l.groups) {
      const inside = Object.entries(l.positions).filter(([, p]) => p.x >= g.x && p.x < g.x + g.w && p.y >= g.y && p.y < g.y + g.h);
      expect(inside).toHaveLength(1);
    }
  });

  it('saved positions win and grow the canvas', () => {
    const l = applyPositions(layoutFlow(nodes, live.edges), { 'app:dash': { x: 3000, y: 10 }, 'nope': { x: 1, y: 1 } });
    expect(l.positions['app:dash']).toEqual({ x: 3000, y: 10 });
    expect(l.positions['nope']).toBeUndefined();
    expect(l.width).toBeGreaterThan(3000);
  });
});

describe('placeNode', () => {
  const current = { a: { x: 40, y: 40 }, b: { x: 368, y: 40 }, c: { x: 368, y: 144 } };

  it('a drop to the right or below only moves that card', () => {
    expect(placeNode(current, 'b', { x: 900, y: 600 })).toEqual({ positions: { b: { x: 900, y: 600 } }, shift: null });
    expect(placeNode(current, 'b', { x: 0, y: 0 })).toEqual({ positions: { b: { x: 0, y: 0 } }, shift: null });
  });

  it('a drop past the left or top edge moves everything else instead, keeping the margin', () => {
    const { positions, shift } = placeNode(current, 'b', { x: -300, y: 10 });
    expect(shift).toEqual({ x: 340, y: 0 });
    expect(positions).toEqual({ a: { x: 380, y: 40 }, b: { x: 40, y: 10 }, c: { x: 708, y: 144 } });
  });

  it('shifts both ways when dropped above and to the left', () => {
    const { positions, shift } = placeNode(current, 'c', { x: -20, y: -100 });
    expect(shift).toEqual({ x: 60, y: 140 });
    expect(positions.c).toEqual({ x: 40, y: 40 });
    expect(positions.a).toEqual({ x: 100, y: 180 });
  });

  it('applyPositions keeps the shifted places as they are', () => {
    const nodes = Object.keys(current).map((key) => ({ key }));
    const { positions } = placeNode(current, 'b', { x: -300, y: 10 });
    expect(applyPositions(layoutFlow(nodes, []), positions).positions).toEqual(positions);
  });
});

describe('draftBrief', () => {
  it('describes the planned workflow from its node and lines, reusing the built helpers it runs', () => {
    const m = mergeMap(
      live,
      plan({
        nodes: [
          { id: 'n1', kind: 'workflow', name: 'Warm cache', description: 'Warm every page.', inputs: ['customer'], outputs: ['warmed'] },
        ],
        edges: [
          { id: 'e1', from: 'plan:n1', to: 'task:sites', kind: 'calls' },
          { id: 'e2', from: 'plan:n1', to: 'global:cacheTtl', kind: 'reads' },
          { id: 'e3', from: 'app:console', to: 'plan:n1', kind: 'runs' },
        ],
      })
    );
    const brief = draftBrief(m, 'plan:n1');
    expect(brief.reuse).toEqual([{ identifier: 'sites', name: 'Data: sites' }]);
    expect(brief.text).toContain('"Warm cache"');
    expect(brief.text).toContain('Warm every page.');
    expect(brief.text).toContain('Inputs: customer.');
    expect(brief.text).toContain('_global.cacheTtl');
    expect(brief.text).toContain('Purge console');
  });
});

describe('clusterLeaves', () => {
  // The CMS example: one app running 27 workflows; only the deploy one also reads globals.
  const cms = (() => {
    const nodes: LiveMap['nodes'] = [{ key: 'app:cms', kind: 'app', name: 'CMS', ref: 'cms', project }];
    const edges: LiveMap['edges'] = [];
    for (let i = 0; i < 27; i++) {
      nodes.push({ key: `task:w${i}`, kind: 'workflow', name: `W${i}`, ref: `w${i}`, project });
      edges.push({ from: 'app:cms', to: `task:w${i}`, kind: 'runs' });
    }
    for (const g of ['CF_ACCOUNT', 'CF_TOKEN']) {
      nodes.push({ key: `global:${g}`, kind: 'global', name: g, ref: g, project: null });
      edges.push({ from: 'task:w26', to: `global:${g}`, kind: 'reads' });
    }
    return mergeMap({ nodes, edges }, emptyPlan());
  })();

  it("boxes an app's own workflows, keeps the ones with other lines out, and draws one line for the box", () => {
    const c = clusterLeaves(cms.nodes, cms.edges);
    expect(c.clusters).toHaveLength(1);
    const box = c.clusters[0];
    expect(box).toMatchObject({ anchor: 'app:cms', edgeKind: 'runs', toAnchor: false, open: false });
    expect(box.members).toHaveLength(26);
    expect(box.members).not.toContain('task:w26');
    expect(c.nodes.map((n) => n.key).sort()).toEqual(['app:cms', 'global:CF_ACCOUNT', 'global:CF_TOKEN', 'task:w26']);
    expect(c.edges.find((e) => e.to === box.key)).toMatchObject({ from: 'app:cms', kind: 'runs', count: 26 });
    expect(c.edges.some((e) => e.to === 'task:w0')).toBe(false);
  });

  it('opens small boxes and closes big ones, unless toggled', () => {
    const big = clusterLeaves(cms.nodes, cms.edges);
    expect(big.clusters[0].open).toBe(false);
    expect(clusterLeaves(cms.nodes, cms.edges, { toggled: new Set([big.clusters[0].key]) }).clusters[0].open).toBe(true);
    expect(clusterLeaves(cms.nodes, cms.edges, { openMax: 30 }).clusters[0].open).toBe(true);
  });

  it('leaves fewer than the minimum, planned nodes and flagged nodes alone', () => {
    expect(clusterLeaves(cms.nodes, cms.edges, { min: 30 }).clusters).toEqual([]);
    const m = mergeMap(
      { nodes: cms.nodes.map((n) => ({ ...n, ref: n.ref ?? n.key, project: n.project })) as any, edges: cms.edges as any },
      plan({ nodes: [{ id: 'p1', kind: 'workflow', name: 'Planned', inputs: [], outputs: [] }], edges: [{ id: 'e', from: 'app:cms', to: 'plan:p1', kind: 'runs' }] })
    );
    expect(clusterLeaves(m.nodes, m.edges).clusters[0].members).not.toContain('plan:p1');
  });

  it('lays a closed box out as one card and an open one as a grid, with the app level with the middle', () => {
    const c = clusterLeaves(cms.nodes, cms.edges, { openMax: 30 });
    const box = c.clusters[0];
    const size = clusterSize(box);
    const grid = clusterGrid(box.members.length);
    expect(size).toEqual({ w: grid.w, h: grid.h });
    expect(grid.cells).toHaveLength(26);
    expect(grid.h).toBeLessThan(grid.w);

    const l = layoutFlow(
      [...c.nodes.map((n) => ({ key: n.key })), { key: box.key, ...size }],
      c.edges
    );
    expect(l.sizes[box.key]).toEqual(size);
    expect(l.positions['app:cms'].x + MAP_NODE_W).toBeLessThan(l.positions[box.key].x);
    const boxMid = l.positions[box.key].y + size.h / 2;
    const appMid = l.positions['app:cms'].y + MAP_NODE_H / 2;
    expect(Math.abs(boxMid - appMid)).toBeLessThan(size.h / 2);
  });
});

describe('notes', () => {
  it('keeps sticky notes with defaults, and drops ones that are not notes', () => {
    const p = parsePlan({ notes: [{ id: 'n1', text: 'Ask the AM team', x: 10, y: 20 }] });
    expect(p.notes).toEqual([{ id: 'n1', text: 'Ask the AM team', x: 10, y: 20, w: 220, color: 'yellow' }]);
    expect(parsePlan({ notes: [{ id: 'n1', x: 'left' }] })).toEqual(emptyPlan());
  });

  it("puts a node's note on it: from meta for live nodes, from the plan node when planned or linked", () => {
    const m = mergeMap(
      live,
      plan({
        meta: { 'task:report': { note: 'Weekly for AMs' } },
        nodes: [
          { id: 'p1', kind: 'workflow', name: 'Later', inputs: [], outputs: [], note: 'Needs CDN access' },
          { id: 'p2', kind: 'app', name: 'Dash', inputs: [], outputs: [], link: 'app:dash', note: 'Owned by Ana' },
        ],
      })
    );
    expect(m.nodes.find((n) => n.key === 'task:report')!.note).toBe('Weekly for AMs');
    expect(m.nodes.find((n) => n.key === 'plan:p1')!.note).toBe('Needs CDN access');
    expect(m.nodes.find((n) => n.key === 'app:dash')!.note).toBe('Owned by Ana');
  });
});

describe('lane grouping', () => {
  const n = (over: Partial<{ owner: string; lane: string; status: any; kind: any }>) => ({
    kind: 'workflow' as const,
    status: 'idea' as const,
    ...over,
  });

  it('groups by owner unless the plan has custom lanes or a choice', () => {
    expect(laneByOf({ lanes: [] })).toBe('owner');
    expect(laneByOf({ lanes: ['TAM'] })).toBe('custom');
    expect(laneByOf({ lanes: ['TAM'], laneBy: 'status' })).toBe('status');
  });

  it('puts each node in the lane its grouping says, blank owners in none', () => {
    const node = n({ owner: '  Ana ', lane: 'TAM', status: 'built', kind: 'app' });
    expect(laneOfNode(node, 'owner')).toBe('Ana');
    expect(laneOfNode(node, 'custom')).toBe('TAM');
    expect(laneOfNode(node, 'status')).toBe('built');
    expect(laneOfNode(node, 'kind')).toBe('app');
    expect(laneOfNode(n({ owner: '  ' }), 'owner')).toBeUndefined();
  });

  it('orders lanes: custom as given, statuses and kinds in their order, owners by name', () => {
    const nodes = [
      n({ owner: 'zoe', status: 'ready', kind: 'schedule' }),
      n({ owner: 'Ana', status: 'idea', kind: 'app' }),
      n({}),
    ];
    expect(laneOrder(nodes, 'custom', ['B', 'A'])).toEqual(['B', 'A']);
    expect(laneOrder(nodes, 'owner', [])).toEqual(['Ana', 'zoe']);
    expect(laneOrder(nodes, 'status', [])).toEqual(['idea', 'ready']);
    expect(laneOrder(nodes, 'kind', [])).toEqual(['workflow', 'app', 'schedule']);
  });
});
