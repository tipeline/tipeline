import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { coreValidations } from '@tipeline/schemas';
import { scaffoldAppSource, type AppComponentUse } from '@tipeline/utils';
import { appWorkflowUses } from '@database/services/WorkflowUsageService';

const example = (name: string) =>
  yaml.load(
    fs.readFileSync(
      path.resolve(__dirname, '../../../../examples/projects/roastery-ops/apps', name),
      'utf8'
    )
  ) as any;

const names = (uses: AppComponentUse[] | undefined) =>
  (uses ?? []).map((u) => u.component ?? `(${u.page})`);

describe('appWorkflowUses', () => {
  const manager = appWorkflowUses(JSON.stringify(example('roastery-manager.yml')));

  it('lists every component that shows a workflow', () => {
    expect(names(manager.uses.get('roastDashboard'))).toEqual([
      'Revenue',
      'Orders today',
      'Open orders',
      'Low stock',
      'Sales by day',
      'By channel',
      'Best sellers',
      'Running low',
    ]);
    expect(
      manager.uses
        .get('roastDashboard')!
        .every((u) => u.page === 'Dashboard' && u.ways[0].kind === 'shows')
    ).toBe(true);
  });

  it('gives one component its events, with the row and bulk action labels', () => {
    const status = manager.uses.get('roastSetOrderStatus')!;
    expect(names(status)).toEqual(['Orders']);
    expect(status[0].ways.map((w) => (w.kind === 'event' ? w.event : w.kind))).toEqual([
      'action:ship',
      'bulk:roast',
      'bulk:ship',
      'bulk:cancel',
    ]);
    expect(status[0].ways.every((w) => w.kind === 'event' && !!w.label)).toBe(true);
  });

  it('lists a runnable nobody shows under its page', () => {
    // setup runs when the dashboard opens; no component reads it.
    expect(manager.uses.get('roastSetup')).toEqual([
      { pageId: 'dashboard', page: 'Dashboard', ways: [{ kind: 'pageLoad' }] },
    ]);
  });

  it('counts pages and components', () => {
    expect(manager.pageCount).toBe(5);
    expect(manager.components.find((c) => c.id === 'ordersTable')).toMatchObject({
      page: 'Orders',
      name: 'Orders',
      type: 'table',
    });
  });

  it('uses nothing when the source is broken', () => {
    expect(appWorkflowUses('{not json').uses.size).toBe(0);
    expect(appWorkflowUses(null).components).toEqual([]);
  });
});

describe('scaffoldAppSource', () => {
  const orders = {
    identifier: 'listOrders',
    name: 'List Orders',
    inputs: ['status'],
    outputs: ['orders', 'count'],
  };
  const add = {
    identifier: 'addOrder',
    name: 'Add Order',
    inputs: ['customer', 'beanId', 'kg'],
    outputs: ['order'],
  };
  const source = scaffoldAppSource([
    {
      name: 'My orders',
      components: [
        { type: 'kpi', name: 'Open', workflow: orders },
        { type: 'kpi', name: 'Open', workflow: orders },
        { type: 'table', name: 'Orders', workflow: orders },
        { type: 'form', name: 'Place an order', workflow: add },
        { type: 'button', name: 'Email invoice' },
      ],
    },
    {
      name: 'Catalog',
      components: [
        { type: 'chart', name: 'Prices', workflow: orders },
        { type: 'keyValue', name: 'Details' },
        { type: 'select', name: 'Region', workflow: orders },
        { type: 'text', name: 'Read me' },
      ],
    },
  ]);

  it('makes an app that passes the app check', () => {
    expect(() => coreValidations.appObject.parseAppSource(source)).not.toThrow();
  });

  it('wires each component to its workflow', () => {
    const page = source.pages[0];
    expect(source.workflows).toEqual({
      listOrders: { identifier: 'listOrders' },
      addOrder: { identifier: 'addOrder' },
    });
    // Everything showing List Orders on one page shares one run when the page opens.
    expect(Object.keys(page.runnables)).toEqual(['listOrders', 'placeAnOrder']);
    expect(page.runnables.listOrders).toMatchObject({ trigger: 'load', persist: false });
    expect(page.components.map((c: any) => c.id)).toEqual([
      'open',
      'open2',
      'orders',
      'placeAnOrder',
      'emailInvoice',
    ]);
    expect(page.components[2].props.data).toBe('{= runnables.listOrders.outputs.orders =}');
    const form = page.components[3];
    expect(form.props.fields.map((f: any) => f.name)).toEqual(['customer', 'beanId', 'kg']);
    expect(form.events.submit).toEqual([{ type: 'run', runnable: 'placeAnOrder' }]);
    expect(page.runnables.placeAnOrder.inputs.kg).toBe('{= placeAnOrder.values.kg =}');
    // No workflow (or one that isn't built yet): made, just not connected.
    expect(page.components[4].events).toEqual({});
  });

  it('lays components out left to right, wrapping rows', () => {
    const [kpi1, kpi2, table] = source.pages[0].components.map((c: any) => c.layout);
    expect(kpi1).toEqual({ x: 0, y: 0, w: 3, h: 14 });
    expect(kpi2).toEqual({ x: 3, y: 0, w: 3, h: 14 });
    expect(table).toEqual({ x: 0, y: 14, w: 12, h: 35 });
  });

  it('declares workflows the plan says it runs that no component uses', () => {
    const alerts = {
      identifier: 'dataAlerts',
      name: 'Data: Alerts',
      inputs: [],
      outputs: ['alerts'],
    };
    const app = scaffoldAppSource(
      [{ name: 'Page 1', components: [{ type: 'table', name: 'Table1' }] }],
      [alerts]
    );
    expect(app.workflows).toEqual({ dataAlerts: { identifier: 'dataAlerts' } });
    expect(app.pages[0].runnables).toEqual({});
    expect(() => coreValidations.appObject.parseAppSource(app)).not.toThrow();
    // No pages planned: one empty Home page, like a new app.
    expect(scaffoldAppSource([], [alerts]).pages.map((p: any) => p.id)).toEqual(['home']);
  });

  it('gives each page its own id', () => {
    const twin = scaffoldAppSource([
      { name: 'Orders', components: [] },
      { name: 'Orders', components: [] },
    ]);
    expect(twin.pages.map((p: any) => p.id)).toEqual(['orders', 'orders-2']);
    expect(() => coreValidations.appObject.parseAppSource(twin)).not.toThrow();
  });
});
