// Migrates a v1 app source (the format before `schemaVersion` existed) to v2, a v2
// source to v3 and a v3 source to v4 (see migrateAppSourceV2 / V3 at the end).
import { upgradeHighlightRule } from '@tipeline/utils';
//
// v1 recap: components kept `properties` (with `events` nested inside) and
// `layout: { position: {x,y}, size: {w,h} }`; event actions referenced raw workflow
// identifiers (`exec`, `fetch`, `setVar`) and passed data through a flat page-variable
// store (`setVar` / `getVar`, read in text as `{{name}}`).
//
// v2 equivalents:
//   exec      → a `run` runnable + `{ type: run }` action
//   fetch     → a `history` runnable (trigger: load) whose rows the table binds as `data`
//   setVar    → a `history` runnable whose onSuccess stores row 0 in `state.<name>`
//               (v1 stored the row itself only when exactly one came back, else the array)
//   getVar    → the table binds `data` to `state.<name>`
//   navigate  → `{ type: navigate, page }`
//   page `ready` → page `events.load`
//   `{{name}}` in text/KPI → `{{ state.name }}`
//   `variables: [{name, value}]` → `state: { name: value }`
// Component types v1 only showed as placeholders (form, chart, media, container) had
// nothing configurable and are dropped. Workflow identifiers become aliases under `workflows`.

const V2_TYPES = ['text', 'button', 'kpi', 'table'];
const RESERVED = ['state', 'runnables', 'page', 'result', 'error'];
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const BUTTON_VARIANTS = ['default', 'outline', 'ghost', 'destructive', 'secondary', 'link'];
const FONT_WEIGHTS = ['normal', 'medium', 'semibold', 'bold'];
const TREND_DIRECTIONS = ['up', 'down', 'neutral'];
const COLUMN_FORMATS = ['text', 'number', 'currency', 'percent', 'date', 'datetime'];
const FILTER_MODES = ['latest', 'range', 'byId', 'dateRange'];

function toBindingName(raw: unknown, fallback: string): string {
  let name = String(raw ?? '').replace(/[^a-zA-Z0-9_]/g, '_');
  if (!/^[a-zA-Z]/.test(name)) name = `${fallback}_${name}`.replace(/_+$/, '');
  return name || fallback;
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name) || RESERVED.includes(name); n++) name = `${base}_${n}`;
  taken.add(name);
  return name;
}

function clampLayout(c: any) {
  const pos = c.layout?.position ?? c.position ?? {};
  const size = c.layout?.size ?? c.size ?? {};
  const int = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
  const w = Math.min(12, Math.max(1, int(size.w, 3)));
  const x = Math.min(12 - w, Math.max(0, int(pos.x, 0)));
  return { x, y: Math.max(0, int(pos.y, 0)), w, h: Math.max(1, int(size.h, 2)) };
}

/** v1 resolved `{{name}}` against the flat page-variable store, which is v2 `state`. */
function toStateRefs(value: unknown): unknown {
  return typeof value === 'string'
    ? value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => `{{ state.${path} }}`)
    : value;
}

function applyTransform(name: string, transform: unknown): string {
  switch (transform) {
    case 'uppercase':
      return name.toUpperCase();
    case 'lowercase':
      return name.toLowerCase();
    case 'capitalize':
      return name.replace(/\b\w/g, (ch) => ch.toUpperCase());
    case 'snakeToTitle':
      return name.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    default:
      return name;
  }
}

function pick(obj: Record<string, unknown>, entries: Record<string, unknown>) {
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) obj[key] = value;
  return obj;
}

function migrateProps(type: string, p: any): Record<string, unknown> {
  switch (type) {
    case 'text':
      return pick(
        {},
        {
          content: typeof p.content === 'string' ? toStateRefs(p.content) : undefined,
          fontSize:
            Number.isFinite(Number(p.fontSize)) && Number(p.fontSize) > 0
              ? Number(p.fontSize)
              : undefined,
          fontWeight: FONT_WEIGHTS.includes(p.fontWeight) ? p.fontWeight : undefined,
          color: typeof p.color === 'string' && p.color ? p.color : undefined,
        }
      );
    case 'button':
      return pick(
        {},
        {
          label: typeof p.label === 'string' ? p.label : undefined,
          variant: BUTTON_VARIANTS.includes(p.variant) ? p.variant : undefined,
        }
      );
    case 'kpi':
      return pick(
        {},
        {
          label: typeof p.label === 'string' ? toStateRefs(p.label) : undefined,
          value:
            typeof p.value === 'string'
              ? toStateRefs(p.value)
              : typeof p.value === 'number'
                ? p.value
                : undefined,
          trend:
            p.trend == null || p.trend === ''
              ? undefined
              : Number.isFinite(Number(p.trend))
                ? Number(p.trend)
                : undefined,
          trendDirection: TREND_DIRECTIONS.includes(p.trendDirection)
            ? p.trendDirection
            : undefined,
        }
      );
    case 'table': {
      const cols = Array.isArray(p.config?.columns) ? p.config.columns : [];
      const columns = cols
        .filter((col: any) => col && typeof col.key === 'string' && col.key)
        .map((col: any) =>
          pick(
            { key: col.key },
            {
              header: typeof col.header === 'string' ? col.header : undefined,
              sortable: typeof col.sortable === 'boolean' ? col.sortable : undefined,
              format: COLUMN_FORMATS.includes(col.format) ? col.format : undefined,
            }
          )
        );
      return columns.length ? { columns } : {};
    }
    default:
      return {};
  }
}

export function migrateAppSourceV1(v1: any): any {
  const workflows: Record<string, { identifier: string }> = {};
  const aliasByIdentifier = new Map<string, string>();
  const workflowNames = new Set<string>();
  const workflowAlias = (identifier: string) => {
    let alias = aliasByIdentifier.get(identifier);
    if (!alias) {
      alias = uniqueName(`workflow${aliasByIdentifier.size + 1}`, workflowNames);
      aliasByIdentifier.set(identifier, alias);
      workflows[alias] = { identifier };
    }
    return alias;
  };

  const state: Record<string, unknown> = {};
  for (const variable of Array.isArray(v1.variables) ? v1.variables : []) {
    if (variable && NAME_PATTERN.test(variable.name)) state[variable.name] = variable.value ?? null;
  }

  const pages = (Array.isArray(v1.pages) ? v1.pages : []).map((page: any) => {
    const runnables: Record<string, any> = {};
    const runnableNames = new Set<string>();
    const componentIds = new Set<string>();

    const historyRunnable = (a: any, trigger: 'load' | 'manual') => {
      const filter = pick(
        { mode: FILTER_MODES.includes(a.filterMode) ? a.filterMode : 'latest' },
        {
          count:
            a.filterMode === 'range' && Number(a.count) > 0
              ? Math.round(Number(a.count))
              : undefined,
          pipelineIdentifier:
            a.filterMode === 'byId' ? a.pipelineIdentifier || undefined : undefined,
          dateFrom: a.filterMode === 'dateRange' ? a.dateFrom || undefined : undefined,
          dateTo: a.filterMode === 'dateRange' ? a.dateTo || undefined : undefined,
        }
      );
      const source = a.sourceType === 'variables' ? 'variables' : 'actionResults';
      return pick(
        {
          mode: 'history',
          workflow: workflowAlias(a.taskIdentifier),
          trigger,
          source,
          filter,
          onSuccess: [],
          onError: [],
        },
        {
          actionIdentifier:
            source === 'actionResults' ? a.actionIdentifier || undefined : undefined,
          variableName: source === 'variables' ? a.variableName || undefined : undefined,
        }
      );
    };

    // Converts one v1 action. `table` is set when the action sits on a table's `ready`
    // event — the only place v1 fetch/getVar actions had a target to fill.
    const convert = (a: any, table?: { props: Record<string, unknown> }): any[] => {
      if (!a || typeof a !== 'object') return [];
      switch (a.type) {
        case 'exec': {
          if (!a.taskIdentifier) return [];
          const name = uniqueName(`run${runnableNames.size + 1}`, runnableNames);
          runnables[name] = {
            mode: 'run',
            workflow: workflowAlias(a.taskIdentifier),
            trigger: 'manual',
            inputs: a.variables && typeof a.variables === 'object' ? a.variables : {},
            outputs: [],
            persist: true,
            onSuccess: [],
            onError: [],
            onPaused: [],
          };
          return [{ type: 'run', runnable: name }];
        }
        case 'navigate': {
          const target = a.targetPageId ?? a.target;
          return target ? [{ type: 'navigate', page: String(target) }] : [];
        }
        case 'fetch': {
          if (!table || !a.taskIdentifier) return [];
          const name = uniqueName(`fetch${runnableNames.size + 1}`, runnableNames);
          runnables[name] = historyRunnable(a, 'load');
          table.props.data = `{= runnables.${name}.data =}`;
          if (!table.props.columns && typeof a.columns === 'string' && a.columns.trim()) {
            table.props.columns = a.columns
              .split(',')
              .map((key: string) => key.trim())
              .filter(Boolean)
              .map((key: string) => ({ key, header: applyTransform(key, a.columnTransform) }));
          }
          return [];
        }
        case 'setVar': {
          if (!a.taskIdentifier || !a.targetVariable) return [];
          const key = toBindingName(a.targetVariable, 'value');
          const name = uniqueName(`fetch${runnableNames.size + 1}`, runnableNames);
          runnables[name] = {
            ...historyRunnable(a, 'manual'),
            onSuccess: [{ type: 'setState', key, value: '{= result.data[0] =}' }],
          };
          if (!(key in state)) state[key] = null;
          return [{ type: 'run', runnable: name }];
        }
        case 'getVar': {
          if (table && a.variableName)
            table.props.data = `{= state.${toBindingName(a.variableName, 'value')} =}`;
          return [];
        }
        default:
          return [];
      }
    };
    const convertAll = (list: unknown, table?: { props: Record<string, unknown> }) =>
      (Array.isArray(list) ? list : []).flatMap((a) => convert(a, table));

    // Page events first, so runnable names and workflow aliases follow document order.
    const load = convertAll(page.events?.ready);

    const components = (Array.isArray(page.components) ? page.components : [])
      .filter((c: any) => c && V2_TYPES.includes(c.type))
      .map((c: any) => {
        const properties = c.properties ?? {};
        const props = migrateProps(c.type, properties);
        const v1Events = properties.events ?? {};
        const events: Record<string, any[]> = {};
        if (c.type === 'button') {
          const click = convertAll(v1Events.click);
          if (click.length) events.click = click;
        }
        if (c.type === 'table') {
          convertAll(v1Events.ready, { props });
          const rowClick = convertAll(v1Events.rowClick);
          if (rowClick.length) events.rowClick = rowClick;
        }
        return {
          id: uniqueName(toBindingName(c.id, c.type), componentIds),
          type: c.type,
          name: typeof c.name === 'string' && c.name ? c.name : c.type,
          layout: clampLayout(c),
          props,
          events,
        };
      });

    return {
      id: String(page.id ?? ''),
      name: String(page.name ?? page.id ?? ''),
      ...(typeof page.icon === 'string' && page.icon ? { icon: page.icon } : {}),
      showInMenu: page.showInMenu !== false,
      runnables,
      events: load.length ? { load } : {},
      components,
    };
  });

  return {
    schemaVersion: 2,
    ...(typeof v1.version === 'string' ? { version: v1.version } : {}),
    workflows,
    state,
    pages,
  };
}

// v2 → v3: grid rows went from 70px to 10px. Every component keeps its size and place
// (a container's children too — their layout is relative to it, in the same rows).
const V2_ROW_IN_V3_ROWS = 7;

export function migrateAppSourceV2(v2: any): any {
  const scale = (layout: any) =>
    layout && typeof layout === 'object'
      ? {
          ...layout,
          ...(typeof layout.y === 'number' ? { y: layout.y * V2_ROW_IN_V3_ROWS } : {}),
          ...(typeof layout.h === 'number' ? { h: layout.h * V2_ROW_IN_V3_ROWS } : {}),
        }
      : layout;
  return {
    ...v2,
    schemaVersion: 3,
    pages: Array.isArray(v2.pages)
      ? v2.pages.map((page: any) =>
          page && Array.isArray(page.components)
            ? {
                ...page,
                components: page.components.map((c: any) =>
                  c && typeof c === 'object' ? { ...c, layout: scale(c.layout) } : c
                ),
              }
            : page
        )
      : v2.pages,
  };
}

// v3 → v4: color rules use the same conditions as a workflow's If.
// `{ when: '>', value: 1000 }` becomes `{ compareAs: number, operator: gt, value: 1000 }`
// (text comparisons keep ignoring case, as they did) — on table columns' `highlight`
// and progress `colorRules`.
export function migrateAppSourceV3(v3: any): any {
  const rules = (list: unknown) => (Array.isArray(list) ? list.map(upgradeHighlightRule) : list);
  const component = (c: any) => {
    if (!c || typeof c !== 'object' || !c.props || typeof c.props !== 'object') return c;
    const props = { ...c.props };
    if (Array.isArray(props.columns)) {
      props.columns = props.columns.map((col: any) =>
        col && typeof col === 'object' && Array.isArray(col.highlight)
          ? { ...col, highlight: rules(col.highlight) }
          : col
      );
    }
    if (Array.isArray(props.colorRules)) props.colorRules = rules(props.colorRules);
    return { ...c, props };
  };
  return {
    ...v3,
    schemaVersion: 4,
    pages: Array.isArray(v3.pages)
      ? v3.pages.map((page: any) =>
          page && Array.isArray(page.components) ? { ...page, components: page.components.map(component) } : page
        )
      : v3.pages,
  };
}
