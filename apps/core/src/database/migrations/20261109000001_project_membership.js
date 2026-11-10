/**
 * A workflow or app can be in any number of projects: `project_task` and `project_app`
 * replace the single `project_id` column. A project is a label for organising; who may
 * see or edit a workflow is decided per workflow, never by its projects.
 *
 * Existing assignments carry over one to one. Dropping `project_id` rebuilds `task` and
 * `app`, which would fire ON DELETE CASCADE on their children inside a transaction.
 * Foreign keys are never switched on here, so deleting a workflow, app or project
 * clears its rows in these tables by hand (see ProjectMembership).
 */
export const config = { transaction: false };

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('project_task', (table) => {
    table.integer('project_id').unsigned().notNullable().references('id').inTable('project').onDelete('CASCADE');
    table.integer('task_id').unsigned().notNullable().references('id').inTable('task').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.primary(['project_id', 'task_id']);
    table.index(['task_id']);
  });
  await knex.schema.createTable('project_app', (table) => {
    table.integer('project_id').unsigned().notNullable().references('id').inTable('project').onDelete('CASCADE');
    table.integer('app_id').unsigned().notNullable().references('id').inTable('app').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.primary(['project_id', 'app_id']);
    table.index(['app_id']);
  });

  await knex.raw(
    'INSERT INTO project_task (project_id, task_id) SELECT project_id, id FROM task WHERE project_id IS NOT NULL'
  );
  await knex.raw(
    'INSERT INTO project_app (project_id, app_id) SELECT project_id, id FROM app WHERE project_id IS NOT NULL'
  );

  await knex.schema.alterTable('task', (table) => table.dropColumn('project_id'));
  await knex.schema.alterTable('app', (table) => table.dropColumn('project_id'));
}

/**
 * Going back keeps one project per item (the first it joined).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable('task', (table) =>
    table.integer('project_id').unsigned().nullable().references('id').inTable('project').onDelete('SET NULL')
  );
  await knex.schema.alterTable('app', (table) =>
    table.integer('project_id').unsigned().nullable().references('id').inTable('project').onDelete('SET NULL')
  );
  await knex.raw(
    'UPDATE task SET project_id = (SELECT project_id FROM project_task WHERE task_id = task.id ORDER BY created_at, project_id LIMIT 1)'
  );
  await knex.raw(
    'UPDATE app SET project_id = (SELECT project_id FROM project_app WHERE app_id = app.id ORDER BY created_at, project_id LIMIT 1)'
  );
  await knex.schema.dropTableIfExists('project_task');
  await knex.schema.dropTableIfExists('project_app');
}
