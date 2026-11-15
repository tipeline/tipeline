/**
 * The assistant's requests, one row per request with who asked, and each user's remembered
 * "which workflow did you mean" picks. Core's agent_run table has no user, so the Server keeps
 * its own.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema
    .createTable('assistant_requests', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.text('prompt').notNullable();
      // thinking | answered | proposed | running | completed | failed
      table.string('status').notNullable();
      table.string('task_identifier');
      table.string('task_name');
      table.string('pipeline_identifier');
      table.text('answer');
      table.text('error');
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();
      table.index(['user_id', 'created_at'], 'idx_assistant_requests_user');
      table.index(['created_at'], 'idx_assistant_requests_created');
    })
    .createTable('assistant_choices', (table) => {
      table.string('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
      table.text('choices').notNullable();
      table.string('updated_at').notNullable();
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('assistant_choices').dropTableIfExists('assistant_requests');
}
