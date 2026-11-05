import { spawn } from 'child_process';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

// Splits a command string into argv tokens (honoring single/double quotes and backslash
// escapes) without interpreting any shell syntax — no `;`, `&&`, `|`, backticks, or `$()`
// substitution. This is what lets `runApplication` accept a plain command string by default
// without handing a real shell to a value that may contain template-substituted, untrusted
// input. Use `options.shell: true` when you deliberately need shell features.
function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let hasToken = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\' && (command[i + 1] === '"' || command[i + 1] === '\\')) current += command[++i];
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      hasToken = true;
      continue;
    }
    if (char === '\\' && i + 1 < command.length) {
      current += command[++i];
      hasToken = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }

  if (quote) {
    throw new Error('Unterminated quote in command string. If you need shell parsing, set options.shell: true.');
  }
  if (hasToken) tokens.push(current);
  return tokens;
}

type MessageParams = z.infer<typeof validations.system.message.runtime.schema>;
type RunApplicationParams = z.infer<typeof validations.system.runApplication.runtime.schema>;
type TerminateProcessParams = z.infer<typeof validations.system.terminateProcess.runtime.schema>;
type SetEnvVariableParams = z.infer<typeof validations.system.setEnvVariable.runtime.schema>;
type GetEnvVariableParams = z.infer<typeof validations.system.getEnvVariable.runtime.schema>;
type DeleteEnvVariableParams = z.infer<typeof validations.system.deleteEnvVariable.runtime.schema>;

/**
 * @group Actions
 */
export class GroupSystem {
  // --------------------------------------------------
  // Process
  // --------------------------------------------------

  /**
   * Emits a system message as the action result.
   *
   * @param params - The input parameters.
   * @returns The text string.
   * @example
   * ```yaml
   * # Log the current pipeline status for debugging
   * - group: system
   *   name: message
   *   params:
   *     text: 'Pipeline status: {{ status }}'
   * ```
   */
  static message(params: MessageParams): string {
    const parsed = validations.system.message.runtime.validate(params);
    return parsed.text;
  }

  /**
   * Spawns a system command or application and returns its stdout output.
   *
   * Pass `args` to run the command with explicit arguments (shell disabled by default).
   * Omit `args` and the command string is tokenized into a program + arguments and run
   * WITHOUT a shell by default — no `;`, `&&`, `|`, backticks, or `$()` are interpreted,
   * which matters when any part of `command` comes from a template-substituted variable.
   * Set `options.shell: true` only when you deliberately need real shell features (pipes,
   * redirects, chaining) and trust everything that can end up in `command`.
   *
   * @param params - The input parameters.
   * @returns The trimmed stdout of the command.
   * @example
   * ```yaml
   * # Open VLC and capture any output
   * - group: system
   *   name: runApplication
   *   params:
   *     command: open -a VLC
   * ```
   * @example
   * ```yaml
   * # Needs real shell features (here, output redirection) — opt in explicitly
   * - group: system
   *   name: runApplication
   *   params:
   *     command: 'echo done >> {{ logPath }}'
   *     options:
   *       shell: true
   * ```
   */
  static async runApplication(params: RunApplicationParams): Promise<string> {
    const { command, args, env, options } = validations.system.runApplication.runtime.validate(params);

    const explicitShell = options?.shell === true;

    let program: string;
    let spawnArgs: string[];

    if (args) {
      program = command;
      spawnArgs = args;
    } else if (explicitShell) {
      program = command;
      spawnArgs = [];
    } else {
      const tokens = tokenizeCommand(command);
      if (tokens.length === 0) throw new Error('Empty command');
      [program, ...spawnArgs] = tokens;
    }

    const child = spawn(program, spawnArgs, {
      stdio: 'pipe',
      env: { ...process.env, ...env },
      shell: explicitShell,
    });

    const diagId = `[runApp:${child.pid ?? '?'}]`;
    console.log(`${diagId} START cmd="${command}" pid=${child.pid}`);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.stdout?.on('error', (err) => {
        console.error(`${diagId} stdout stream ERROR:`, err.message);
        settle(() => reject(err));
      });

      child.stderr?.on('error', (err) => {
        console.error(`${diagId} stderr stream ERROR:`, err.message);
        settle(() => reject(err));
      });

      child.on('close', (code, signal) => {
        console.log(`${diagId} CLOSE code=${code} signal=${signal} stderr="${stderr.slice(0, 300).replace(/\n/g, ' ')}"`);
        settle(() => {
          if (code !== 0) {
            reject(new Error(stderr.trim() || `Process exited with code ${code}`));
          } else {
            resolve(stdout.trim());
          }
        });
      });

      child.on('error', (err) => {
        console.error(`${diagId} child process ERROR:`, err.message);
        settle(() => reject(err));
      });
    });
  }

  /**
   * Sends a signal to a running process to terminate it.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Terminate a process captured from a previous runApplication
   * - group: system
   *   name: terminateProcess
   *   params:
   *     pid: '{{ pid }}'
   *     signal: SIGTERM
   * ```
   */
  static terminateProcess(params: TerminateProcessParams): boolean {
    const parsed = validations.system.terminateProcess.runtime.validate(params);
    process.kill(Number(parsed.pid), parsed.signal || 'SIGTERM');
    return true;
  }

  // --------------------------------------------------
  // Environment Variables
  // --------------------------------------------------

  /**
   * Sets an environment variable in the current process.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Inject a runtime API token into the process environment
   * - group: system
   *   name: setEnvVariable
   *   params:
   *     key: TIPELINE_API_TOKEN
   *     value: '{{ apiToken }}'
   * ```
   */
  static setEnvVariable(params: SetEnvVariableParams): boolean {
    const parsed = validations.system.setEnvVariable.runtime.validate(params);
    process.env[parsed.key] = parsed.value;
    return true;
  }

  /**
   * Reads an environment variable from the current process.
   *
   * @param params - The input parameters.
   * @returns The variable's value, or `null` if it does not exist.
   * @example
   * ```yaml
   * # Read the HOME directory path and store it for later use
   * - group: system
   *   name: getEnvVariable
   *   params:
   *     key: HOME
   *   destination: homeDir
   * ```
   */
  static getEnvVariable(params: GetEnvVariableParams): string | null {
    const parsed = validations.system.getEnvVariable.runtime.validate(params);
    return process.env[parsed.key] ?? null;
  }

  /**
   * Removes an environment variable from the current process.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Remove a temporary token after use to avoid leaking credentials
   * - group: system
   *   name: deleteEnvVariable
   *   params:
   *     key: TIPELINE_API_TOKEN
   * ```
   */
  static deleteEnvVariable(params: DeleteEnvVariableParams): boolean {
    const parsed = validations.system.deleteEnvVariable.runtime.validate(params);
    delete process.env[parsed.key];
    return true;
  }
}
