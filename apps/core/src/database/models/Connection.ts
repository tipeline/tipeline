import { Model, type Pojo } from 'objection';
import { openCredential, sealCredential } from '@utils/secretBox';

export class Connection extends Model {
  id!: string;
  name!: string;
  host!: string;
  token!: string;

  static get tableName() {
    return 'connections';
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
