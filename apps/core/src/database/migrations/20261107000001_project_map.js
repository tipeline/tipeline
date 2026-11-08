/**
 * The project map's plan: planned nodes, lines drawn by hand, node notes and positions,
 * as one JSON document per project. The live part of the map is read from the
 * definitions every time and never stored.
 *
 * A table of its own (rather than a column on `project`) so going back is a plain drop.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('project_map', (table) => {
    table.increments('id').primary();
    table
      .integer('project_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('project')
      .onDelete('CASCADE');
    table.text('data').notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('project_map');
}
