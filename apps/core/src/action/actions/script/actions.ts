import { VM } from 'vm2';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type RunScriptParams = z.infer<typeof validations.script.runScript.runtime.schema>;

/**
 * @group Actions
 */
export class GroupScript {
  /**
   * Runs a short JavaScript snippet inside a vm2 sandbox and returns its result.
   *
   * Use it to compute a value — reshape a list, build text, work out a date —
   * from the values you pass in `context`. The code is the body of an async
   * function: `await` works, and `return` hands the value back to the step.
   *
   * **The script is plain JavaScript, not Node.js.** It can't reach anything
   * outside itself:
   *
   * - No `require` or `import`, so no Node.js modules (`fs`, `path`, `os`,
   *   `child_process`…) and no npm packages.
   * - No `process`, `global` or `module`: no environment variables, no home
   *   folder, no current directory.
   * - No files, folders, network (`fetch`), timers (`setTimeout`) or shell
   *   commands.
   * - Workflow variables aren't visible by themselves: pass each one in
   *   `context`. Only plain values (text, numbers, true/false, lists, plain
   *   objects) go through; opened things such as a browser, a connection or an
   *   image don't.
   *
   * Built-in JavaScript (`Math`, `JSON`, `Date`, `Intl`, `RegExp`, arrays,
   * strings) and `Buffer` are available. A `log(...)` helper writes debug output.
   *
   * For work outside the script, use the matching actions and pass their
   * results in: the file and folder actions to list, read, rename or move
   * files; the http actions for web requests; `system.runApplication` to run a
   * command on this computer.
   *
   * @param params - The input parameters.
   * @returns The value returned by the script, or `undefined` if nothing is returned.
   * @example
   * ```yaml
   * # Compute a derived value from pipeline variables and return it
   * - group: script
   *   name: runScript
   *   params:
   *     code: |
   *       const full = firstName + ' ' + lastName;
   *       return full.toUpperCase();
   *     context:
   *       firstName: '{{ firstName }}'
   *       lastName: '{{ lastName }}'
   * ```
   */
  static async runScript(params: RunScriptParams): Promise<any> {
    const { code, context = {} } = validations.script.runScript.runtime.validate(params);
    return GroupScript.execute(code, context);
  }

  /**
   * Runs `code` in the sandbox. Shared by the action and the editor's preview
   * (Core.scriptPreview), so both see exactly the same scope and behavior —
   * the preview only shortens the timeout and collects `log()` output.
   */
  static async execute(
    code: string,
    context: Record<string, any>,
    options: { timeout?: number; onLog?: (args: any[]) => void } = {}
  ): Promise<any> {
    const { timeout = 30000, onLog } = options;
    const sandbox = {
      log: (...args: any[]) => {
        if (onLog) onLog(args);
        else console.log('[Script Log]:', ...args);
      },
      ...GroupScript.sanitizeContext(context),
    };

    const vm = new VM({
      timeout,
      allowAsync: true,
      sandbox,
    });

    try {
      const raw = await vm.run(`(async () => { ${code} })()`);
      // vm2 wraps objects returned from the sandbox in a Proxy; worker_threads
      // postMessage uses structuredClone which can't clone Proxies, so we strip
      // the wrapper with a JSON round-trip for any non-primitive result.
      if (raw !== null && typeof raw === 'object') {
        return JSON.parse(JSON.stringify(raw));
      }
      return raw;
    } catch (error: any) {
      throw new Error(`[script.runScript] ${error.message}`);
    }
  }

  private static sanitizeContext(userContext: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(userContext)) {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        Array.isArray(value) ||
        (typeof value === 'object' && value !== null && !(value instanceof Function))
      ) {
          result[key] = value;
      }
    }

    return result;
  }
}
