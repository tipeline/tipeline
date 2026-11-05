import { parseParams } from '@utils/parseParams';
import { GroupScript } from './actions';

export const SCRIPT_PREVIEW_TIMEOUT_MS = 5000;
const MAX_LOGS = 200;

export interface ScriptPreviewParams {
  code: string;
  // Raw step `context` — still holding its `{{ }}` / `{= =}` expressions.
  context?: Record<string, unknown>;
  // Workflow variable values to resolve those expressions against (the editor
  // sends the last run's values, or sample values for variables never run).
  variables?: Record<string, unknown>;
}

export interface ScriptPreviewGlobal {
  name: string;
  value: unknown;
  secret?: boolean;
}

export interface ScriptPreviewResult {
  ok: boolean;
  // `undefined` doesn't survive IPC, so "nothing returned" is its own flag.
  hasResult: boolean;
  result?: unknown;
  error?: string;
  logs: string[];
  // The context after expressions were resolved — what the script actually saw.
  context: Record<string, unknown>;
  durationMs: number;
}

/**
 * Runs a `script.runScript` step for the editor's preview, in the same sandbox
 * as a real run. Never throws: a failing script still returns the logs it
 * wrote before failing.
 *
 * Unlike a real run, values from secret globals and `_env` are blanked out of
 * everything sent back, since the preview's output goes straight to the UI.
 */
export async function runScriptPreview(
  params: ScriptPreviewParams,
  globals: ScriptPreviewGlobal[] = []
): Promise<ScriptPreviewResult> {
  const started = Date.now();
  const logs: string[] = [];
  const context = structuredClone(params.context ?? {}) as Record<string, unknown>;

  const variables = Object.entries(params.variables ?? {}).map(([name, value]) => ({
    getName: () => name,
    getValue: () => value,
  }));
  const globalsByName = new Map(globals.map((g) => [g.name, g.value ?? '']));
  const secrets = secretValues(params.context, globals);
  const redact = <T>(value: T): T => redactDeep(value, secrets);
  const finish = (rest: Partial<ScriptPreviewResult>): ScriptPreviewResult =>
    redact({
      ok: false,
      hasResult: false,
      logs,
      context,
      durationMs: Date.now() - started,
      ...rest,
    });

  try {
    parseParams(context, variables, (name) => globalsByName.get(name) ?? '');
  } catch (error: any) {
    return finish({ error: `Context: ${error?.message ?? error}` });
  }

  try {
    const run = GroupScript.execute(params.code, context, {
      timeout: SCRIPT_PREVIEW_TIMEOUT_MS,
      onLog: (args) => {
        if (logs.length < MAX_LOGS) logs.push(args.map(formatLogArg).join(' '));
      },
    });
    // vm2's timeout only stops synchronous code; an await that never settles
    // would otherwise keep the preview waiting forever.
    const result = await withTimeout(run, SCRIPT_PREVIEW_TIMEOUT_MS);
    return finish({ ok: true, hasResult: result !== undefined, result });
  } catch (error: any) {
    return finish({ error: String(error?.message ?? error) });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Preview stopped after ${ms / 1000} s — the script didn't finish.`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg === undefined) return 'undefined';
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// Secret globals plus any `_env` value the context references. Very short
// values are skipped: blanking every "1" or "on" would mangle the output.
function secretValues(context: unknown, globals: ScriptPreviewGlobal[]): string[] {
  const values = globals.filter((g) => g.secret).map((g) => g.value);
  const source = JSON.stringify(context ?? {});
  for (const [, key] of source.matchAll(/_env\.(\w+)/g)) values.push(process.env[key]);
  return values.filter((v): v is string => typeof v === 'string' && v.length >= 4);
}

function redactDeep<T>(value: T, secrets: string[]): T {
  if (secrets.length === 0) return value;
  const walk = (v: any): any => {
    if (typeof v === 'string') return secrets.reduce((acc, s) => acc.split(s).join('[REDACTED]'), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}
