import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pipeline } from '@/database/models/Pipeline';
import { SettingsService, isCredentialSetting } from '@database/services/SettingsService';
import { REDACTED_JSON, isSealed, redactSecretValues, seal } from '@utils/secretBox';

const DONE_KEY = 'secrets_sealed_v1';
const CREDENTIALS_DONE_KEY = 'credentials_sealed_v1';

/** Core used to log its API token on every start. */
function scrubTokenFromLogs() {
  const logs = path.join(os.homedir(), 'Tipeline', 'logs');
  if (!fs.existsSync(logs)) return;
  for (const name of fs.readdirSync(logs)) {
    const file = path.join(logs, name);
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    const scrubbed = text.replace(/(Tipeline Core API token: )\S+/g, '$1[removed]');
    if (scrubbed !== text) fs.writeFileSync(file, scrubbed);
  }
}

/**
 * Each part runs once, for data written before it was encrypted. Secrets: global secrets, the
 * secret values of past runs, and the token in old logs; finished runs lose them, ones that can
 * still resume keep them sealed. Credentials: API keys and tokens in settings, hubs and remotes.
 */
export async function sealExistingSecrets(): Promise<void> {
  const changed = (await sealRunSecrets()) + (await sealCredentials());
  // Overwritten rows stay readable in the file's free pages and write-ahead log until both are rewritten.
  if (changed) {
    await Pipeline.knex().raw('VACUUM');
    await Pipeline.knex().raw('PRAGMA wal_checkpoint(TRUNCATE)');
  }
}

async function sealCredentials(): Promise<number> {
  if (await SettingsService.get(CREDENTIALS_DONE_KEY)) return 0;
  let changed = 0;
  await Pipeline.knex().transaction(async (trx) => {
    const sealColumn = async (table: string, id: string, column: string, rows: any[]) => {
      for (const row of rows) {
        if (!row[column] || isSealed(row[column])) continue;
        await trx(table).where({ [id]: row[id] }).update({ [column]: seal(row[column]) });
        changed++;
      }
    };
    const settings = await trx('settings').select('key', 'value');
    await sealColumn('settings', 'key', 'value', settings.filter((row: any) => isCredentialSetting(row.key)));
    await sealColumn('hub', 'id', 'token', await trx('hub').select('id', 'token'));
    await sealColumn('connections', 'id', 'token', await trx('connections').select('id', 'token'));
  });
  await SettingsService.set(CREDENTIALS_DONE_KEY, '1');
  return changed;
}

async function sealRunSecrets(): Promise<number> {
  if (await SettingsService.get(DONE_KEY)) return 0;
  const knex = Pipeline.knex();
  let changed = 0;

  await knex.transaction(async (trx) => {
    const globals = await trx('global_variable').select('id', 'name', 'value', 'secret');
    const secretGlobals = new Set(globals.filter((g: any) => g.secret).map((g: any) => g.name));
    for (const row of globals) {
      if (row.secret && row.value != null && !isSealed(row.value)) {
        await trx('global_variable').where({ id: row.id }).update({ value: seal(row.value) });
        changed++;
      }
    }

    const pipelines = await trx('pipeline').select('id', 'status', 'source');
    for (const pipeline of pipelines) {
      let source: any = null;
      try {
        source = JSON.parse(pipeline.source ?? 'null');
      } catch {
        source = null;
      }
      const declared: any[] = Array.isArray(source?.pipeline?.variables) ? source.pipeline.variables : [];
      const names = declared
        .filter((v) => v?.secret || (v?.valueFromGlobal && secretGlobals.has(v.valueFromGlobal)))
        .map((v) => v.name);

      const all = await trx('pipeline_variable').where({ pipeline_id: pipeline.id });
      const direct = all.filter((row: any) => names.includes(row.name) || row.scope === 'env');
      // Other variables can hold a secret too, copied into them by a step.
      const texts = [...direct.map((row: any) => row.value), ...declared.filter((v) => v?.secret).map((v) => JSON.stringify(v.value))]
        .filter((text): text is string => typeof text === 'string' && text.startsWith('"') && text.length > 2 && !isSealed(text))
        .map((text) => text.slice(1, -1));
      const rows = all.filter(
        (row: any) => direct.includes(row) || (typeof row.value === 'string' && texts.some((text) => row.value.includes(text)))
      );
      for (const row of rows) {
        if (isSealed(row.value)) continue;
        const value =
          row.block_id != null ? REDACTED_JSON : pipeline.status === 'completed' ? 'null' : seal(row.value ?? 'null');
        await trx('pipeline_variable').where({ id: row.id }).update({ value });
        changed++;
      }

      const redacted = redactSecretValues(source, '[REDACTED]');
      if (redacted.count) {
        await trx('pipeline').where({ id: pipeline.id }).update({ source: JSON.stringify(redacted.source) });
        changed++;
      }
    }
  });

  scrubTokenFromLogs();
  await SettingsService.set(DONE_KEY, '1');
  return changed;
}
