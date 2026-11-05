/**
 * The whole schema: a new database is created from this.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema
    .createTable('users', (table) => {
      table.string('id').primary();
      table.string('email').unique().notNullable();
      table.string('name').notNullable();
      table.string('role').notNullable().defaultTo('user');
      table.integer('is_active').notNullable().defaultTo(1);
      table.string('created_at').notNullable();
      table.string('mfa_secret');
      table.integer('mfa_enabled').notNullable().defaultTo(0);
      table.text('mfa_backup_codes');
    })
    .createTable('user_auth_providers', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('provider_type').notNullable();
      table.text('credentials_hash');
      table.string('created_at').notNullable();
    })
    .createTable('tokens', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('token_hash').notNullable();
      table.string('created_at').notNullable();
      table.string('last_used_at');
      table.string('expires_at');
      table.string('revoked_at');
      table.string('scope');
      // 'api' (made by hand) | 'session' (made by logging in).
      table.string('kind').notNullable().defaultTo('api');
      table.index(['token_hash'], 'idx_tokens_hash');
      table.index(['user_id'], 'idx_tokens_user');
    })
    .createTable('webhooks', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('task_identifier').notNullable();
      table.string('token_hash').unique().notNullable();
      table.string('method').notNullable().defaultTo('POST');
      table.integer('enabled').notNullable().defaultTo(1);
      table.text('variables_mapping');
      table.string('created_by').notNullable().references('id').inTable('users');
      table.string('created_at').notNullable();
      table.string('last_triggered_at');
      table.index(['token_hash'], 'idx_webhooks_token_hash');
    })
    .createTable('task_ownership', (table) => {
      table.string('task_identifier').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('visibility').notNullable().defaultTo('shared');
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();
      table.index(['user_id'], 'idx_task_ownership_user');
    })
    .createTable('pipeline_audit', (table) => {
      table.string('id').primary();
      table.string('correlation_id').notNullable();
      table.string('pipeline_id');
      table.string('task_identifier').notNullable();
      table.string('triggered_by_type').notNullable();
      table.string('triggered_by_ref');
      table.string('triggered_by_name');
      table.string('triggered_at').notNullable();
      table.string('completed_at');
      table.string('status').notNullable().defaultTo('running');
      // The person who started a run, whatever started it for them (directly, or through an
      // app, whose `triggered_by_ref` is the app). Used to keep a requester from approving
      // their own run when the approval asks for that.
      table.string('requested_by_user_id');
      table.string('requested_by_email');
      table.index(['correlation_id'], 'idx_pipeline_audit_correlation');
      table.index(['task_identifier'], 'idx_pipeline_audit_task');
      table.index(['pipeline_id'], 'idx_pipeline_audit_pipeline');
    })
    .createTable('mfa_challenges', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('created_at').notNullable();
      table.string('expires_at').notNullable();
    })
    .createTable('audit_log', (table) => {
      table.string('id').primary();
      table.string('actor_id');
      table.string('actor_email');
      table.string('action').notNullable();
      table.string('target_type');
      table.string('target_id');
      table.text('metadata');
      table.string('ip');
      table.string('created_at').notNullable();
      table.index(['created_at'], 'idx_audit_log_created_at');
      table.index(['action'], 'idx_audit_log_action');
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema
    .dropTableIfExists('audit_log')
    .dropTableIfExists('mfa_challenges')
    .dropTableIfExists('pipeline_audit')
    .dropTableIfExists('task_ownership')
    .dropTableIfExists('webhooks')
    .dropTableIfExists('tokens')
    .dropTableIfExists('user_auth_providers')
    .dropTableIfExists('users');
}
