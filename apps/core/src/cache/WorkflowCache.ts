import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';
import { parseTtl, type CacheMode, type WorkflowCacheConfig } from '@tipeline/schemas';
import { workflowCacheKey } from '@/cache/CacheKey';
import { CacheService, type CacheHit } from '@database/services/CacheService';
import { GlobalVariableService } from '@database/services/GlobalVariableService';
import { globalEnvFile } from '@utils/globalEnvFile';

export interface PreparedWorkflowCache {
  key: string;
  ttl: number;
  owner: string;
  label: string;
  mode: CacheMode;
}

/**
 * The workflow cache: a workflow with `cache:` that's called with the same inputs and
 * asked for the same outputs gets the stored outputs back without running — for apps
 * (Core.exec) before a worker thread is even started, and for sync sub-workflows
 * (subtask.exec). The key includes a hash of the workflow's source, so editing the
 * workflow starts fresh, and the values its variables take from global variables and
 * the environment, since those change outside the run.
 */
export class WorkflowCache {
  /** The key and TTL for this call, or null when the cache doesn't apply to it. */
  static async prepare(call: {
    identifier: string;
    name: string;
    source: any;
    inputs: Record<string, unknown>;
    outputs: string[] | undefined;
    mode?: CacheMode;
  }): Promise<PreparedWorkflowCache | null> {
    const config: WorkflowCacheConfig | undefined = call.source?.cache;
    const mode = call.mode ?? 'use';
    const ttl = config ? parseTtl(config.ttl) : null;
    // Nothing to hand back without requested outputs: a run asked for none is a run
    // for its own sake.
    if (!config || !ttl || mode === 'bypass' || !call.outputs?.length) return null;

    const inputs: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(call.inputs ?? {})) {
      if (!config.inputs || config.inputs.includes(name)) inputs[name] = value;
    }

    const outsideValues: Record<string, unknown> = {};
    for (const variable of call.source?.pipeline?.variables ?? []) {
      if (!variable?.name || Object.prototype.hasOwnProperty.call(call.inputs ?? {}, variable.name)) continue;
      if (variable.valueFromGlobal) {
        const record = await GlobalVariableService.getByName(variable.valueFromGlobal);
        outsideValues[variable.name] = record?.value ?? null;
      } else if (variable.valueFromEnv) {
        outsideValues[variable.name] = resolveEnvValue(variable.valueFromEnv, variable.valueFromEnvFile) ?? null;
      }
    }
    // `{{ _env.KEY }}` in a step reads the environment too. The key can't hold a dot, so
    // `_env.KEY` can't clash with a variable name.
    for (const key of envReferences(call.source?.pipeline)) {
      outsideValues[`_env.${key}`] = resolveEnvValue(key) ?? null;
    }

    const key = workflowCacheKey({
      identifier: call.identifier,
      source: call.source,
      inputs,
      outsideValues,
      outputs: call.outputs,
    });
    if (!key) return null;
    return { key, ttl, owner: call.identifier, label: call.name || call.identifier, mode };
  }

  /** Stored outputs for this call, unless it's refreshing them. */
  static async lookup(prepared: PreparedWorkflowCache): Promise<CacheHit | null> {
    if (prepared.mode !== 'use') return null;
    return await CacheService.get(prepared.key, prepared.ttl).catch((error) => {
      console.warn(`[WorkflowCache] read failed for "${prepared.label}":`, error);
      return null;
    });
  }

  static async store(
    prepared: PreparedWorkflowCache,
    outputs: Record<string, unknown>,
    sourcePipeline?: string | null
  ): Promise<void> {
    await CacheService.set({
      key: prepared.key,
      kind: 'workflow',
      owner: prepared.owner,
      label: prepared.label,
      value: outputs,
      ttlSeconds: prepared.ttl,
      sourcePipeline: sourcePipeline || null,
    }).catch((error) => {
      console.warn(`[WorkflowCache] write failed for "${prepared.label}":`, error);
    });
  }
}

/** The `_env.KEY` names a workflow's steps use, with the pattern parseParams resolves. */
function envReferences(pipeline: unknown): string[] {
  if (!pipeline) return [];
  const text = JSON.stringify(pipeline);
  return [...new Set([...text.matchAll(/_env\.(\w+)/g)].map((match) => match[1]))].sort();
}

/**
 * Where an environment value comes from, in the order a run looks: the variable's own
 * env file, the process environment, then ~/.tipeline/.env (which a run loads into its
 * environment before starting — see TaskFactory.loadEnvFiles). The cache runs in Core's
 * main process, which never loads that file, so it's read here.
 */
export function resolveEnvValue(key: string, filePath?: string): string | undefined {
  const readFrom = (file: string) => {
    try {
      if (fs.existsSync(file)) return dotenv.parse(fs.readFileSync(file))[key];
    } catch {
      // Unreadable: fall through to the next source.
    }
    return undefined;
  };
  if (filePath) {
    const resolved = filePath.startsWith('~')
      ? path.join(os.homedir(), filePath.slice(1))
      : path.resolve(filePath);
    const value = readFrom(resolved);
    if (value !== undefined) return value;
  }
  return process.env[key] ?? readFrom(globalEnvFile());
}
