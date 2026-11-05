<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# System Actions

## General

### `message`

Emits a system message as the action result.

**Returns:** The text string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `text` | string | ✓ | — | Message text to emit. |

```yaml
# Log the current pipeline status for debugging
- group: system
  name: message
  params:
    text: 'Pipeline status: {{ status }}'
```

## Process

### `runApplication`

Spawns a system command or application and returns its stdout output.

Pass `args` to run the command with explicit arguments (shell disabled by default).
Omit `args` and the command string is tokenized into a program + arguments and run
WITHOUT a shell by default — no `;`, `&&`, `|`, backticks, or `$()` are interpreted,
which matters when any part of `command` comes from a template-substituted variable.
Set `options.shell: true` only when you deliberately need real shell features (pipes,
redirects, chaining) and trust everything that can end up in `command`.

**Returns:** The trimmed stdout of the command.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `command` | string | ✓ | — | The executable or command to run. |
| `args` | string[] |  | — | List of command-line arguments to pass. |
| `env` | Record&lt;string, any&gt; \| `` |  | — | Environment variables to set for the process. |
| `options` | object |  | — | Execution options (e.g. shell: true to run in a shell). |

```yaml
# Open VLC and capture any output
- group: system
  name: runApplication
  params:
    command: open -a VLC
```

### `terminateProcess`

Sends a signal to a running process to terminate it.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `pid` | number \| string | ✓ | — | Process ID (PID) of the process to terminate. |
| `signal` | `SIGTERM` \| `SIGKILL` \| `SIGINT` |  | — | Signal to send: SIGTERM (graceful), SIGKILL (force), or SIGINT (interrupt). |

```yaml
# Terminate a process captured from a previous runApplication
- group: system
  name: terminateProcess
  params:
    pid: '{{ pid }}'
    signal: SIGTERM
```

### `setEnvVariable`

Sets an environment variable in the current process.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `key` | string | ✓ | — | Environment variable name. |
| `value` | string | ✓ | — | Value to assign to the environment variable. |

```yaml
# Inject a runtime API token into the process environment
- group: system
  name: setEnvVariable
  params:
    key: TIPELINE_API_TOKEN
    value: '{{ apiToken }}'
```

## Environment Variables

### `getEnvVariable`

Reads an environment variable from the current process.

**Returns:** The variable's value, or `null` if it does not exist.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `key` | string | ✓ | — | Name of the environment variable to read. |

```yaml
# Read the HOME directory path and store it for later use
- group: system
  name: getEnvVariable
  params:
    key: HOME
  destination: homeDir
```

### `deleteEnvVariable`

Removes an environment variable from the current process.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `key` | string | ✓ | — | Name of the environment variable to delete. |

```yaml
# Remove a temporary token after use to avoid leaking credentials
- group: system
  name: deleteEnvVariable
  params:
    key: TIPELINE_API_TOKEN
```
