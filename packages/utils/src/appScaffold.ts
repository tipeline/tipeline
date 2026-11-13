import type { PlanComponentType } from './projectMap';

/**
 * Building a first version of an app from its planned pages: every page and component,
 * each component connected to its workflow, laid out on the grid. No guessing: the same
 * plan always makes the same app, and the person takes it from there in the builder.
 *
 * The result is an app source (schema version 4) as plain data; Core checks it when the
 * app is made.
 */

/** A built workflow a planned component uses: what's known about it from the map. */
export type ScaffoldWorkflow = {
  identifier: string;
  name: string;
  inputs: string[];
  outputs: string[];
};

export type ScaffoldComponent = {
  type: PlanComponentType;
  name: string;
  /** Left out (or not built yet): the component is made without a workflow. */
  workflow?: ScaffoldWorkflow;
};

export type ScaffoldPage = { name: string; components: ScaffoldComponent[] };

/** Grid size of each kind (12 columns, rows of 10px), as the builder's palette adds them. */
const SIZE: Record<PlanComponentType, { w: number; h: number }> = {
  table: { w: 12, h: 35 },
  kpi: { w: 3, h: 14 },
  chart: { w: 6, h: 28 },
  keyValue: { w: 6, h: 28 },
  form: { w: 6, h: 42 },
  button: { w: 3, h: 7 },
  select: { w: 4, h: 12 },
  text: { w: 12, h: 6 },
};

const RESERVED = new Set(['state', 'runnables', 'page', 'result', 'error']);
const FIELD_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** "Price list" → priceList; something that must start with a letter. */
function camel(text: string, fallback: string): string {
  const words = text
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .split(/[\s_]+/)
    .filter(Boolean);
  let name = words
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1)))
    .join('');
  name = name.replace(/[^a-zA-Z0-9_]/g, '');
  if (!/^[a-zA-Z]/.test(name)) name = fallback + name;
  return name || fallback;
}

/** A name not taken yet: priceList, priceList2… */
function unique(base: string, taken: Set<string>): string {
  let name = base;
  for (let i = 2; taken.has(name) || RESERVED.has(name); i++) name = `${base}${i}`;
  taken.add(name);
  return name;
}

const slug = (text: string) =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';

const label = (name: string) => {
  const spaced = name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : name;
};

/** Puts each component left to right, starting a new row when one doesn't fit. */
function place(
  sizes: { w: number; h: number }[]
): { x: number; y: number; w: number; h: number }[] {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return sizes.map((s) => {
    if (x + s.w > 12) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const at = { x, y, w: s.w, h: s.h };
    x += s.w;
    rowH = Math.max(rowH, s.h);
    return at;
  });
}

/**
 * `alsoRuns`: workflows the plan says the app runs (a line drawn by hand) that no planned
 * component uses. They're declared in the app, so the builder offers them and the line is
 * real, ready to connect to a component.
 */
export function scaffoldAppSource(
  pages: ScaffoldPage[],
  alsoRuns: ScaffoldWorkflow[] = []
): Record<string, any> {
  const workflows: Record<string, { identifier: string }> = {};
  const aliasOf = new Map<string, string>();
  const aliases = new Set<string>();
  const pageIds = new Set<string>();

  const alias = (wf: ScaffoldWorkflow) => {
    let a = aliasOf.get(wf.identifier);
    if (!a) {
      a = unique(camel(wf.name, 'workflow'), aliases);
      aliasOf.set(wf.identifier, a);
      workflows[a] = { identifier: wf.identifier };
    }
    return a;
  };

  const outPages = (pages.length ? pages : [{ name: 'Home', components: [] }]).map((page) => {
    let id = slug(page.name);
    for (let i = 2; pageIds.has(id); i++) id = `${slug(page.name)}-${i}`;
    pageIds.add(id);

    const ids = new Set<string>();
    const runnableNames = new Set<string>();
    const runnables: Record<string, any> = {};
    const loadRuns = new Map<string, string>();
    const layouts = place(page.components.map((c) => SIZE[c.type]));

    const components = page.components.map((c, i) => {
      const cid = unique(camel(c.name, c.type), ids);
      const wf = c.workflow;
      const component: Record<string, any> = {
        id: cid,
        type: c.type,
        name: c.name,
        layout: layouts[i],
        props: {},
        events: {},
      };
      // What a run returns, as a binding: its first output (a table shows a list, say).
      let shown: string | undefined;
      let run: string | undefined;
      if (wf) {
        const fires = c.type === 'form' || c.type === 'button';
        if (fires) {
          // Each form or button runs it on its own.
          run = unique(cid, runnableNames);
          runnables[run] = {
            mode: 'run',
            workflow: alias(wf),
            trigger: 'manual',
            outputs: [...wf.outputs],
            onSuccess: [
              { type: 'toast', message: `${wf.name}: done`, variant: 'success' },
              ...(c.type === 'form' ? [{ type: 'reset', component: cid }] : []),
            ],
          };
        } else {
          // Everything on the page showing the same workflow shares one run when the page
          // opens, without run history for every page view.
          run = loadRuns.get(wf.identifier);
          if (!run) {
            run = unique(camel(wf.name, 'data'), runnableNames);
            loadRuns.set(wf.identifier, run);
            runnables[run] = {
              mode: 'run',
              workflow: alias(wf),
              trigger: 'load',
              outputs: [...wf.outputs],
              persist: false,
            };
          }
          const first = wf.outputs[0];
          if (first) shown = `runnables.${run}.outputs.${first}`;
        }
      }
      const bind = (path: string) => `{= ${path} =}`;
      switch (c.type) {
        case 'table':
          if (shown) component.props.data = bind(shown);
          break;
        case 'chart':
          component.props.title = c.name;
          if (shown) component.props.data = bind(shown);
          break;
        case 'keyValue':
          component.props.title = c.name;
          if (shown) component.props.data = bind(shown);
          break;
        case 'kpi':
          component.props.label = c.name;
          if (shown) component.props.value = bind(shown);
          break;
        case 'select':
          component.props.label = c.name;
          if (shown) component.props.options = bind(shown);
          break;
        case 'text':
          component.props.content = shown ? `{{ ${shown} }}` : c.name;
          break;
        case 'button':
          component.props.label = c.name;
          if (run) component.events.click = [{ type: 'run', runnable: run }];
          break;
        case 'form': {
          component.props.title = c.name;
          const fields = (wf?.inputs ?? []).filter((name) => FIELD_NAME.test(name));
          component.props.fields = fields.map((name) => ({
            name,
            label: label(name),
            type: 'text',
          }));
          if (run) {
            runnables[run].inputs = Object.fromEntries(
              fields.map((name) => [name, bind(`${cid}.values.${name}`)])
            );
            component.events.submit = [{ type: 'run', runnable: run }];
          }
          break;
        }
      }
      return component;
    });

    return { id, name: page.name, showInMenu: true, runnables, events: {}, components };
  });

  for (const wf of alsoRuns) alias(wf);

  return { schemaVersion: 4, version: '1.0.0', workflows, state: {}, pages: outPages };
}
