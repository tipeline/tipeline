/**
 * Phones that receive push notifications: one row per device token, owned by the user who
 * signed in on it, with that device's own choices. Only used when the Server has push set
 * up (TIPELINE_PUSH_*).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('push_devices', (table) => {
    table.string('id').primary();
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    // ios (APNs) | android (FCM)
    table.string('platform').notNullable();
    table.text('token').notNullable().unique();
    table.string('locale');
    // JSON: { approvals, failures, finished, details }
    table.text('preferences').notNullable();
    table.string('created_at').notNullable();
    table.string('last_seen_at').notNullable();
    table.index(['user_id'], 'idx_push_devices_user');
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('push_devices');
}
