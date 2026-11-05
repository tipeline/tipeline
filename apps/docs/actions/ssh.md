<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# SSH Actions

## General

### `connect`

Opens an SSH connection using the provided configuration and returns a live connection object.

Store the result in a variable with `destination` and inject it into subsequent actions using
`{= connection =}` — never `{{ }}`, since the connection is a live object, not a string.

**Returns:** A connected `NodeSSH` instance to pass to `exec` and `close`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `config` | object | ✓ | — | SSH connection configuration object or reference (host, port, user, private key, etc.). |

```yaml
# Open an SSH connection using a private key and store it for later use
- group: ssh
  name: connect
  params:
    config:
      host: '{{ _env.SSH_HOST }}'
      username: '{{ _env.SSH_USER }}'
      privateKeyPath: '{{ _env.SSH_KEY_PATH }}'
      passphrase: '{{ _env.SSH_PASSPHRASE }}'
  destination: connection
```

### `exec`

Executes a shell command over an existing SSH connection.

The `connection` param must be injected with `{= =}` since it is a live object.
The result exposes `stdout`, `stderr`, `code`, and `signal`.

**Returns:** An `SSHExecCommandResponse` with `stdout`, `stderr`, `code`, and `signal`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `connection` | any | ✓ | — | The active SSH connection object. |
| `command` | string | ✓ | — | Shell command to execute on the remote host. |

```yaml
# Run a shell command and capture its stdout output
- group: ssh
  name: exec
  params:
    connection: '{= connection =}'
    command: 'ls -lsa /var/log'
  destination: result
```

### `close`

Closes an open SSH connection and releases its underlying resources.

Always call `close` at the end of a pipeline to avoid leaving dangling connections.
The `connection` param must be injected with `{= =}` since it is a live object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `connection` | any | ✓ | — | The active SSH connection to close. |

```yaml
# Close the SSH connection after all remote commands have finished
- group: ssh
  name: close
  params:
    connection: '{= connection =}'
```
