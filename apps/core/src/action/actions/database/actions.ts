/**
 * Knex internally uses require('better-sqlite3') based on the string "better-sqlite3". As long
 * as you have the package installed via npm install better-sqlite3, it works. The same is true
 * for 'pg', 'mysql', 'tedious', etc.
 *
 * Nexe freezes your app at build time into a single binary. It does not support
 * dynamic require() of modules that aren't known at compile time, nor runtime npm install.
 */

import knex from 'knex';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type ConnectParams = z.infer<typeof validations.database.connect.runtime.schema>;
type QueryParams = z.infer<typeof validations.database.query.runtime.schema>;
type CloseParams = z.infer<typeof validations.database.close.runtime.schema>;

/**
 * @group Actions
 */
export class GroupDatabase {
  // --------------------------------------------------
  // Connection
  // --------------------------------------------------

  /**
   * Opens a database connection using the provided Knex configuration object.
   *
   * @param params - The input parameters.
   * @returns A Knex connection instance to use in subsequent query and close actions.
   * @example
   * ```yaml
   * # Open a SQLite connection — store the result for reuse across query and close actions
   * - group: database
   *   name: connect
   *   params:
   *     configuration:
   *       client: better-sqlite3
   *       connection:
   *         filename: /data/tipeline.db
   *       useNullAsDefault: true
   *   destination: connection
   * ```
   */
  static async connect(params: ConnectParams): Promise<object> {
    const parsed = validations.database.connect.runtime.validate(params);
    return knex(parsed.configuration);
  }

  /**
   * Executes a raw SQL statement against an open database connection.
   *
   * Use `?` placeholders in `sql` for any value coming from a variable, and pass the
   * actual values through `bindings` — the driver binds them as parameters rather than
   * this action substituting them into the SQL text, which is what keeps a value like a
   * webhook-supplied id from being interpreted as SQL syntax.
   *
   * @param params - The input parameters.
   * @returns The query result rows, or an empty array if no rows are returned.
   * @example
   * ```yaml
   * # Run a parameterized SELECT — the status value is bound, not interpolated
   * - group: database
   *   name: query
   *   params:
   *     connection: '{= connection =}'
   *     sql: SELECT * FROM pipeline_runs WHERE status = ?
   *     bindings: ['{{ status }}']
   *   destination: rows
   * ```
   */
  static async query(params: QueryParams): Promise<any> {
    const parsed = validations.database.query.runtime.validate(params);
    const { connection, sql, bindings } = parsed;
    const result = await connection.raw(sql, bindings ?? []);
    if (!result) return [];
    // Normalize across client adapters: pg returns { rows }, mysql2 returns a
    // [rows, fields] tuple where rows is itself an array, and better-sqlite3
    // returns the rows array directly. Spread into plain objects so the
    // result is always a serializable array regardless of the underlying driver.
    let rows;
    if (Array.isArray(result) && Array.isArray(result[0])) {
      rows = result[0];
    } else if (Array.isArray(result)) {
      rows = result;
    } else {
      rows = result.rows ?? result;
    }
    return Array.isArray(rows) ? rows.map((row: any) => ({ ...row })) : rows;
  }

  /**
   * Closes an open database connection and releases all associated resources.
   *
   * @param params - The input parameters.
   * @returns A promise that resolves once the connection is fully destroyed.
   * @example
   * ```yaml
   * # Close the connection after all queries are done — always pair with a connect action
   * - group: database
   *   name: close
   *   params:
   *     connection: '{= connection =}'
   * ```
   */
  static async close(params: CloseParams): Promise<void> {
    const parsed = validations.database.close.runtime.validate(params);
    await parsed.connection.destroy();
  }
}
