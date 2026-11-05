import { z } from 'zod';

// --------------------------------------------------
// Result caching: which steps may be cached, and the `cache` config shapes
// --------------------------------------------------
//
// A cache hit skips the work, so it also skips anything the step *does*. Only steps
// whose result is plain data and that don't change anything outside the run can be
// cached: pure transforms, and reads (files, the web, AI, OCR). Never sends, writes,
// launches, live handles (browser, database connection, spreadsheet), flow control,
// approvals, variable.set, sub-workflows (they have their own workflow cache), or
// anything that depends on the clock or randomness.
//
// `script.runScript` is allowed: it's the author's own code, and opting a step into
// the cache is the author saying it has no side effects.

type CachePredicate = (params: Record<string, any>) => boolean;

const READ_METHOD = (params: Record<string, any>) =>
  ['get', 'head'].includes(String(params?.method ?? 'get').toLowerCase());

const READ_SQL = (params: Record<string, any>) =>
  /^\s*(select|with|explain)\b/i.test(String(params?.sql ?? ''));

// group → action → true, or a check on the step's resolved params (a request that
// only reads, a query that only selects). '*' = every action in the group except
// the ones listed under `except`.
const CACHEABLE: Record<
  string,
  { all?: true; except?: string[]; actions?: Record<string, true | CachePredicate> }
> = {
  ai: { actions: { prompt: true } },
  api: { actions: { request: READ_METHOD } },
  array: { all: true, except: ['shuffle', 'sample'] },
  audio: { actions: { getInfo: true } },
  cryptography: {
    actions: {
      base64EncodeText: true,
      base64EncodeFile: true,
      base64DecodeText: true,
      hashText: true,
      hashFile: true,
      hmacText: true,
      hmacFile: true,
    },
  },
  database: { actions: { query: READ_SQL } },
  datetime: { all: true, except: ['getCurrentDateTime', 'nowISO'] },
  file: {
    actions: {
      fileExists: true,
      read: true,
      readCSV: true,
      getFilePathPart: true,
      convertFileToBase64: true,
    },
  },
  folder: { actions: { exists: true, getFiles: true, getSubfolders: true } },
  html: { all: true },
  http: { actions: { request: READ_METHOD } },
  image: { actions: { metadata: true } },
  math: { all: true, except: ['random'] },
  network: {
    actions: { resolveDNS: true, lookup: true, reverseDNS: true, ping: true, checkTlsCertificate: true },
  },
  object: { all: true },
  ocr: { actions: { recognize: true } },
  pdf: { actions: { extractText: true, getPageCount: true } },
  qrcode: { actions: { read: true } },
  script: { actions: { runScript: true } },
  string: { all: true },
  video: { actions: { getInfo: true, getDuration: true } },
  xml: { all: true },
};

const lookup = (group: string, name: string): true | CachePredicate | false => {
  const entry = CACHEABLE[group];
  if (!entry) return false;
  if (entry.all) return entry.except?.includes(name) ? false : true;
  return entry.actions?.[name] ?? false;
};

/**
 * Whether a built-in step may carry a `cache` setting. Some are cacheable only for
 * some params (an HTTP GET, a SELECT): those still pass here, and the run decides
 * per call with `isCacheableCall`.
 */
export function isCacheableAction(group: string, name: string): boolean {
  return lookup(group, name) !== false;
}

/** Whether this call, with its resolved params, may be served from or stored in the cache. */
export function isCacheableCall(group: string, name: string, params: Record<string, any>): boolean {
  const rule = lookup(group, name);
  if (rule === false) return false;
  return rule === true ? true : rule(params ?? {});
}

// --------------------------------------------------
// TTL
// --------------------------------------------------

const TTL_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

// The longest a result may be kept: past a month, it's a stored value, not a cache.
export const MAX_CACHE_TTL_SECONDS = 30 * 86400;

/** `90`, `'90'`, `'30s'`, `'15m'`, `'1h'`, `'1d'` → seconds; null when it isn't one of those. */
export function parseTtl(ttl: unknown): number | null {
  if (typeof ttl === 'number') return Number.isInteger(ttl) && ttl > 0 ? ttl : null;
  if (typeof ttl !== 'string') return null;
  const match = /^\s*(\d+)\s*([smhd]?)\s*$/.exec(ttl);
  if (!match) return null;
  const seconds = Number(match[1]) * TTL_UNITS[match[2] || 's'];
  return seconds > 0 ? seconds : null;
}

const ttlSchema = z
  .union([z.number(), z.string()])
  .refine((ttl) => parseTtl(ttl) !== null, { message: 'cache.ttl.invalid' })
  .refine((ttl) => (parseTtl(ttl) ?? 0) <= MAX_CACHE_TTL_SECONDS, { message: 'cache.ttl.tooLong' });

/** `cache:` on a step: how long its result is reused, and (optionally) which params form the key. */
export const stepCacheSchema = z
  .object({
    ttl: ttlSchema,
    key: z.array(z.string().min(1)).optional(),
  })
  .strict();

/** `cache:` on a workflow: how long its outputs are reused, and (optionally) which inputs form the key. */
export const workflowCacheSchema = z
  .object({
    ttl: ttlSchema,
    inputs: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type StepCacheConfig = z.infer<typeof stepCacheSchema>;
export type WorkflowCacheConfig = z.infer<typeof workflowCacheSchema>;

/** How a run uses the cache: read and write it (default), skip it, or run and replace the entry. */
export type CacheMode = 'use' | 'bypass' | 'refresh';

// --------------------------------------------------
// Workflows
// --------------------------------------------------

const writesGlobal = (action: any) =>
  String(action?.destination ?? '').startsWith('_global.') ||
  (action?.group === 'variable' &&
    action?.name === 'set' &&
    String(action?.params?.name ?? '').startsWith('_global.'));

/**
 * The steps that stop a workflow from being cached, as `group.name` (nested ones
 * included). A workflow cache skips every step, so every step must be one a step
 * cache could skip too — plus what only changes the run itself: flow control and
 * setting the run's own variables. Writing a global variable is a side effect.
 * Plugin steps never are, unless the plugin says so (`pluginCacheable`).
 */
export function uncacheableSteps(
  actions: any[],
  pluginCacheable: (group: string, name: string) => boolean = () => false
): string[] {
  const found = new Set<string>();
  const walk = (list: any[]) => {
    for (const action of list ?? []) {
      if (!action?.group || !action?.name) continue;
      if (action.disabled) continue;
      const ok =
        !writesGlobal(action) &&
        (action.source === 'plugin'
          ? pluginCacheable(action.group, action.name)
          : isCacheableAction(action.group, action.name) ||
            action.group === 'flow' ||
            (action.group === 'variable' && action.name === 'set'));
      if (!ok) {
        found.add(writesGlobal(action) ? `${action.group}.${action.name} (writes a global variable)` : `${action.group}.${action.name}`);
      }
      if (Array.isArray(action.params?.actions)) walk(action.params.actions);
      if (Array.isArray(action.params?.statements)) {
        for (const statement of action.params.statements) {
          if (Array.isArray(statement?.actions)) walk(statement.actions);
        }
      }
    }
  };
  walk(actions);
  return [...found];
}
