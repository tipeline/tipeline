import { DatabaseManager } from './DatabaseManager.js';

export async function runMigrations(): Promise<void> {
  await DatabaseManager.migrate();
}
