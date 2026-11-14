/**
 * Alerts raised by workflows (alert.raise / alert.resolve). They live in their own table,
 * not in a run's metadata, because one alert continues across runs: the same key from the
 * same workflow updates the open alert (count, message, latest run) until it's resolved.
 *
 * status:
 *  - open: shown in Needs you.
 *  - dismissed: acknowledged by the user. Raising the same key still updates it, quietly,
 *    until alert.resolve closes it (or it isn't raised for 30 days and is pruned).
 *  - resolved: closed by alert.resolve. The next raise opens a new alert.
 *
 * Keyed by the workflow's identifier (not its id) so runs from files and Trash restores
 * keep working; deleting a workflow deletes its alerts by hand (see AlertService).
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('alert', (table) => {
    table.increments('id').primary();
    table.string('identifier').notNullable().unique();
    table.string('task_identifier').notNullable();
    table.string('pipeline_identifier').nullable();
    table.string('key').notNullable();
    table.string('title').notNullable();
    table.text('message').nullable();
    table.string('level').notNullable().defaultTo('warning');
    table.string('status').notNullable().defaultTo('open');
    table.integer('count').notNullable().defaultTo(1);
    table.timestamp('first_raised_at').notNullable();
    table.timestamp('last_raised_at').notNullable();
    table.timestamp('closed_at').nullable();
    table.string('closed_by').nullable();
    table.index(['task_identifier', 'key', 'status']);
    table.index(['status']);
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('alert');
}
