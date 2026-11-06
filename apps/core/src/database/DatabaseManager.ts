import path from 'path';
import fs from 'fs';
import knex, { Knex } from 'knex';
import os from 'os';
import { fileURLToPath } from 'url';
import { CORE_VERSION } from '@utils/coreVersion';
import { DatabaseNewerThanCoreError, unknownNewerMigration } from './newerDatabase';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DatabaseManager {
  private static knexInstance: Knex;
  private static configFilePath = path.join(os.homedir(), '.tipeline', 'database.json');

  public static init(): Knex {
    if (this.knexInstance) return this.knexInstance;

    const baseConfig = this.loadConfig() ?? this.getDefaultConfig();
    const config: Knex.Config = {
      ...this.withWalMode(baseConfig),
      migrations: {
        directory: path.join(__dirname, 'migrations'),
      },
    };

    this.ensureDatabaseFolder(config);
    this.knexInstance = knex(config);
    return this.knexInstance;
  }

  // Enables WAL journal mode and a 5-second busy timeout so concurrent worker threads
  // can safely write to the same SQLite file without SQLITE_BUSY errors.
  private static withWalMode(config: Knex.Config): Knex.Config {
    if (config.client !== 'better-sqlite3') return config;
    return {
      ...config,
      pool: {
        ...(config.pool as object | undefined),
        afterCreate: (connection: any, done: (err: Error | null, conn: any) => void) => {
          // Must come first: on a new database it only applies before anything is written.
          connection.pragma('auto_vacuum = INCREMENTAL');
          connection.pragma('journal_mode = WAL');
          connection.pragma('busy_timeout = 5000');
          done(null, connection);
        },
      },
    };
  }

  /**
   * Turns on incremental auto-vacuum for a database made before it was the default: without
   * this, space freed by deleting stays in the file. Rewriting the file is the only way to
   * switch, so it happens once, and if it fails (no disk space) Core carries on as before.
   */
  static async enableAutoVacuum(): Promise<void> {
    const knexInstance = this.init();
    if (knexInstance.client.config.client !== 'better-sqlite3') return;
    const [row] = await knexInstance.raw('PRAGMA auto_vacuum');
    if (row?.auto_vacuum === 2) return;
    try {
      await knexInstance.raw('VACUUM');
      await knexInstance.raw('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (error: any) {
      console.warn(`[Database] Could not turn on auto-vacuum: ${error?.message ?? error}`);
    }
  }

  /** Gives the file's free space back to the disk. Short, and safe while runs are writing. */
  static async reclaimFreeSpace(knexInstance: Knex = this.init()): Promise<void> {
    if (knexInstance.client.config.client !== 'better-sqlite3') return;
    const connection = await knexInstance.client.acquireConnection();
    try {
      // On the connection itself: through knex.raw this statement stops after freeing a few pages.
      connection.exec('PRAGMA incremental_vacuum');
      connection.pragma('wal_checkpoint(PASSIVE)');
    } finally {
      await knexInstance.client.releaseConnection(connection);
    }
  }

  private static loadConfig(): Knex.Config | null {
    if (fs.existsSync(this.configFilePath)) {
      try {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        return JSON.parse(raw) as Knex.Config;
      } catch (e) {
        console.error('DatabaseManager::InvalidConfig', e);
      }
    }
    return null;
  }

  public static getDefaultConfig(): Knex.Config {
    return {
      client: 'better-sqlite3',
      connection: {
        filename: path.join(os.homedir(), '.tipeline', '.database', 'tipeline.db'),
      },
      migrations: {
        directory: path.join(__dirname, 'migrations'),
      },
      useNullAsDefault: true,
    };
  }

  private static ensureDatabaseFolder(config: Knex.Config): void {
    if (config.client !== 'better-sqlite3') return;
    const connection = config.connection as { filename?: string };
    if (connection?.filename) {
      const folder = path.dirname(connection.filename);
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
    }
  }

  public static async migrate(): Promise<void> {
    if (!this.knexInstance) {
      this.init();
    }

    await this.refuseNewerDatabase();

    try {
      await this.knexInstance.migrate.latest();
    } catch (error) {
      console.error('DatabaseManager::MigrationError', error);
      throw error;
    }
  }

  // Knex would only call the migration directory corrupt; this tells the user what to do.
  private static async refuseNewerDatabase(): Promise<void> {
    if (!(await this.knexInstance.schema.hasTable('knex_migrations'))) return;
    const applied: string[] = await this.knexInstance('knex_migrations').pluck('name');
    const local = fs.readdirSync(path.join(__dirname, 'migrations')).filter((file) => file.endsWith('.js'));
    const migration = unknownNewerMigration(applied, local);
    if (migration) throw new DatabaseNewerThanCoreError(migration, CORE_VERSION);
  }

  public static getKnex(): Knex {
    if (!this.knexInstance) {
      this.init();
    }
    return this.knexInstance;
  }
}
