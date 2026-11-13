# Database Schema

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database, IPC messages and CLI keep the original `task` naming, which is what this page uses.
:::

Tipeline uses **SQLite** (via `better-sqlite3`) stored at `~/.tipeline/.database/tipeline.db`. Schema is managed with **Knex** migrations and the ORM layer uses **Objection.js**.

## Tables

### `task`

Stores task (workflow) definitions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `identifier` | string (21) UNIQUE | nanoid identifier |
| `name` | string | Display name |
| `description` | string | Markdown description |
| `author` | string | Author |
| `version` | string | Semver string |
| `platform` | string | `windows` \| `linux` \| `macos`, or null |
| `metadata` | JSON | Extra info (e.g. `draft` for assistant drafts, cache settings) |
| `source` | text | The task source as JSON |
| `created_at` | datetime | |
| `updated_at` | datetime | |

Hub details live in `task_hub_link`, tags in `task_tag`, projects in `project_task`.

### `app`

Stores app definitions: the same columns as `task` except `platform`. `source` holds the app
document (pages, components, runnables).

### `pipeline`

One record per task execution.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `identifier` | string (21) UNIQUE | nanoid |
| `task_id` | integer FK → task | |
| `status` | string | `pending` \| `running` \| `failed` \| `completed` \| `canceled` \| `paused` |
| `metadata` | JSON | Extra info (correlationId, etc.) |
| `source` | JSON | Snapshot of task source at run time |
| `started_at` | datetime | |
| `finished_at` | datetime | |

### `pipeline_block`

One record per execution block (root + one per loop iteration / conditional branch).

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `pipeline_id` | integer FK → pipeline | |
| `parent_block_id` | integer FK → pipeline_block | Self-reference for nesting |
| `parent_action_position` | integer | Position of the flow control action that created this block |
| `iteration` | integer | `null` for one-shot, loop iteration index otherwise |
| `metadata` | JSON | Block-level extra info |

### `pipeline_action`

One record per action execution within a block.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `pipeline_id` | integer FK → pipeline | |
| `block_id` | integer FK → pipeline_block | |
| `position` | integer | Order within the block |
| `identifier` | string (21) | Action's own nanoid (from task definition) |
| `status` | string | `pending` \| `running` \| `completed` \| `failed` \| `canceled` \| `paused` |
| `result` | text (JSON) | Serialized result (non-serializable values are null) |
| `error` | text | Error message if failed |
| `started_at` | datetime | |
| `finished_at` | datetime | |

### `pipeline_variable`

Snapshot of variable values at the end of a pipeline run.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `pipeline_id` | integer FK → pipeline | |
| `name` | string | Variable name |
| `value` | text | JSON-serialized value |
| `type` | string | Variable type |
| `scope` | string | `task` \| `core` \| `env` \| `global` |

### `global_variable`

Persistent variables shared across all tasks.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `identifier` | string (21) UNIQUE | nanoid |
| `name` | string | Variable name used in templates |
| `description` | string | |
| `metadata` | JSON | |
| `type` | string | `string` \| `number` \| `boolean` \| `date` \| `array` \| `object` \| `workbook` \| `oauthToken` \| `audio` \| `video` |
| `value` | text (JSON) | Serialized value |
| `secret` | boolean | Masked in UI |
| `readonly` | boolean | Cannot be overwritten by tasks |
| `created_by` | string | Creator identifier |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### `schedule`

When workflows run on their own. Each row has exactly one of `cron`, `every_seconds` and `run_at`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `identifier` | string (21) UNIQUE | nanoid |
| `task_id` | integer FK → task | |
| `cron` | string, nullable | Cron expression, 5 fields or 6 with seconds first (e.g. `0 9 * * *`, `*/20 * * * * *`) |
| `every_seconds` | integer, nullable | Interval schedule: repeats every this many seconds |
| `run_at` | datetime, nullable | One-time schedule: when it runs |
| `enabled` | boolean | Paused schedules are kept but don't fire. A one-time schedule is turned off when it runs |
| `variables` | JSON | Input values for the scheduled runs |
| `last_run_at` | datetime | When it last started a run |
| `created_at` | datetime | |
| `updated_at` | datetime | Also set when it's turned on or off |

### `connections`

Remote Core engine connections.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `name` | string | Display name |
| `host` | string | WebSocket URL |
| `token` | string | Bearer token |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### `settings`

Key-value application settings.

| Column | Type | Description |
|--------|------|-------------|
| `key` | string PK | Setting name (e.g. `apiToken`, `agent_provider`) |
| `value` | text | Setting value |

### `project`

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `identifier` | string UNIQUE | nanoid |
| `name`, `description`, `color` | string | |
| `created_at`, `updated_at` | datetime | |

A task or app can be in any number of projects: `project_task` (`project_id`, `task_id`)
and `project_app` (`project_id`, `app_id`) hold one row per membership, with `created_at`.
Foreign keys cascade, and deletes also clear these rows by hand
(`ProjectMembership.forget` / `forgetProject`). Being in a project never affects who may
see or run a workflow: on Tipeline Server that's per workflow (owner and visibility).

### `tag` and `task_tag`

`tag` (`id`, `label`, `created_at`) holds each tag once; `task_tag` (`task_id`, `tag_id`)
links tags to tasks.

### `hub`

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `name` | string | Display name |
| `type` | string | `remote` \| `local_folder` |
| `target` | string | Base URL, or folder path |
| `enabled` | boolean | Checked for updates and shown in the Hub browser |
| `last_checked_at` | datetime | |
| `created_at`, `updated_at` | datetime | |

### `task_hub_link`, `app_hub_link`, `plugin_hub_link`

One row per item installed from a hub, kept apart from the item's own table so a plugin
rescan or a source save never overwrites it.

| Column | Type | Description |
|--------|------|-------------|
| `task_id` / `app_id` / `plugin_id` | integer FK | The installed item |
| `hub_id` | integer FK → hub | |
| `hub_task_identifier` / `hub_app_identifier` / `hub_plugin_identifier` | string | The item's id in the hub's catalog |
| `hub_version` | string | The catalog's latest version |
| `hub_status` | string | `ok` \| `missing` (gone from the catalog) \| `error` (last check failed) |
| `auto_update` | boolean | Default true |
| `hub_user`, `last_synced_at`, `created_at`, `updated_at` | | |

### `plugin`

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `identifier` | string UNIQUE | |
| `group` | string | The action group the plugin provides |
| `name`, `description`, `author`, `version`, `image` | string | From the plugin's export |
| `enabled` | boolean | New plugins start disabled |
| `path` | string | Its folder under `~/.tipeline/plugins` |
| `status` | string | e.g. `missing` when its folder is gone |
| `created_at`, `updated_at` | datetime | |

### `agent_run`

One row per assistant request.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | |
| `correlation_id` | string | |
| `prompt` | text | What was asked |
| `answer` | text | The assistant's answer |
| `status` | string | `running` \| `proposed` \| `done` \| `error` |
| `task_identifier`, `task_name` | string | The workflow it used |
| `pipeline_identifier` | string | The run it started |
| `error` | text | |
| `created_at`, `finished_at` | datetime | |

### `cache_entries`

Stored results of cached steps and workflows.

| Column | Type | Description |
|--------|------|-------------|
| `key` | string PK | Hash of what makes two calls "the same" |
| `kind` | string | `action` (a step) \| `workflow` |
| `owner`, `label` | string | The workflow it belongs to, and what to show |
| `value` | text | The stored result |
| `size_bytes`, `ttl_seconds`, `hits` | integer | |
| `source_pipeline` | string | The run that produced it |
| `created_at`, `last_hit_at` | datetime | |

## Migrations

Migration files live in `apps/core/src/database/migrations` and run on Core startup. Knex
records each file by name, so a migration that already ran is never run again — every
schema change needs a new file. List them with `ls apps/core/src/database/migrations`.
