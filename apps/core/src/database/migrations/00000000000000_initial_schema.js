/**
 * The whole schema: a new database is created from this.
 *
 * Rebuilding a table on SQLite (dropColumn, alter) fires ON DELETE CASCADE on its
 * children unless the migration runs with `transaction: false`: `task` is the parent of
 * `pipeline`, `schedule`, `task_revision`, `task_tag` and `task_hub_link`. A later
 * migration that changes `task` (or `app`, `plugin`, `pipeline`) must export
 * `config = { transaction: false }`.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema
    .createTable('project', (table) => {
      table.increments('id').primary();
      table.string('identifier', 21).notNullable().unique();
      table.text('name').notNullable();
      table.text('description');
      table.string('color', 20);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      // For the assistant: added to its system prompt for requests made in the project.
      table.text('instructions').nullable();
    })
    .createTable('hub', (table) => {
      table.string('id').primary();
      table.text('name').notNullable();
      table.text('type').notNullable(); // 'remote' | 'local_folder'
      table.text('target').notNullable(); // base URL or absolute folder path
      table.boolean('enabled').notNullable().defaultTo(true);
      table.timestamp('last_checked_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      // Optional access token for a remote hub (a private GitHub repo, a Drupal site behind
      // auth). Sent as a Bearer token, only to the hub's own host: see RemoteHubProvider.
      table.text('token').nullable();
    })
    .createTable('app', (table) => {
      table.increments('id').primary();
      table.string('identifier', 21).notNullable().unique();
      table.text('name').notNullable();
      table.text('description');
      table.text('author');
      table.string('version').notNullable().defaultTo('1.0.0');
      table.json('metadata');
      table.text('source');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table
        .integer('project_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('project')
        .onDelete('SET NULL');
    })
    .createTable('task', (table) => {
      table.increments('id').primary();
      table.string('identifier', 21).notNullable().unique();
      table.text('name').notNullable();
      table.text('description');
      table.text('author');
      table.string('version').notNullable().defaultTo('1.0.0');
      table.json('metadata');
      table.text('source');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table
        .integer('project_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('project')
        .onDelete('SET NULL');
      table.text('platform');
    })
    .createTable('plugin', (table) => {
      table.increments('id').primary();
      table.string('identifier', 21).notNullable().unique();
      table.string('group').notNullable().unique();
      table.string('name').notNullable();
      table.string('description');
      table.string('author');
      table.string('version');
      // A newly found plugin is listed but stays off until someone enables it.
      table.boolean('enabled').notNullable().defaultTo(false);
      table.string('path').notNullable();
      table.string('status').notNullable().defaultTo('ok');
      table.timestamps(true, true);
      // definition.image: a remote URL or an absolute path inside the plugin's folder.
      table.text('image').nullable();
    });

  // Hub provenance lives in 1:1 side tables rather than on task/app/plugin: "installed
  // from a hub" is "has a link row". Deleting a hub removes its link rows, which detaches
  // everything that came from it; the task/app/plugin itself stays.
  await createHubLinkTable(knex, 'task_hub_link', 'task', 'task_id', 'hub_task_identifier');
  await createHubLinkTable(knex, 'app_hub_link', 'app', 'app_id', 'hub_app_identifier');
  await createHubLinkTable(knex, 'plugin_hub_link', 'plugin', 'plugin_id', 'hub_plugin_identifier');

  await knex.schema
    .createTable('tag', (table) => {
      table.increments('id').primary();
      // Case-sensitive here; TagService keeps "Urgent" and "urgent" as one tag.
      table.string('label').notNullable().unique();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('task_tag', (table) => {
      table
        .integer('task_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('task')
        .onDelete('CASCADE');
      table
        .integer('tag_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('tag')
        .onDelete('CASCADE');
      table.primary(['task_id', 'tag_id']);
    })
    .createTable('task_revision', (table) => {
      table.increments('id').primary();
      table.integer('task_id').notNullable().references('id').inTable('task').onDelete('CASCADE');
      table.text('source').notNullable();
      // What saved it: 'edit' | 'created' | 'hub' | 'reload' | 'backup' | 'restore' |
      // 'earlier' (what a workflow held before its first recorded save).
      table.string('origin', 16).notNullable();
      // JSON: what changed from the version before it (see TaskRevisionService.summarize).
      table.text('summary').nullable();
      // For 'restore': the revision it put back.
      table.integer('restored_from').nullable();
      table.datetime('created_at').notNullable();
      table.index(['task_id', 'created_at'], 'task_revision_task_created_idx');
    })
    .createTable('schedule', (table) => {
      table.increments('id').primary();
      table.string('identifier', 21).notNullable().unique();
      table
        .integer('task_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('task')
        .onDelete('CASCADE');
      // A schedule has one of cron, run_at (runs once, then turns itself off) or
      // every_seconds (an interval a cron can't keep even).
      table.string('cron').nullable();
      table.boolean('enabled').notNullable().defaultTo(true);
      table.timestamp('last_run_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.text('variables').defaultTo('{}');
      table.datetime('run_at').nullable();
      table.integer('every_seconds').nullable();
      table.index(['task_id'], 'schedule_task_id_idx');
    })
    .createTable('pipeline', (table) => {
      table.increments('id').primary();
      table.string('identifier', 21).notNullable().unique();
      table
        .integer('task_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('task')
        .onDelete('CASCADE');
      table.string('status').notNullable();
      table.json('metadata');
      table.json('source').notNullable();
      table.timestamp('started_at').defaultTo(knex.fn.now());
      table.timestamp('finished_at');
      table.index(['task_id', 'started_at'], 'pipeline_task_id_started_at_idx');
      table.index(['started_at'], 'pipeline_started_at_idx');
    })
    .createTable('pipeline_block', (table) => {
      table.increments('id').primary();
      table
        .integer('pipeline_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('pipeline')
        .onDelete('CASCADE');
      table
        .integer('parent_block_id')
        .unsigned()
        .references('id')
        .inTable('pipeline_block')
        .onDelete('CASCADE');
      table.integer('parent_action_position').unsigned();
      table.integer('iteration').unsigned().nullable();
      table.json('metadata');
    })
    .createTable('pipeline_variable', (table) => {
      table.increments('id').primary();
      table
        .integer('pipeline_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('pipeline')
        .onDelete('CASCADE');
      table.string('name').notNullable();
      table.text('value');
      table.string('type');
      table.enum('scope', ['task', 'core', 'env', 'global']).notNullable();
      // Null: the variable's current value. Set: its value in one loop iteration.
      table
        .integer('block_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('pipeline_block')
        .onDelete('CASCADE');
      table.unique(['block_id', 'name'], {
        indexName: 'pipeline_variable_block_id_name_unique',
      });
      table.index(['pipeline_id', 'name'], 'pipeline_variable_pipeline_id_name_idx');
    })
    .createTable('pipeline_action', (table) => {
      table.increments('id').primary();
      table
        .integer('pipeline_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('pipeline')
        .onDelete('CASCADE');
      table
        .integer('block_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('pipeline_block')
        .onDelete('CASCADE');
      table.integer('position').unsigned().notNullable();
      table.string('identifier').notNullable();
      table.string('status').notNullable();
      table.json('result');
      table.text('error');
      table.timestamp('started_at');
      table.timestamp('finished_at');
      table.json('params');
      // Served from the cache instead of run.
      table.boolean('cached').notNullable().defaultTo(false);
      table.unique(['block_id', 'identifier'], {
        indexName: 'pipeline_action_block_id_identifier_unique',
      });
      table.index(['pipeline_id'], 'pipeline_action_pipeline_id_idx');
      table.index(['block_id'], 'pipeline_action_block_id_idx');
    })
    .createTable('global_variable', (table) => {
      table.increments('id').primary();
      table.string('identifier', 21).notNullable().unique();
      table.string('name').notNullable().unique();
      table.text('description');
      table.string('type').notNullable();
      table.text('value');
      table.json('metadata');
      table.boolean('secret').defaultTo(false);
      table.boolean('readonly').notNullable().defaultTo(false);
      table.string('created_by');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('agent_run', (table) => {
      table.increments('id').primary();
      table.string('correlation_id', 21).notNullable().unique();
      table.text('prompt').notNullable();
      table.text('answer').nullable();
      table.string('status').notNullable().defaultTo('running');
      table.string('task_identifier').nullable();
      table.text('task_name').nullable();
      table.string('pipeline_identifier').nullable();
      table.text('error').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('finished_at').nullable();
      table.index(['created_at'], 'agent_run_created_at_idx');
    })
    // Result caching: the stored result of a cached step or the outputs of a cached
    // workflow, keyed by a hash of what they ran with. Expiry is worked out on read
    // (`created_at` + the step's current TTL); `ttl_seconds` is the TTL it was stored
    // with, kept for display.
    .createTable('cache_entries', (table) => {
      table.string('key', 64).primary();
      table.string('kind', 16).notNullable(); // 'action' | 'workflow'
      // The workflow it belongs to (a step's workflow, or the cached workflow), so one
      // workflow's entries can be listed and cleared. Null for steps of a workflow file
      // run straight from disk.
      table.string('owner').nullable();
      // What it is, for the Settings list: 'http.request', or the workflow's name.
      table.string('label').notNullable();
      table.text('value').notNullable(); // JSON
      table.integer('size_bytes').notNullable();
      table.integer('ttl_seconds').notNullable();
      table.integer('hits').notNullable().defaultTo(0);
      // The run that produced it, when that run was saved.
      table.string('source_pipeline').nullable();
      table.datetime('created_at').notNullable();
      table.datetime('last_hit_at').nullable();
      table.index(['owner'], 'cache_entries_owner_idx');
      table.index(['created_at'], 'cache_entries_created_at_idx');
    })
    // Trash: a deleted workflow or app, kept for a while so it can be restored. `data`
    // is a snapshot of the row and what goes with it (tags, project, hub link, versions,
    // schedules). Runs are not kept.
    .createTable('trash_item', (table) => {
      table.increments('id').primary();
      table.string('kind', 8).notNullable(); // 'task' | 'app'
      table.string('identifier').notNullable();
      table.text('name').notNullable();
      table.text('data').notNullable(); // JSON, see TrashService
      table.datetime('deleted_at').notNullable();
      table.index(['deleted_at'], 'trash_item_deleted_at_idx');
    })
    // What hub updates did, and which ones need the user: the Updates tab on the Hub page.
    // `updated` rows are history; the other kinds exist only while they're still true.
    .createTable('hub_update_event', (table) => {
      table.increments('id').primary();
      table.string('item_type').notNullable(); // 'task' | 'app' | 'plugin'
      table.string('item_identifier').notNullable();
      table.string('item_name').nullable();
      table.string('hub_name').nullable();
      // 'updated' | 'major_waiting' | 'update_available' | 'older_listed' | 'blocked' | 'not_bumped' | 'failed'
      table.string('kind').notNullable();
      table.string('from_version').nullable();
      table.string('to_version').nullable();
      table.text('message').nullable();
      table.timestamp('read_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['item_type', 'item_identifier']);
    })
    .createTable('settings', (table) => {
      table.string('key').primary();
      table.text('value').notNullable();
    })
    .createTable('connections', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('host').notNullable();
      table.string('token').notNullable();
      table.timestamps(true, true);
    });
}

async function createHubLinkTable(knex, name, parentTable, parentFk, hubIdentifierColumn) {
  await knex.schema.createTable(name, (table) => {
    table.increments('id').primary();
    table
      .integer(parentFk)
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable(parentTable)
      .onDelete('CASCADE');
    table.string('hub_id').notNullable().references('id').inTable('hub').onDelete('CASCADE');
    table.string(hubIdentifierColumn).notNullable();
    table.string('hub_user').nullable();
    table.string('hub_version').nullable();
    // 'ok' | 'missing' (no longer in the hub's catalog) | 'error' (last fetch failed).
    table.text('hub_status').nullable();
    table.boolean('auto_update').notNullable().defaultTo(true);
    table.timestamp('last_synced_at').nullable();
    table.timestamps(true, true);
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  for (const table of [
    'connections',
    'settings',
    'hub_update_event',
    'trash_item',
    'cache_entries',
    'agent_run',
    'global_variable',
    'pipeline_action',
    'pipeline_variable',
    'pipeline_block',
    'pipeline',
    'schedule',
    'task_revision',
    'task_tag',
    'tag',
    'plugin_hub_link',
    'app_hub_link',
    'task_hub_link',
    'plugin',
    'task',
    'app',
    'hub',
    'project',
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
}
