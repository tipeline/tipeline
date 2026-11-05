import knex, { Knex } from 'knex';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DatabaseManager {
  private static instance: Knex;

  static init(): Knex {
    if (this.instance) return this.instance;
    this.instance = knex(this.buildConfig());
    return this.instance;
  }

  static getKnex(): Knex {
    if (!this.instance) this.init();
    return this.instance;
  }

  static async migrate(): Promise<void> {
    await this.getKnex().migrate.latest();
  }

  private static buildConfig(): Knex.Config {
    const client = process.env.TIPELINE_DB_CLIENT ?? 'pg';

    return {
      client,
      connection: {
        host: process.env.TIPELINE_DB_HOST ?? '127.0.0.1',
        port: parseInt(process.env.TIPELINE_DB_PORT ?? '5432', 10),
        database: process.env.TIPELINE_DB_NAME ?? 'tipeline_server',
        user: process.env.TIPELINE_DB_USER ?? 'tipeline',
        password: process.env.TIPELINE_DB_PASSWORD ?? '',
        ssl: process.env.TIPELINE_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      },
      migrations: { directory: path.join(__dirname, 'migrations') },
    };
  }
}
