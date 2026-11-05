import { Model } from 'objection';
import { DatabaseManager } from '@/database/DatabaseManager';

export async function initializeDatabase() {
  const knex = DatabaseManager.init();
  Model.knex(knex);
  await DatabaseManager.migrate();
}
