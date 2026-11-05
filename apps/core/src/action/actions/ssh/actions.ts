import { NodeSSH, SSHExecCommandResponse } from 'node-ssh';
import { z } from 'zod';

import { validations } from '@tipeline/schemas';

type ConnectParams = z.infer<typeof validations.ssh.connect.runtime.schema>;
type ExecParams = z.infer<typeof validations.ssh.exec.runtime.schema>;
type CloseParams = z.infer<typeof validations.ssh.close.runtime.schema>;

/**
 * @group Actions
 */
export class GroupSSH {
  /**
   * Opens an SSH connection using the provided configuration and returns a live connection object.
   *
   * Store the result in a variable with `destination` and inject it into subsequent actions using
   * `{= connection =}` — never `{{ }}`, since the connection is a live object, not a string.
   *
   * @param params - The input parameters.
   * @returns A connected `NodeSSH` instance to pass to `exec` and `close`.
   * @example
   * ```yaml
   * # Open an SSH connection using a private key and store it for later use
   * - group: ssh
   *   name: connect
   *   params:
   *     config:
   *       host: '{{ _env.SSH_HOST }}'
   *       username: '{{ _env.SSH_USER }}'
   *       privateKeyPath: '{{ _env.SSH_KEY_PATH }}'
   *       passphrase: '{{ _env.SSH_PASSPHRASE }}'
   *   destination: connection
   * ```
   */
  static async connect(params: ConnectParams): Promise<NodeSSH> {
    const parsed = validations.ssh.connect.runtime.validate(params);
    const ssh = new NodeSSH();
    await ssh.connect(parsed.config);
    return ssh;
  }

  /**
   * Executes a shell command over an existing SSH connection.
   *
   * The `connection` param must be injected with `{= =}` since it is a live object.
   * The result exposes `stdout`, `stderr`, `code`, and `signal`.
   *
   * @param params - The input parameters.
   * @returns An `SSHExecCommandResponse` with `stdout`, `stderr`, `code`, and `signal`.
   * @example
   * ```yaml
   * # Run a shell command and capture its stdout output
   * - group: ssh
   *   name: exec
   *   params:
   *     connection: '{= connection =}'
   *     command: 'ls -lsa /var/log'
   *   destination: result
   * ```
   */
  static async exec(params: ExecParams): Promise<SSHExecCommandResponse> {
    const parsed = validations.ssh.exec.runtime.validate(params);
    const result = await parsed.connection.execCommand(parsed.command);
    return result;
  }

  /**
   * Closes an open SSH connection and releases its underlying resources.
   *
   * Always call `close` at the end of a pipeline to avoid leaving dangling connections.
   * The `connection` param must be injected with `{= =}` since it is a live object.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Close the SSH connection after all remote commands have finished
   * - group: ssh
   *   name: close
   *   params:
   *     connection: '{= connection =}'
   * ```
   */
  static async close(params: CloseParams): Promise<void> {
    const parsed = validations.ssh.close.runtime.validate(params);
    parsed.connection.dispose();
  }
}
