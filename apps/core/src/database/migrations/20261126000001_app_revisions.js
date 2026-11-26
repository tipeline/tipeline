/**
 * Saved versions of an app's source, like `task_revision` for workflows (see
 * AppRevisionService). Only adds a table; nothing existing changes.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('app_revision', (table) => {
    table.increments('id').primary();
    table.integer('app_id').notNullable().references('id').inTable('app').onDelete('CASCADE');
    table.text('source').notNullable();
    // What saved it: 'edit' | 'created' | 'hub' | 'backup' | 'restore' |
    // 'earlier' (what an app held before its first recorded save).
    table.string('origin', 16).notNullable();
    // JSON: what changed from the version before it (see AppRevisionService.summarize).
    table.text('summary').nullable();
    // For 'restore': the revision it put back.
    table.integer('restored_from').nullable();
    table.datetime('created_at').notNullable();
    table.index(['app_id', 'created_at'], 'app_revision_app_created_idx');
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('app_revision');
}
