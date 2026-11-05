import { Model, type Pojo } from 'objection';
import { openCredential, sealCredential } from '@utils/secretBox';

export class Hub extends Model {
  id!: string;
  name!: string;
  type!: 'remote' | 'local_folder';
  target!: string;
  /** Remote hubs only: sent as a Bearer token to the hub's own host. Never leaves Core (see Core.hubView). */
  token?: string | null;
  enabled!: boolean;
  last_checked_at?: Date;
  created_at!: Date;
  updated_at!: Date;

  static get tableName() {
    return 'hub';
  }

  static get idColumn() {
    return 'id';
  }

  // Encrypted in the table, plain everywhere else.
  $parseDatabaseJson(json: Pojo): Pojo {
    const parsed = super.$parseDatabaseJson(json);
    if ('token' in parsed) parsed.token = openCredential(parsed.token as string | null);
    return parsed;
  }

  $formatDatabaseJson(json: Pojo): Pojo {
    const formatted = super.$formatDatabaseJson(json);
    if ('token' in formatted) formatted.token = sealCredential(formatted.token as string | null);
    return formatted;
  }
}
