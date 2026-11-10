import ipc from 'node-ipc';
import { execSync } from 'child_process';
import fs from 'node:fs';
import nodePath from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import Core from './Core';
import { corePidFile, runningCorePid } from '@tipeline/utils/coreProcess';
import { stopCoreServiceNow } from '@tipeline/utils/coreService';
import Printer from './Printer';
import IpcMessageService from './IpcMessageService';
import { WsCommandService, type RemoteConnection } from './WsCommandService';
import { generateIdentifier, parseSchedule, defaultDeleteSelection, inOtherProjects, outsideUsers } from '@tipeline/utils';
import type { ActionErrorData } from '@tipeline/types';
import readline from 'node:readline/promises';
import { coreVersionWarning } from './coreVersionWarning';
import {
  McpClient,
  createProvider,
  draftWorkflow,
  missingInputs,
  parseRunResult,
  runAgent,
  summarizeRun,
  PROVIDERS,
  PROVIDER_LABELS,
  CHOICE_MEMORY_SETTING,
  INSTRUCTIONS_SETTING,
  type AgentInstructions,
  parseChoiceMemory,
  proposalFromChoice,
  rememberChoice,
  type AgentOutcome,
  type ProviderName,
  type ReusedWorkflow,
  type RunProposal,
  type WorkflowInput,
} from '@tipeline/agent';

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json');

ipc.config.id = 'tipeline_client';
ipc.config.retry = 300;
ipc.config.maxRetries = 3;
ipc.config.silent = true;
if (process.env.TIPELINE_IPC_SOCKET_ROOT) {
  ipc.config.socketRoot = process.env.TIPELINE_IPC_SOCKET_ROOT;
}

// Core answers `unauthorized` to every event after a bad token and sends nothing else, so
// without this the command would wait forever.
function exitOnUnauthorized(socket: any) {
  socket.on('unauthorized', () => {
    Printer.printError(
      `Tipeline core rejected this CLI's token. Check that it reads the same ${nodePath.join(homedir(), '.tipeline', '.database', 'core.token')} as the running core.`
    );
    process.exit(1);
  });
}

// Core now requires every IPC client to authenticate before it will dispatch any other
// event — this is the token Core writes to disk on startup, not fetched over IPC itself
// (that would require IPC to stay unauthenticated for the fetch).
function readCoreToken(): string {
  try {
    return fs.readFileSync(nodePath.join(homedir(), '.tipeline', '.database', 'core.token'), 'utf8').trim();
  } catch {
    return '';
  }
}

type IpcResponse = {
  success: boolean;
  data: any;
  error?: string | ActionErrorData;
  correlationId?: string;
};

/** "1 workflow", "2 workflows". */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const API_KEY_ENV_VAR: Record<ProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/** How a run that didn't complete ends for scripts: anything but 0, so `exec && next` stops. */
const RUN_EXIT_CODES: Record<string, number> = { failed: 1, canceled: 1, paused: 2 };

type RunOptions = { verbose?: boolean; var?: string[]; cache?: boolean; refreshCache?: boolean };

/** The remote this command went to, once it's known. Null means this machine. */
let activeRemote: RemoteConnection | null = null;

export default class CommandService {
  // ---------------------------------------------------------------------------
  // Internal: always uses local IPC (for remote management and bootstrapping)
  // ---------------------------------------------------------------------------

  /**
   * Ends a request's connection, so the next request opens a fresh one: node-ipc would otherwise
   * reuse the open one and never fire `connect` for it. It fires `destroy` for this close too,
   * which isn't Core going away, so that handler goes first.
   */
  private static closeConnection() {
    (ipc.of.tipeline_core as any)?.off('destroy', '*');
    ipc.disconnect('tipeline_core');
  }

  private static connectLocalAndHandle(
    eventToSend: string,
    payload: unknown,
    listeners: Record<string, (data: IpcResponse) => void>,
    onDestroy?: () => void
  ) {
    ipc.connectTo('tipeline_core', () => {
      const socket = ipc.of.tipeline_core as any;
      exitOnUnauthorized(socket);

      socket.on('connect', () => {
        socket.emit('authenticate', { token: readCoreToken() });
        socket.emit(eventToSend, payload);
      });

      socket.on('destroy', () => {
        if (onDestroy) return onDestroy();
        Printer.printError('Local Tipeline core is not running. Start it with: tipeline start');
        process.exit(1);
      });

      Object.entries(listeners).forEach(([event, handler]) => {
        socket.on(event, handler);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: queries active connection, then routes to IPC or WS
  // ---------------------------------------------------------------------------

  static connectAndHandle(
    eventToSend: string,
    payload: unknown,
    listeners: Record<string, (data: IpcResponse) => void>,
    onDestroy?: () => void,
    // A remote can't see this machine's files, so what names one is swapped for what's in it.
    forRemote?: (payload: any) => unknown
  ) {
    const lookupId = generateIdentifier();
    let switchingToRemote = false;

    ipc.connectTo('tipeline_core', () => {
      const socket = ipc.of.tipeline_core as any;
      exitOnUnauthorized(socket);

      socket.on('connect', () => {
        socket.emit('authenticate', { token: readCoreToken() });
        socket.emit('connectionGetActive', { correlationId: lookupId });
      });

      socket.on('onConnectionGetActive', (response: IpcResponse) => {
        const connection: RemoteConnection | null = response.data?.connection ?? null;

        if (connection) {
          switchingToRemote = true;
          activeRemote = connection;
          ipc.disconnect('tipeline_core');
          // On stderr, so scripts reading the output don't see it.
          console.error(`[remote] Using "${connection.name}" (${connection.host})`);
          const remotePayload = forRemote ? CommandService.preparingForRemote(forRemote, payload) : payload;
          WsCommandService.connectAndHandle(connection, eventToSend, remotePayload, listeners, () => {
            // Never falls back to this machine: a run meant for that Core mustn't happen here.
            Printer.printError(
              `Remote "${connection.name}" (${connection.host}) can't be reached, so nothing was done. Try again, or go back to this machine with: tipeline remote use local`
            );
            process.exit(1);
          });
        } else {
          // On stderr, so scripts reading the output don't see it.
          const versionWarning = coreVersionWarning(CLI_VERSION, response.data?.coreVersion);
          if (versionWarning) console.error(`[version] ${versionWarning}`);
          // Stay on local IPC, send the actual command
          socket.emit(eventToSend, payload);
          Object.entries(listeners).forEach(([event, handler]) => {
            socket.on(event, handler);
          });
        }
      });

      socket.on('destroy', () => {
        if (switchingToRemote) return;
        if (onDestroy) {
          onDestroy();
        } else {
          Printer.printError('Tipeline core is not running. Start it with: tipeline start');
          process.exit(1);
        }
      });
    });
  }

  private static preparingForRemote(forRemote: (payload: any) => unknown, payload: unknown) {
    try {
      return forRemote(payload);
    } catch (err: any) {
      Printer.printError(err.message ?? String(err));
      process.exit(1);
    }
  }

  /** Swaps the path in a payload's `key` for the contents of that file on this machine. */
  private static withFileContents(key: string, file: string) {
    return (payload: any) => {
      const { [key]: _path, ...rest } = payload.payload;
      return { ...payload, payload: { ...rest, content: fs.readFileSync(file, 'utf8') } };
    };
  }

  // ---------------------------------------------------------------------------
  // Task stream listeners (shared by run / exec / pipelineResume)
  // ---------------------------------------------------------------------------

  private static buildTaskListeners(correlationId: string, verbose: boolean) {
    // Core broadcasts every run's events to every client, so each one is checked against this
    // run. The top-level workflow ends last, so its end decides the exit code.
    let exitCode = 0;
    return {
      onTaskStart: (response: IpcResponse) => {
        if (correlationId === response.correlationId) {
          Printer.printTaskStart(response.data, verbose);
        }
      },
      onTaskEnd: (response: IpcResponse) => {
        if (correlationId === response.correlationId) {
          Printer.printTaskEnd(response.data, verbose);
          exitCode = RUN_EXIT_CODES[response.data?.status] ?? 0;
        }
      },
      onTaskError: (response: IpcResponse) => {
        if (correlationId === response.correlationId) {
          Printer.printError(response.error);
          process.exit(1);
        }
      },
      onAction: (response: IpcResponse) => {
        if (correlationId === response.correlationId) {
          Printer.printAction(response.data, verbose);
        }
      },
      onTaskEndAll: (response: IpcResponse) => {
        if (correlationId === response.correlationId) {
          process.exit(exitCode);
        }
      },
    };
  }

  // --------------------------------------------------
  // Core service commands
  // --------------------------------------------------

  static install(options: { force?: boolean } = {}) {
    try {
      const message = new Core().install(options);
      Printer.printMessage(message);
    } catch (err: any) {
      Printer.printError(err.message ?? err);
      process.exit(1);
    }
  }

  static async start() {
    try {
      const message = await new Core().start();
      Printer.printMessage(message);
    } catch (err: any) {
      Printer.printError(err.message ?? err);
      process.exit(1);
    }
  }

  static service(action: 'install' | 'uninstall' | 'status') {
    try {
      const core = new Core();
      const message =
        action === 'install'
          ? core.serviceInstall()
          : action === 'uninstall'
            ? core.serviceUninstall()
            : core.serviceStatus();
      Printer.printMessage(message);
    } catch (err: any) {
      Printer.printError(err.message ?? err);
      process.exit(1);
    }
  }

  /** Like `start` and `service`, stop means this machine's Core unless told otherwise. */
  static stop(options: { force?: boolean; remote?: boolean } = {}) {
    if (options.force) {
      CommandService.forceKill();
      return;
    }

    const connect = options.remote
      ? CommandService.connectAndHandle.bind(CommandService)
      : CommandService.connectLocalAndHandle.bind(CommandService);
    connect(
      'stop',
      null,
      {
        onStop: (response: IpcResponse) => {
          if (response?.success) {
            Printer.printMessage(
              activeRemote
                ? `Remote "${activeRemote.name}" is stopping. It finishes any run in progress first.`
                : 'Core is stopping. It finishes any run in progress first.'
            );
          } else {
            Printer.printError(response.error ?? 'Unknown error');
          }
          process.exit(response?.success ? 0 : 1);
        },
      },
      () => {
        Printer.printMessage('IPC unreachable — falling back to PID file...');
        try {
          const message = new Core().stop();
          Printer.printMessage(message);
          process.exit(0);
        } catch {
          Printer.printError('Tipeline core is not running.');
          process.exit(1);
        }
      }
    );
  }

  private static forceKill() {
    let killedAny = false;

    // Otherwise the service would bring a killed Core straight back.
    stopCoreServiceNow();

    // Primary target: the PID file Core writes for itself, however it was started. A stale
    // pid can belong to another program by now, so only a real Core gets killed.
    const pidFile = corePidFile();
    if (fs.existsSync(pidFile)) {
      const pid = runningCorePid(pidFile);
      if (pid !== null) {
        try {
          process.kill(pid, 'SIGKILL');
          killedAny = true;
        } catch {
          // already dead
        }
      }
      try {
        fs.unlinkSync(pidFile);
      } catch {
        // ignore
      }
    }

    // Fallback safety net for any Server.js process the pid file didn't catch.
    // Matches both this CLI's own spawn path (apps/core/dist/engine/Server.js) and
    // the packaged Desktop app's bundled copy (.../Resources/core/dist/engine/Server.js)
    // — the old pattern required the "apps/" prefix, so it silently missed the
    // packaged app's process entirely.
    try {
      execSync('pkill -f "core/dist/engine/Server.js"', { stdio: 'ignore' });
      killedAny = true;
    } catch {
      // no matching processes
    }

    Printer.printMessage(
      killedAny ? 'All Tipeline server processes killed.' : 'No Tipeline server processes found.'
    );
    process.exit();
  }

  // Right after `start`, the core process may exist but not have bound its IPC socket yet.
  // Retry briefly before reporting "not running" so `start && status` doesn't false-negative.
  static status(attemptsLeft = 6, waited = false) {
    CommandService.connectAndHandle(
      'status',
      null,
      {
        onStatus: (response: IpcResponse) => {
          if (response?.success) {
            Printer.printStatus({
              ...response.data,
              cliVersion: CLI_VERSION,
              connectedTo: activeRemote ? `${activeRemote.name} (${activeRemote.host})` : 'this machine',
            });
          } else {
            Printer.printError(response.error ?? 'Unknown error');
          }
          process.exit(response?.success ? 0 : 1);
        },
      },
      () => {
        // Core binds its socket last, so one with a pid but no socket yet may still be starting.
        const pid = runningCorePid();
        if (pid === null) {
          Printer.printError('Tipeline core is not running. Start it with: tipeline start');
          return process.exit(1);
        }
        if (attemptsLeft <= 1) {
          Printer.printError(
            `Tipeline core (PID ${pid}) is running but not answering. Restart it with: tipeline stop --force, then tipeline start`
          );
          return process.exit(1);
        }
        // On stderr, so scripts reading the output don't see it.
        if (!waited) console.error('Waiting for Tipeline core to finish starting...');
        setTimeout(() => CommandService.status(attemptsLeft - 1, true), 300);
      }
    );
  }

  // --------------------------------------------------
  // Task commands
  // --------------------------------------------------

  static async taskRun(source: string, options: RunOptions) {
    const verbose = options.verbose ?? false;
    const variables = CommandService.parseVars(options.var);
    const resolvedSource = nodePath.resolve(process.cwd(), source);
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, {
      source: resolvedSource,
      variables,
      checkVariables: true,
      ...CommandService.cacheOption(options),
    });
    this.connectAndHandle(
      'run',
      payload,
      this.buildTaskListeners(correlationId, verbose),
      undefined,
      this.withFileContents('source', resolvedSource)
    );
  }

  static async taskExec(identifier: string, options: RunOptions) {
    const verbose = options.verbose ?? false;
    const variables = CommandService.parseVars(options.var);
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, {
      identifier,
      variables,
      checkVariables: true,
      ...CommandService.cacheOption(options),
    });
    this.connectAndHandle('exec', payload, this.buildTaskListeners(correlationId, verbose));
  }

  // --no-cache → bypass (Commander sets `cache: false`), --refresh-cache → refresh.
  private static cacheOption(options: RunOptions): { cache?: 'bypass' | 'refresh' } {
    if (options.cache === false) return { cache: 'bypass' };
    if (options.refreshCache) return { cache: 'refresh' };
    return {};
  }

  // --------------------------------------------------
  // Cache commands
  // --------------------------------------------------

  static async cacheList(options: { workflow?: string }) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(
      correlationId,
      options.workflow ? { owner: options.workflow } : {}
    );
    CommandService.connectAndHandle('cacheList', payload, {
      onCacheList: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printCacheList(response.data);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async cacheClear(options: { workflow?: string; all?: boolean }) {
    if (!options.workflow && !options.all) {
      Printer.printError('Say what to clear: --workflow <workflow-identifier>, or --all for every cached result.');
      process.exit(1);
    }
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(
      correlationId,
      options.workflow ? { owner: options.workflow } : {}
    );
    CommandService.connectAndHandle('cacheClear', payload, {
      onCacheClear: (response: IpcResponse) => {
        if (response?.success) {
          const removed = response.data?.removed ?? 0;
          Printer.printMessage(
            options.workflow
              ? `Deleted ${removed} cached result(s) for workflow "${options.workflow}".`
              : `Deleted ${removed} cached result(s).`
          );
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async taskList() {
    CommandService.connectAndHandle('taskList', null, {
      onTaskList: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printTaskList(response.data);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async taskReload(identifier: string, path: string) {
    const resolvedPath = nodePath.resolve(process.cwd(), path);
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, {
      identifier,
      path: resolvedPath,
    });
    CommandService.connectAndHandle(
      'taskReload',
      payload,
      {
        onTaskReload: (response: IpcResponse) => {
          if (response?.success) {
            Printer.printMessage(response.data);
          } else {
            Printer.printError(response.error);
          }
          process.exit(response?.success ? 0 : 1);
        },
      },
      undefined,
      CommandService.withFileContents('path', resolvedPath)
    );
  }

  private static secretsNote(count: number | undefined) {
    if (count) Printer.printMessage(`${plural(count, 'secret value')} left out. Add --include-secrets to write them in plain text.`);
  }

  static async taskExport(identifier: string, options: { output?: string; includeSecrets?: boolean }) {
    // Without --output, Core names the file after the workflow in the current folder.
    const targetPath = nodePath.resolve(process.cwd(), options.output ?? '.');
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, {
      identifier,
      targetPath,
      ...(options.includeSecrets ? { includeSecrets: true } : {}),
    });
    CommandService.connectAndHandle(
      'taskExport',
      payload,
      {
        onTaskExport: (response: IpcResponse) => {
          if (response?.success) {
            // From a remote the file comes back, to be saved here rather than on that machine.
            let written = response.data?.path ?? targetPath;
            if (response.data?.content !== undefined) {
              const isFolder = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
              written = isFolder ? nodePath.join(targetPath, response.data.fileName) : targetPath;
              fs.writeFileSync(written, response.data.content);
            }
            Printer.printMessage(`Workflow exported to: ${written}`);
            CommandService.secretsNote(response.data?.secretsRedacted);
          } else {
            Printer.printError(response.error ?? 'Unknown error');
          }
          process.exit(response?.success ? 0 : 1);
        },
      },
      undefined,
      (message) => {
        const { targetPath: _path, ...rest } = message.payload;
        return { ...message, payload: { ...rest, returnContent: true } };
      }
    );
  }

  static async taskExportAll(options: { output?: string; includeSecrets?: boolean }) {
    const targetPath = nodePath.resolve(process.cwd(), options.output ?? `tipeline-workflows-export-${Date.now()}.zip`);
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, {
      targetPath,
      ...(options.includeSecrets ? { includeSecrets: true } : {}),
    });
    CommandService.connectAndHandle(
      'taskExportAll',
      payload,
      {
        onTaskExportAll: (response: IpcResponse) => {
          if (response?.success) {
            if (response.data.zipBase64) fs.writeFileSync(targetPath, Buffer.from(response.data.zipBase64, 'base64'));
            Printer.printMessage(`Exported ${response.data.count} workflow(s) to: ${targetPath}`);
            CommandService.secretsNote(response.data.secretsRedacted);
          } else {
            Printer.printError(response.error ?? 'Unknown error');
          }
          process.exit(response?.success ? 0 : 1);
        },
      },
      undefined,
      (message) => {
        const { targetPath: _path, ...rest } = message.payload;
        return { ...message, payload: { ...rest, returnContent: true } };
      }
    );
  }

  static async taskValidate(source: string) {
    const resolvedSource = nodePath.resolve(process.cwd(), source);
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { source: resolvedSource });
    CommandService.connectAndHandle(
      'taskValidate',
      payload,
      {
        onTaskValidate: (response: IpcResponse) => {
          if (response?.success) {
            Printer.printMessage(response.data);
          } else {
            Printer.printError(response.error);
          }
          process.exit(response?.success ? 0 : 1);
        },
      },
      undefined,
      CommandService.withFileContents('source', resolvedSource)
    );
  }

  static async taskInstall(filePath: string) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err: any) {
      Printer.printError(err.message ?? err);
      process.exit(1);
    }
    const baseDir = nodePath.dirname(nodePath.resolve(filePath));
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { content, baseDir });
    CommandService.connectAndHandle('taskInstall', payload, {
      onTaskInstall: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(response.data);
        } else {
          Printer.printError(response.error);
        }
        process.exit(response?.success ? 0 : 1);
      },
    }, undefined, (message) => {
      // Nothing beside the file can be found from there, so the remote refuses what needs it.
      const { baseDir: _baseDir, ...rest } = message.payload;
      return { ...message, payload: { ...rest, fromElsewhere: true } };
    });
  }

  static async taskUninstall(identifier: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { identifier });
    CommandService.connectAndHandle('taskUninstall', payload, {
      onTaskUninstall: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(response.data?.message ?? response.data);
        } else {
          Printer.printError(response.error);
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async taskInfo(identifier: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { identifier, capabilities: true });
    CommandService.connectAndHandle('taskDetail', payload, {
      onTaskDetail: (response: IpcResponse) => {
        const found = !!response?.success && !!response.data;
        if (found) {
          Printer.printTaskInfo(response.data);
        } else if (response?.success) {
          Printer.printError(`Workflow "${identifier}" not found`);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(found ? 0 : 1);
      },
    });
  }

  static async taskHistory(identifier: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { taskIdentifier: identifier });
    CommandService.connectAndHandle('pipelineList', payload, {
      onPipelineList: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printPipelineList(response.data);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  // --------------------------------------------------
  // Pipeline commands
  // --------------------------------------------------

  static async pipelineList(taskIdentifier: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { taskIdentifier });
    CommandService.connectAndHandle('pipelineList', payload, {
      onPipelineList: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printPipelineList(response.data);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async pipelineInfo(pipelineIdentifier: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { pipelineIdentifier });
    CommandService.connectAndHandle('pipelineDetail', payload, {
      onPipelineDetail: (response: IpcResponse) => {
        const found = !!response?.success && !!response.data;
        if (found) {
          Printer.printPipelineInfo(response.data);
        } else if (response?.success) {
          Printer.printError(`Pipeline "${pipelineIdentifier}" not found`);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(found ? 0 : 1);
      },
    });
  }

  static async pipelineClear(taskIdentifier: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { taskIdentifier });
    CommandService.connectAndHandle('pipelineClear', payload, {
      onPipelineClear: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(`Deleted ${response.data.deleted} run(s) for workflow "${taskIdentifier}".`);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  /**
   * Cancels a run: a running one ends right away (including the step running now
   * finishes first), one waiting for an approval ends right away. Recorded as canceled
   * by "cli" (on a server, by the signed-in user).
   */
  static async pipelineCancel(pipelineIdentifier: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, {
      pipelineIdentifier,
      canceledBy: 'cli',
    });
    CommandService.connectAndHandle('pipelineCancel', payload, {
      onPipelineCancel: (response: IpcResponse) => {
        if (!response?.success) {
          Printer.printError(response?.error ?? 'Unknown error');
          process.exit(1);
          return;
        }
        const status = response.data?.status;
        if (status === 'canceling') {
          Printer.printMessage(
            `Canceling run "${pipelineIdentifier}". It ends right away, including the step running now.`
          );
        } else if (status === 'canceled') {
          Printer.printMessage(`Run "${pipelineIdentifier}" canceled.`);
        } else {
          Printer.printMessage(`Run "${pipelineIdentifier}" had already ended — nothing to cancel.`);
        }
        process.exit(0);
      },
    });
  }

  /** Shows how long runs are kept, or sets it: a number of days, or "off" to keep them forever. */
  static async runRetention(value?: string) {
    try {
      if (value !== undefined) {
        const days = value === 'off' ? 0 : Number(value);
        if (!Number.isInteger(days) || days < 0) {
          Printer.printError('Give a whole number of days, or "off" to keep runs forever.');
          return process.exit(1);
        }
        await CommandService.request('settingsSet', 'onSettingsSet', { key: 'runs.keepDays', value: String(days) });
        Printer.printMessage(days ? `Finished runs are now deleted after ${days} days.` : 'Runs are now kept forever.');
        return process.exit(0);
      }
      const settings = await CommandService.request<Record<string, string>>('settingsList', 'onSettingsList', null);
      const days = settings?.['runs.keepDays'] ?? '90';
      Printer.printMessage(days === '0' ? 'Runs are kept forever.' : `Finished runs are deleted after ${days} days.`);
      process.exit(0);
    } catch (error: any) {
      Printer.printError(error?.message ?? String(error));
      process.exit(1);
    }
  }

  static async approvalList() {
    try {
      const approvals = (await CommandService.request<any[]>('approvalList', 'onApprovalList', {})) ?? [];
      Printer.printApprovalList(approvals);
      process.exit(0);
    } catch (error: any) {
      Printer.printError(error?.message ?? String(error));
      process.exit(1);
    }
  }

  static async approvalDecide(pipelineIdentifier: string, approved: boolean, options: { comment?: string } = {}) {
    try {
      await CommandService.request('approvalDecide', 'onApprovalDecide', {
        pipelineIdentifier,
        approved,
        comment: options.comment ?? '',
        decidedBy: 'cli',
      });
      Printer.printMessage(
        approved
          ? `Approved. The run carries on: tipeline pipeline info ${pipelineIdentifier}`
          : `Rejected. The run ends as canceled.`
      );
      process.exit(0);
    } catch (error: any) {
      Printer.printError(error?.message ?? String(error));
      process.exit(1);
    }
  }

  static async pipelineResume(
    pipelineIdentifier: string,
    options: { verbose?: boolean; var?: string[] }
  ) {
    const verbose = options.verbose ?? false;
    const variables = CommandService.parseVars(options.var);
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, {
      pipelineIdentifier,
      variables,
      checkVariables: true,
    });
    CommandService.connectAndHandle(
      'pipelineResume',
      payload,
      this.buildTaskListeners(correlationId, verbose)
    );
  }

  // --------------------------------------------------
  // Schedule commands
  // --------------------------------------------------

  static scheduleList() {
    CommandService.connectAndHandle('scheduleList', null, {
      onScheduleList: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printScheduleList(response.data);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async scheduleSet(
    identifier: string,
    options: { when?: string; cron?: string },
    variables: Record<string, unknown> = {}
  ) {
    const { when, cron } = options;
    if (!when === !cron) {
      Printer.printError('Give either --when "every day at 9am" or --cron "0 9 * * *"');
      process.exit(1);
    }
    // Read here too, so a mistake shows before connecting and a good one shows what it means.
    const parsed = parseSchedule(when ?? cron!);
    if (!parsed.ok) {
      Printer.printError(parsed.message);
      process.exit(1);
    }
    const correlationId = generateIdentifier();
    const timing = scheduleTiming(parsed);
    const payload = await IpcMessageService.generatePayload(correlationId, { identifier, ...timing, variables });
    CommandService.connectAndHandle('scheduleSet', payload, {
      onScheduleSet: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(
            `Schedule created: ${response.data.scheduleIdentifier} (workflow: ${response.data.taskIdentifier})\n` +
              `  ${Printer.scheduleWhen(timing)}`
          );
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async scheduleRemove(scheduleIdentifier: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { scheduleIdentifier });
    CommandService.connectAndHandle('scheduleRemove', payload, {
      onScheduleRemove: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(response.data);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  // --------------------------------------------------
  // Project commands
  // --------------------------------------------------

  /**
   * Deletes a project. Its workflows and apps are kept (out of the project) unless
   * `withContents`; then they go to the Trash too, except ones also in another project
   * (always kept) and workflows something outside the deletion still uses, which are
   * kept unless `includeUsed`. Shows what happens and asks first, unless `yes`.
   */
  static async projectDelete(
    nameOrIdentifier: string,
    options: { withContents?: boolean; includeUsed?: boolean; yes?: boolean } = {}
  ) {
    try {
      const projects = (await CommandService.request<any[]>('projectList', 'onProjectList', null)) ?? [];
      const wanted = nameOrIdentifier.trim().toLowerCase();
      const project =
        projects.find((p) => p.identifier === nameOrIdentifier) ?? projects.find((p) => p.name?.toLowerCase() === wanted);
      if (!project) {
        Printer.printError(`No project named "${nameOrIdentifier}".`);
        return process.exit(1);
      }

      const preview = await CommandService.request<any>('projectDeletePreview', 'onProjectDeletePreview', {
        identifier: project.identifier,
      });
      const workflows: any[] = preview?.workflows ?? [];
      const apps: any[] = preview?.apps ?? [];
      const selection = defaultDeleteSelection({ workflows, apps });
      if (options.includeUsed) {
        workflows.filter((w) => !inOtherProjects(w)).forEach((w) => selection.workflows.add(w.identifier));
      }
      const elsewhere = [...workflows, ...apps].filter(inOtherProjects);
      const withContents = !!options.withContents && workflows.length + apps.length > 0;

      const named = (users: any[]) =>
        users.map((u) => (u.projects?.length ? `${u.name} (${u.projects.map((p: any) => p.name).join(', ')})` : u.name)).join(', ');
      const lines: string[] = [`Delete project "${project.name}"?`];
      if (!withContents) {
        if (workflows.length + apps.length > 0) {
          lines.push(`  Its ${plural(workflows.length, 'workflow')} and ${plural(apps.length, 'app')} stay, out of the project.`);
          lines.push('  (Use --with-contents to delete them too.)');
        }
      } else {
        const trashed = workflows.filter((w) => selection.workflows.has(w.identifier));
        const kept = workflows.filter((w) => !selection.workflows.has(w.identifier) && !inOtherProjects(w));
        lines.push('  Moves to the Trash (restorable for 30 days):');
        for (const workflow of trashed) {
          lines.push(`    workflow  ${workflow.name}`);
          const outside = outsideUsers(workflow, selection);
          if (outside.apps.length) lines.push(`              will stop working: ${named(outside.apps)}`);
          if (outside.workflows.length) lines.push(`              will fail: ${named(outside.workflows)}`);
          if (workflow.schedules?.length) lines.push(
              `              ${plural(workflow.schedules.length, 'schedule')} ${workflow.schedules.length === 1 ? 'goes' : 'go'} with it`
            );
        }
        for (const app of apps.filter((a) => selection.apps.has(a.identifier))) lines.push(`    app       ${app.name}`);
        if (elsewhere.length) {
          lines.push('  Kept, also in other projects (only taken out of this one):');
          for (const item of elsewhere) {
            const kind = workflows.includes(item) ? 'workflow' : 'app     ';
            lines.push(`    ${kind}  ${item.name} — also in ${item.alsoIn.map((p: any) => p.name).join(', ')}`);
          }
        }
        if (kept.length) {
          lines.push('  Kept, still used elsewhere (use --include-used to delete them too):');
          for (const workflow of kept) {
            const outside = outsideUsers(workflow, selection);
            lines.push(`    workflow  ${workflow.name} — used by ${named([...outside.apps, ...outside.workflows])}`);
          }
        }
      }
      Printer.printMessage(lines.join('\n'));

      if (!options.yes) {
        if (!(process.stdin.isTTY && process.stdout.isTTY)) {
          Printer.printError('Nothing deleted. Run with --yes to delete without asking.');
          return process.exit(1);
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = (await rl.question('Delete? [y/N] ')).trim().toLowerCase();
        rl.close();
        if (answer !== 'y' && answer !== 'yes') {
          Printer.printMessage('Nothing deleted.');
          return process.exit(0);
        }
      }

      const contents = withContents
        ? { workflows: [...selection.workflows], apps: [...selection.apps] }
        : {};
      await CommandService.request('projectDelete', 'onProjectDelete', { identifier: project.identifier, ...contents });
      const count = withContents ? selection.workflows.size + selection.apps.size : 0;
      Printer.printMessage(
        count > 0 ? `Project deleted; ${plural(count, 'item')} moved to the Trash.` : 'Project deleted.'
      );
      process.exit(0);
    } catch (error: any) {
      Printer.printError(error?.message ?? String(error));
      process.exit(1);
    }
  }

  /** One request to Core (local, or the active remote), as a promise. */
  private static request<T>(channel: string, responseEvent: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      CommandService.connectAndHandle(channel, { correlationId: generateIdentifier(), payload }, {
        [responseEvent]: (response: IpcResponse) => {
          CommandService.closeConnection();
          if (response?.success) resolve(response.data as T);
          else reject(new Error(typeof response?.error === 'string' ? response.error : `${channel} failed`));
        },
      });
    });
  }

  // --------------------------------------------------
  // Remote commands (always local IPC — manage connections in Core's DB)
  // --------------------------------------------------

  static async remoteList() {
    try {
      const connections = (await CommandService.localRequest<any[]>('connectionList', 'onConnectionList', null)) ?? [];
      const active = await CommandService.localRequest<{ activeId: string | null }>(
        'connectionGetActive',
        'onConnectionGetActive',
        null
      );
      Printer.printMessage(`Commands go to: ${connections.find((c) => c.id === active?.activeId)?.name ?? 'this machine'}`);
      if (connections.length === 0) Printer.printMessage('No remote connections configured.');
      connections.forEach((c) =>
        Printer.printMessage(`${c.id === active?.activeId ? '* ' : '  '}${c.id}  ${c.name}  ${c.host}`)
      );
      process.exit(0);
    } catch (error: any) {
      Printer.printError(error?.message ?? String(error));
      process.exit(1);
    }
  }

  static remoteAdd(name: string, host: string, token: string) {
    const correlationId = generateIdentifier();
    CommandService.connectLocalAndHandle(
      'connectionAdd',
      { correlationId, payload: { name, host, token } },
      {
        onConnectionAdd: (response: IpcResponse) => {
          if (response?.success) {
            Printer.printMessage(`Remote "${response.data.name}" added (${response.data.host})`);
          } else {
            Printer.printError(response.error ?? 'Unknown error');
          }
          process.exit(response?.success ? 0 : 1);
        },
      }
    );
  }

  static remoteRemove(id: string) {
    const correlationId = generateIdentifier();
    CommandService.connectLocalAndHandle(
      'connectionRemove',
      { correlationId, payload: { id } },
      {
        onConnectionRemove: (response: IpcResponse) => {
          if (response?.success) {
            Printer.printMessage(`Remote "${id}" removed.`);
          } else {
            Printer.printError(response.error ?? 'Unknown error');
          }
          process.exit(response?.success ? 0 : 1);
        },
      }
    );
  }

  static remoteUse(id: string | null) {
    const correlationId = generateIdentifier();
    CommandService.connectLocalAndHandle(
      'connectionSetActive',
      { correlationId, payload: { id } },
      {
        onConnectionSetActive: (response: IpcResponse) => {
          if (response?.success) {
            Printer.printMessage(
              id === null ? 'Switched to local core.' : `Switched to remote: ${id}`
            );
          } else {
            Printer.printError(response.error ?? 'Unknown error');
          }
          process.exit(response?.success ? 0 : 1);
        },
      }
    );
  }

  // --------------------------------------------------
  // Hub commands
  // --------------------------------------------------

  static async hubList() {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, null);
    CommandService.connectAndHandle('hubList', payload, {
      onHubList: (response: IpcResponse) => {
        if (response?.success) {
          const hubs: any[] = response.data ?? [];
          if (hubs.length === 0) {
            Printer.printMessage('No hubs configured.');
          } else {
            hubs.forEach((h) =>
              Printer.printMessage(
                `  ${h.id}  ${h.name}  [${h.type}]  ${h.target}  ${h.enabled ? 'enabled' : 'disabled'}${h.hasToken ? '  (token)' : ''}`
              )
            );
          }
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubAdd(name: string, type: 'remote' | 'local_folder', target: string, token?: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { name, type, target, token });
    CommandService.connectAndHandle('hubAdd', payload, {
      onHubAdd: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(`Hub "${response.data.name}" added (${response.data.id})`);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubSetToken(id: string, token?: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { id, token: token ?? null });
    CommandService.connectAndHandle('hubUpdate', payload, {
      onHubUpdate: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(token ? `Token saved for hub "${response.data.name}".` : `Token removed from hub "${response.data.name}".`);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubRemove(id: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { id });
    CommandService.connectAndHandle('hubRemove', payload, {
      onHubRemove: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(`Hub "${id}" removed.`);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubSetEnabled(id: string, enabled: boolean) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { id, enabled });
    CommandService.connectAndHandle('hubSetEnabled', payload, {
      onHubSetEnabled: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(`Hub "${id}" ${enabled ? 'enabled' : 'disabled'}.`);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubCatalog(id: string) {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { hubId: id });
    CommandService.connectAndHandle('hubCatalog', payload, {
      onHubCatalog: (response: IpcResponse) => {
        if (response?.success) {
          const items: any[] = response.data ?? [];
          if (items.length === 0) {
            Printer.printMessage('No items in this hub catalog.');
          } else {
            items.forEach((i) => Printer.printMessage(`  [${i.type === 'task' ? 'workflow' : i.type}]  ${i.identifier}  ${i.name}  v${i.version}`));
          }
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubInstall(rawType: 'workflow' | 'task' | 'app' | 'plugin', hubId: string, itemIdentifier: string) {
    // "workflow" is the user-facing name; hub items and IPC channels still use "task".
    const type = rawType === 'workflow' ? 'task' : rawType;
    const channel = { task: 'hubInstallTask', app: 'hubInstallApp', plugin: 'hubInstallPlugin' }[type];
    const responseEvent = { task: 'onHubInstallTask', app: 'onHubInstallApp', plugin: 'onHubInstallPlugin' }[type];
    if (!channel || !responseEvent) {
      Printer.printError(`Unknown type "${rawType}". Use workflow, app or plugin.`);
      return process.exit(1);
    }
    // A workflow whose plugins aren't installed or are off would fail with "Unknown action":
    // name them first, with the commands that fix them.
    if (type === 'task') {
      let missing: HubTaskPreview['missingPlugins'] = [];
      try {
        const preview = await CommandService.request<HubTaskPreview>('hubPreviewTask', 'onHubPreviewTask', {
          hubId,
          itemIdentifier,
        });
        missing = preview?.missingPlugins ?? [];
      } catch {
        // The install below reports what's wrong (unknown hub or item, unreachable hub…).
      }
      if (missing.length > 0) {
        Printer.printError(`Workflow "${itemIdentifier}" uses plugins that aren't ready, so nothing was installed.`);
        for (const plugin of missing) Printer.printError(`  ${describeMissingPlugin(plugin)}`);
        Printer.printMessage('Then run this command again.');
        return process.exit(1);
      }
    }
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { hubId, itemIdentifier });
    CommandService.connectAndHandle(channel, payload, {
      [responseEvent]: (response: IpcResponse) => {
        if (response?.success) {
          const installedAs = response.data?.identifier ?? itemIdentifier;
          Printer.printMessage(`${rawType} "${installedAs}" installed from hub "${hubId}".`);
          // Plugins run their own code, so they stay off until someone turns them on.
          if (type === 'plugin' && !response.data?.enabled) {
            Printer.printMessage(`It's disabled for now. Turn it on with: tipeline plugin enable ${installedAs}`);
          }
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubUpdates() {
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, null);
    CommandService.connectAndHandle('hubUpdateEvents', payload, {
      onHubUpdateEvents: (response: IpcResponse) => {
        if (response?.success) {
          const events: any[] = response.data ?? [];
          if (events.length === 0) Printer.printMessage('No hub updates yet.');
          events.forEach((e) => {
            const type = e.item_type === 'task' ? 'workflow' : e.item_type;
            const versions = [e.from_version, e.to_version].filter(Boolean).join(' -> ');
            const detail = e.message ? `  ${e.message}` : '';
            Printer.printMessage(`  ${e.kind}  [${type}]  ${e.item_identifier}  ${e.item_name ?? ''}  ${versions}${detail}`);
          });
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubUpdate(rawType: 'workflow' | 'task' | 'app' | 'plugin', identifier: string) {
    // "workflow" is the user-facing name; IPC channels still use "task".
    const type = rawType === 'workflow' ? 'task' : rawType;
    const channel = { task: 'hubUpdateTask', app: 'hubUpdateApp', plugin: 'hubUpdatePlugin' }[type];
    const responseEvent = { task: 'onHubUpdateTask', app: 'onHubUpdateApp', plugin: 'onHubUpdatePlugin' }[type];
    if (!channel || !responseEvent) {
      Printer.printError(`Unknown type "${rawType}". Use workflow, app or plugin.`);
      process.exit(1);
    }
    const correlationId = generateIdentifier();
    const payload = await IpcMessageService.generatePayload(correlationId, { identifier });
    CommandService.connectAndHandle(channel, payload, {
      [responseEvent]: (response: IpcResponse) => {
        if (response?.success) {
          Printer.printMessage(`${rawType} "${identifier}" updated to ${response.data?.version ?? 'the hub version'}.`);
        } else {
          Printer.printError(response.error ?? 'Unknown error');
        }
        process.exit(response?.success ? 0 : 1);
      },
    });
  }

  static async hubCheck(id?: string) {
    const correlationId = generateIdentifier();
    const channel = id ? 'hubCheckOne' : 'hubCheckAll';
    const responseEvent = id ? 'onHubCheckOne' : 'onHubCheckAll';
    const payload = await IpcMessageService.generatePayload(correlationId, id ? { hubId: id } : null);
    CommandService.connectAndHandle(channel, payload, {
      [responseEvent]: (response: IpcResponse) => {
        if (!response?.success) {
          Printer.printError(response?.error ?? 'Unknown error');
          process.exit(1);
        }
        const results: any[] = [response.data ?? []].flat();
        if (results.length === 0) Printer.printMessage('No enabled hubs to check.');
        for (const result of results) {
          if (result.ok) Printer.printMessage(`Hub "${result.name}" checked: ${plural(result.items ?? 0, 'item')} in its catalog.`);
          else Printer.printError(`Hub "${result.name}" couldn't be checked: ${result.error}`);
        }
        process.exit(results.every((result) => result.ok) ? 0 : 1);
      },
    });
  }

  // --------------------------------------------------
  // Plugin commands
  // --------------------------------------------------

  static async pluginList() {
    try {
      const plugins = (await CommandService.request<any[]>('pluginList', 'onPluginList', null)) ?? [];
      if (plugins.length === 0) Printer.printMessage('No plugins installed.');
      plugins.forEach((p) =>
        Printer.printMessage(
          `  ${p.identifier}  ${p.group}  ${p.name}${p.version ? `  v${p.version}` : ''}  ${p.enabled ? 'enabled' : 'disabled'}`
        )
      );
      process.exit(0);
    } catch (error: any) {
      Printer.printError(error?.message ?? String(error));
      process.exit(1);
    }
  }

  static async pluginSetEnabled(identifierOrGroup: string, enabled: boolean) {
    try {
      const plugins = (await CommandService.request<any[]>('pluginList', 'onPluginList', null)) ?? [];
      const plugin = plugins.find((p) =>
        [p.identifier, p.group, p.hub_plugin_identifier].includes(identifierOrGroup)
      );
      if (!plugin) {
        Printer.printError(`No plugin "${identifierOrGroup}". See the installed ones with: tipeline plugin list`);
        return process.exit(1);
      }
      await CommandService.request('pluginSetEnabled', 'onPluginSetEnabled', {
        identifier: plugin.identifier,
        enabled,
      });
      Printer.printMessage(`Plugin "${plugin.name}" ${enabled ? 'enabled' : 'disabled'}.`);
      process.exit(0);
    } catch (error: any) {
      Printer.printError(error?.message ?? String(error));
      process.exit(1);
    }
  }

  // --------------------------------------------------
  // Agent commands
  // --------------------------------------------------

  static async agentPrompt(prompt: string, options: { yes?: boolean; project?: string } = {}) {
    let token = process.env.TIPELINE_MCP_TOKEN;
    let url = process.env.TIPELINE_MCP_URL;
    let providerName = process.env.TIPELINE_AGENT_PROVIDER as ProviderName | undefined;
    let apiKey = process.env[API_KEY_ENV_VAR[providerName ?? 'deepseek']];
    let baseURL = process.env.TIPELINE_AGENT_BASE_URL;
    let model = process.env.TIPELINE_AGENT_MODEL;

    // Env vars take priority (keeps scripts/CI working unchanged); fall back to
    // whatever's configured in the Desktop app (Settings > Assistant) — same Core,
    // same settings table, so configuring it once there covers the CLI too.
    if (!apiKey || !token || !url || !providerName) {
      const settings = await CommandService.fetchCoreSettings();
      providerName = providerName ?? ((settings.agent_provider as ProviderName) || 'deepseek');
      apiKey = apiKey || settings[`agent_${providerName}_api_key`];
      baseURL = baseURL ?? settings[`agent_${providerName}_base_url`];
      model = model ?? settings[`agent_${providerName}_model`];
      token = token ?? settings.agent_mcp_token;
      url = url ?? settings.agent_mcp_url;
    }
    // Last resort: the same token Core's own MCP server authenticates with, so
    // the common case (agent talking to the local Core) needs no manual setup.
    token = token ?? (await CommandService.fetchApiToken());
    providerName = providerName ?? 'deepseek';

    if (!PROVIDERS.includes(providerName)) {
      Printer.printError(`Unknown agent provider "${providerName}". Expected one of: ${PROVIDERS.join(', ')}.`);
      process.exit(1);
    }

    if (!apiKey) {
      Printer.printError(
        `No ${providerName} API key found. Export ${API_KEY_ENV_VAR[providerName]}, or set it in the Desktop app under Settings > Assistant.`
      );
      process.exit(1);
    }

    if (!token) {
      Printer.printError('Could not reach Tipeline Core to fetch its API token. Start it with: tipeline start');
      process.exit(1);
    }

    const mcpClient = new McpClient({
      url: url ?? `http://127.0.0.1:${process.env.TIPELINE_MCP_PORT || '4002'}/mcp`,
      token,
    });
    const provider = createProvider({ provider: providerName, apiKey, baseURL, model });

    try {
      const providerLabel = PROVIDER_LABELS[providerName];
      // Shared with the Desktop app: which workflow was picked before for each kind of request,
      // and the instructions from Settings > Assistant.
      const settings = await CommandService.fetchCoreSettings();
      const memory = parseChoiceMemory(settings[CHOICE_MEMORY_SETTING]);
      const instructions: AgentInstructions = { global: settings[INSTRUCTIONS_SETTING] || undefined };
      if (options.project) {
        const project = await CommandService.findProject(options.project);
        if (!project) {
          Printer.printError(`No project named "${options.project}". Check its name on the Projects page in the Desktop app.`);
          process.exit(1);
        }
        if (project.instructions) instructions.project = { name: project.name, text: project.instructions };
      }
      const outcome = await runAgent({ mcpClient, provider, providerLabel, rememberedChoices: memory, instructions }, prompt);
      if (outcome.kind === 'answer') {
        Printer.printAgentAnswer(outcome.text);
        process.exit(0);
      }

      const interactive = process.stdin.isTTY && process.stdout.isTTY;
      if (outcome.kind === 'nomatch') {
        await CommandService.offerDraft(outcome.text, outcome.draftRequest, outcome.reuse, {
          schedule: outcome.schedule,
          interactive,
          yes: options.yes,
          mcpClient,
          provider,
          providerLabel,
          instructions,
        });
        process.exit(0);
      }

      let proposal =
        outcome.kind === 'choice'
          ? await CommandService.askWhichWorkflow(outcome, memory, interactive)
          : outcome.proposal;
      if (proposal.remembered) Printer.printMessage(`Picked "${proposal.name}", as last time for a request like this.`);

      const message = outcome.kind === 'proposal' ? outcome.text : '';
      if (proposal.hub) {
        proposal = await CommandService.installHubProposal(proposal, message, { interactive, yes: options.yes });
      }

      const values = { ...defaultValues(proposal.inputs), ...proposal.variables };
      Printer.printAgentProposal(proposal, values, proposal.hub ? '' : message);
      // The request said how often: offer the schedule instead of one run now.
      const schedule = outcome.schedule;
      if (schedule) {
        const parsed = parseSchedule(schedule);
        if (!parsed.ok) {
          Printer.printError(`Couldn't read the schedule "${schedule}": ${parsed.message}`);
          process.exit(1);
        }
        Printer.printMessage(`  Runs on its own: ${Printer.scheduleWhen(scheduleTiming(parsed))}`);
      }

      const missing = missingInputs(proposal.inputs, values);
      if (missing.length > 0 && !interactive) {
        Printer.printError(
          `Missing ${missing.map((i) => i.label ?? i.name).join(', ')}. Run it with: tipeline workflow exec ${proposal.identifier} --var name=value`
        );
        process.exit(1);
      }

      if (interactive && (missing.length > 0 || !options.yes)) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try {
          for (const input of missing) {
            const answer = await rl.question(`  ${input.label ?? input.name}${input.description ? ` (${input.description})` : ''}: `);
            values[input.name] = coerceInput(input, answer);
          }
          if (missingInputs(proposal.inputs, values).length > 0) {
            Printer.printError('Some required values are still empty. Nothing was run.');
            process.exit(1);
          }
          if (!options.yes) {
            const question = schedule ? `  Create this schedule for "${proposal.name}"? [Y/n] ` : `  Run "${proposal.name}"? [Y/n] `;
            const confirm = (await rl.question(question)).trim().toLowerCase();
            if (confirm && confirm !== 'y' && confirm !== 'yes') {
              Printer.printMessage(schedule ? 'No schedule was created.' : 'Nothing was run.');
              process.exit(0);
            }
          }
        } finally {
          rl.close();
        }
      }

      if (schedule) {
        await CommandService.scheduleSet(proposal.identifier, { when: schedule }, values);
        return;
      }

      const { text } = await mcpClient.callToolRaw('exec_task', { identifier: proposal.identifier, variables: values });
      const result = parseRunResult(text);
      const answer = await summarizeRun(provider, { prompt, workflowName: proposal.name, result, providerLabel }).catch(() => '');
      Printer.printAgentResult(proposal.name, result, answer);
      process.exit(RUN_EXIT_CODES[result.status] ?? 0);
    } catch (error: any) {
      Printer.printError(error.message ?? String(error));
      process.exit(1);
    }
  }

  /**
   * Nothing fits: offers to draft the workflow the assistant described. The draft
   * is saved for testing in the Desktop builder and never runs from here.
   */
  private static async offerDraft(
    message: string,
    request: string,
    reuse: ReusedWorkflow[],
    context: {
      /** When it runs on its own: proposed with the draft, never built into it. */
      schedule?: string;
      interactive: boolean;
      yes?: boolean;
      mcpClient: McpClient;
      provider: ReturnType<typeof createProvider>;
      providerLabel: string;
      instructions?: AgentInstructions;
    }
  ) {
    Printer.printAgentNoMatch(message, request, reuse, context.schedule);
    if (!context.yes) {
      if (!context.interactive) {
        Printer.printMessage('Run again with --yes to have this workflow drafted.');
        return;
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question('  Draft this workflow? It is saved as a draft and not run. [y/N] ')).trim().toLowerCase();
      rl.close();
      if (answer !== 'y' && answer !== 'yes') {
        Printer.printMessage('Nothing was drafted.');
        return;
      }
    }

    const steps: Record<string, string> = {
      writing: 'Writing the workflow…',
      reading: 'Reading the actions it can use…',
      checking: 'Checking the draft…',
      saving: 'Saving the draft…',
      fixing: 'Fixing what the check found…',
    };
    let last = '';
    const loopConfig = {
      mcpClient: context.mcpClient,
      provider: context.provider,
      providerLabel: context.providerLabel,
      instructions: context.instructions,
      onProgress: (step: string) => {
        if (step !== last) console.log(`  ${steps[step] ?? step}`);
        last = step;
      },
    };
    let outcome = await draftWorkflow(loopConfig, request, { reuse, schedule: context.schedule });
    if (outcome.kind === 'gap') {
      // Nothing was saved. Leaving parts out takes an explicit yes, even with --yes.
      Printer.printAgentDraftGap(outcome.missing, outcome.possible);
      if (!context.interactive) {
        Printer.printMessage('Nothing was drafted. Change the request, or run it in a terminal to draft the rest anyway.');
        process.exit(1);
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question('  Create an incomplete draft without these? [y/N] ')).trim().toLowerCase();
      rl.close();
      if (answer !== 'y' && answer !== 'yes') {
        Printer.printMessage('Nothing was drafted.');
        return;
      }
      last = '';
      outcome = await draftWorkflow(loopConfig, request, { reuse, acceptMissing: outcome.missing, schedule: context.schedule });
    }
    if (outcome.kind === 'drafted') {
      Printer.printAgentDraft(outcome);
    } else if (outcome.kind === 'failed') {
      Printer.printError(outcome.text);
      for (const error of outcome.errors.slice(0, 5)) console.log(`    ${error}`);
      process.exit(1);
    }
  }

  /**
   * "Which one do you mean?" as a numbered list. The pick is remembered (shared
   * with the Desktop app) so the same kind of request goes straight to it next
   * time. Without a terminal to ask in, lists the options and exits.
   */
  private static async askWhichWorkflow(
    outcome: Extract<AgentOutcome, { kind: 'choice' }>,
    memory: ReturnType<typeof parseChoiceMemory>,
    interactive: boolean
  ): Promise<RunProposal> {
    Printer.printAgentChoice(outcome.text, outcome.options);
    if (!interactive) {
      Printer.printError('More than one workflow fits. Say which one in the request, e.g. its name.');
      process.exit(1);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`  Pick 1-${outcome.options.length} (Enter to cancel): `)).trim();
    rl.close();
    const index = Number(answer) - 1;
    const option = Number.isInteger(index) ? outcome.options[index] : undefined;
    if (!option) {
      Printer.printMessage('Nothing was run.');
      process.exit(0);
    }

    const proposal = proposalFromChoice(outcome.options, option.identifier, outcome.variables)!;
    if (outcome.requestKey) {
      const next = rememberChoice(memory, outcome.requestKey, option);
      await CommandService.localRequest('settingsSet', 'onSettingsSet', {
        key: CHOICE_MEMORY_SETTING,
        value: JSON.stringify(next),
      }).catch(() => {
        // Forgetting a pick only means the question comes back next time.
      });
    }
    return proposal;
  }

  /**
   * A hub workflow has to be installed before it runs: shows what the install
   * needs, asks (unless --yes), installs it and returns the proposal pointed at
   * the installed copy with its real inputs. Exits when a plugin is missing or
   * the user says no.
   */
  private static async installHubProposal(
    proposal: RunProposal,
    message: string,
    options: { interactive: boolean; yes?: boolean }
  ): Promise<RunProposal> {
    const hub = proposal.hub!;
    const preview = await CommandService.localRequest<HubTaskPreview>('hubPreviewTask', 'onHubPreviewTask', {
      hubId: hub.id,
      itemIdentifier: hub.itemIdentifier,
    });
    Printer.printAgentHubProposal(proposal, preview, message);

    if (preview.missingPlugins.length > 0) {
      for (const plugin of preview.missingPlugins) {
        Printer.printError(describeMissingPlugin(plugin));
      }
      process.exit(1);
    }

    if (!options.yes) {
      if (!options.interactive) {
        Printer.printError(`"${proposal.name}" isn't installed. Run again with --yes to install it from ${hub.name}.`);
        process.exit(1);
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question(`  Install "${proposal.name}" from ${hub.name}? [Y/n] `)).trim().toLowerCase();
      rl.close();
      if (answer && answer !== 'y' && answer !== 'yes') {
        Printer.printMessage('Nothing was installed.');
        process.exit(0);
      }
    }

    const installed = await CommandService.localRequest<{ identifier: string; name?: string }>(
      'hubInstallTask',
      'onHubInstallTask',
      { hubId: hub.id, itemIdentifier: hub.itemIdentifier }
    );
    Printer.printMessage(`Installed "${installed.name ?? proposal.name}".`);
    const next: RunProposal = {
      ...proposal,
      identifier: installed.identifier,
      name: installed.name ?? proposal.name,
      inputs: preview.inputs,
    };
    delete next.hub;
    return next;
  }

  /** One request to the local Core, as a promise. */
  private static localRequest<T>(channel: string, responseEvent: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      CommandService.connectLocalAndHandle(channel, { correlationId: generateIdentifier(), payload }, {
        [responseEvent]: (response: IpcResponse) => {
          CommandService.closeConnection();
          if (response?.success) resolve(response.data as T);
          else
            reject(
              new Error(
                typeof response?.error === 'string'
                  ? response.error
                  : ((response?.error as { message?: string } | undefined)?.message ?? `${channel} failed`)
              )
            );
        },
      });
    });
  }

  /** Reads Core's settings table (the same store Desktop's Settings page writes to). */
  private static async fetchCoreSettings(): Promise<Record<string, string>> {
    const settings = await CommandService.localRequest<Record<string, string> | null>(
      'settingsList',
      'onSettingsList',
      null
    ).catch(() => null);
    return settings ?? {};
  }

  /** A project by identifier or name (any case), with its assistant instructions. */
  private static async findProject(
    nameOrIdentifier: string
  ): Promise<{ identifier: string; name: string; instructions?: string | null } | undefined> {
    const projects =
      (await CommandService.localRequest<any[]>('projectList', 'onProjectList', null).catch(() => null)) ?? [];
    const wanted = nameOrIdentifier.trim().toLowerCase();
    const match =
      projects.find((p) => p.identifier === nameOrIdentifier) ?? projects.find((p) => p.name?.toLowerCase() === wanted);
    if (!match) return undefined;
    return CommandService.localRequest<any>('projectDetail', 'onProjectDetail', { identifier: match.identifier }).catch(
      () => undefined
    );
  }

  private static fetchApiToken(): Promise<string | undefined> {
    return CommandService.localRequest<string>('settingsGetApiToken', 'onSettingsGetApiToken', null).catch(
      () => undefined
    );
  }

  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------

  private static parseVars(pairs: string[] | undefined): Record<string, string> {
    const variables: Record<string, string> = {};
    for (const pair of pairs ?? []) {
      const eq = pair.indexOf('=');
      if (eq === -1) {
        Printer.printError(`Invalid --var format: "${pair}" (expected key=value)`);
        process.exit(1);
      }
      variables[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return variables;
  }
}

/** The defaults the form would start from, so the run gets the same values the user saw. */
function defaultValues(inputs: WorkflowInput[]): Record<string, unknown> {
  return Object.fromEntries(inputs.filter((i) => i.default !== undefined).map((i) => [i.name, i.default]));
}

/** Turns what was typed at the prompt into the input's type. */
function coerceInput(input: WorkflowInput, raw: string): unknown {
  const text = raw.trim();
  if (text === '') return '';
  switch (input.type) {
    case 'number':
      return Number.isNaN(Number(text)) ? text : Number(text);
    case 'boolean':
      return ['true', 'yes', 'y', '1'].includes(text.toLowerCase());
    case 'array':
    case 'object':
      try {
        return JSON.parse(text);
      } catch {
        return input.type === 'array' ? text.split(',').map((part) => part.trim()) : text;
      }
    default:
      return text;
  }
}

/** Mirrors HubTaskPreview in apps/core/src/hub/HubWorkflowCatalog.ts. */
export interface HubTaskPreview {
  name: string;
  description?: string;
  version: string;
  inputs: WorkflowInput[];
  missingPlugins: Array<{
    group: string;
    state: 'notInstalled' | 'disabled' | 'missing' | 'notLoaded';
    pluginName?: string;
    pluginIdentifier?: string;
    hubPlugin?: { hubId: string; hubName: string; identifier: string; name: string };
  }>;
  capabilities?: CapabilityReport;
}

/** Mirrors CapabilityReport in apps/core/src/engine/WorkflowCapabilities.ts. */
export interface CapabilityReport {
  capabilities: Array<{
    capability: string;
    review: boolean;
    steps: Array<{ action: string; label: string; workflow?: string }>;
  }>;
  unknownWorkflows: string[];
}

function describeMissingPlugin(plugin: HubTaskPreview['missingPlugins'][number]): string {
  const name = plugin.pluginName ?? plugin.hubPlugin?.name ?? plugin.group;
  switch (plugin.state) {
    case 'disabled':
      return `Needs ${name}, which is turned off. Turn it on with: tipeline plugin enable ${plugin.pluginIdentifier ?? plugin.group}`;
    case 'missing':
      return `Needs ${name}, but its folder can't be found.`;
    case 'notLoaded':
      return `Needs ${name}. It's installed but not loaded yet: restart Core (tipeline stop, then tipeline start).`;
    default:
      return plugin.hubPlugin
        ? `Needs ${name}. Install it, then turn it on: tipeline hub install plugin ${plugin.hubPlugin.hubId} ${plugin.hubPlugin.identifier}` +
            ` && tipeline plugin enable ${plugin.hubPlugin.identifier}`
        : `Needs ${name} (${plugin.group}), which isn't installed or on any of your hubs.`;
  }
}

/** What Core stores for a schedule read from words or a cron. */
function scheduleTiming(parsed: Extract<ReturnType<typeof parseSchedule>, { ok: true }>) {
  return parsed.kind === 'cron'
    ? { cron: parsed.cron }
    : parsed.kind === 'interval'
      ? { everySeconds: parsed.seconds }
      : { runAt: parsed.runAt.toISOString() };
}
