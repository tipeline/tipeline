<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Database Actions

## General

### `connect`

Opens a database connection using the provided Knex configuration object.

**Returns:** A Knex connection instance to use in subsequent query and close actions.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `configuration` | object | ✓ | — | Database configuration object or reference string (host, port, credentials, database name, etc.). |

```yaml
# Open a SQLite connection — store the result for reuse across query and close actions
- group: database
  name: connect
  params:
    configuration:
      client: better-sqlite3
      connection:
        filename: /data/tipeline.db
      useNullAsDefault: true
  destination: connection
```

## Connection

### `query`

Executes a raw SQL statement against an open database connection.

Use `?` placeholders in `sql` for any value coming from a variable, and pass the
actual values through `bindings` — the driver binds them as parameters rather than
this action substituting them into the SQL text, which is what keeps a value like a
webhook-supplied id from being interpreted as SQL syntax.

**Returns:** The query result rows, or an empty array if no rows are returned.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `connection` | any | ✓ | — | The active database connection object. |
| `sql` | string | ✓ | — | SQL statement to execute (SELECT, INSERT, UPDATE, DELETE, etc.). Use `?` placeholders for any value that comes from a variable, and pass that value through `bindings` instead of substituting it into this string directly — that keeps it safely parameterized instead of interpolated as raw SQL text. |
| `bindings` | any[] |  | — | Values to bind to the `?` placeholders in `sql`, in order. Prefer this over embedding {{ }}/{= =} template values directly into `sql`. |

```yaml
# Run a parameterized SELECT — the status value is bound, not interpolated
- group: database
  name: query
  params:
    connection: '{= connection =}'
    sql: SELECT * FROM pipeline_runs WHERE status = ?
    bindings: ['{{ status }}']
  destination: rows
```

### `close`

Closes an open database connection and releases all associated resources.

**Returns:** A promise that resolves once the connection is fully destroyed.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `connection` | any | ✓ | — | The active database connection to close. |

```yaml
# Close the connection after all queries are done — always pair with a connect action
- group: database
  name: close
  params:
    connection: '{= connection =}'
```
