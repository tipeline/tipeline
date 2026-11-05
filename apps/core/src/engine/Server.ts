#!/usr/bin/env node

import { logSync } from './Logger';
import './CoreLock';
import { newerDatabaseMarker } from '@tipeline/utils/coreProcess';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ipc from 'node-ipc';
import { initializeDatabase } from '@database/initDatabase';
import { SettingsService } from '@database/services/SettingsService';
import { IpcTransport } from '@engine/IpcTransport';
import { WebSocketTransport } from '@engine/WebSocketTransport';
import { TipelineMcpServer } from '@engine/McpServer';
import type { ITransport } from '@engine/ITransport';
import { registerTaskHandlers } from './handlers/taskHandlers';
import { registerVariableHandlers } from './handlers/variableHandlers';
import { registerTagHandlers } from './handlers/tagHandlers';
import { registerPipelineHandlers } from './handlers/pipelineHandlers';
import { registerSystemHandlers, type ShutdownFn } from './handlers/systemHandlers';
import { registerAppHandlers } from './handlers/appHandlers';
import { registerScheduleHandlers } from './handlers/scheduleHandlers';
import { registerConnectionHandlers } from './handlers/connectionHandlers';
import { registerSettingsHandlers } from './handlers/settingsHandlers';
import { registerPluginHandlers } from './handlers/pluginHandlers';
import { registerProjectHandlers } from './handlers/projectHandlers';
import { registerAgentHandlers } from './handlers/agentHandlers';
import { registerBackupHandlers } from './handlers/backupHandlers';
import { registerHubHandlers } from './handlers/hubHandlers';
import { registerCacheHandlers } from './handlers/cacheHandlers';
import { registerTrashHandlers } from './handlers/trashHandlers';
import { initJobRunner } from '@engine/runner/JobRunnerFactory';
import { SleepWatchdog } from '@engine/SleepWatchdog';
import { PluginLoader } from '@/plugin/PluginLoader';
import { AppSettings } from '@engine/AppSettings';
import { HubPoller } from '@engine/HubPoller';
import { CacheSweeper } from '@engine/CacheSweeper';
import { RunHistoryPurger } from '@engine/RunHistoryPurger';
import { DatabaseManager } from '@database/DatabaseManager';
import { DatabaseNewerThanCoreError } from '@database/newerDatabase';
import { TrashPurger } from '@engine/TrashPurger';
import { ApprovalTimeoutService } from '@engine/ApprovalTimeoutService';
import Core from '@engine/Core';
import { sealExistingSecrets } from '@database/services/SecretSweep';

const WS_PORT = parseInt(process.env.TIPELINE_WS_PORT ?? '4000', 10);
const MCP_PORT = parseInt(process.env.TIPELINE_MCP_PORT ?? '4002', 10);
// This machine only, unless someone asks for more: both ports accept Core's full-access token.
const BIND_HOST = process.env.TIPELINE_BIND_HOST || '127.0.0.1';

// Same directory as the SQLite DB (~/Tipeline/.database) — CLI, Desktop, and apps/server
// all read the token from this fixed path rather than over IPC itself.
function tokenFilePath(): string {
  return path.join(os.homedir(), 'Tipeline', '.database', 'core.token');
}

function writeTokenFile(token: string): void {
  const dir = path.dirname(tokenFilePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tokenFilePath(), token, { mode: 0o600 });
  try {
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(tokenFilePath(), 0o600);
  } catch {
    // best-effort hardening — platforms without POSIX permissions (e.g. Windows) ignore this
  }
}

function registerHandlers(transport: ITransport, broadcast: (e: string, d: any) => void, shutdown: ShutdownFn) {
  registerTaskHandlers(transport, broadcast);
  registerPipelineHandlers(transport, broadcast);
  registerVariableHandlers(transport);
  registerTagHandlers(transport);
  registerAppHandlers(transport, broadcast);
  registerScheduleHandlers(transport);
  registerSystemHandlers(transport, shutdown);
  registerConnectionHandlers(transport);
  registerSettingsHandlers(transport);
  registerPluginHandlers(transport);
  registerProjectHandlers(transport);
  registerAgentHandlers(transport);
  registerBackupHandlers(transport);
  registerHubHandlers(transport);
  registerCacheHandlers(transport);
  registerTrashHandlers(transport);
}

// After an uncaught error Core's state can't be trusted, so it stops instead of carrying
// on half-working. Unhandled rejections arrive here too, with their own origin.
process.on('uncaughtException', (err: Error, origin: string) => {
  logSync('ERROR', `Fatal ${origin}:`, err?.stack ?? err);
  process.exit(1);
});

(async () => {
  try {
    await initializeDatabase();
    fs.rmSync(newerDatabaseMarker(), { force: true });
    await sealExistingSecrets().catch((err) => logSync('ERROR', 'Could not seal existing secrets:', err));
    await DatabaseManager.enableAutoVacuum();
    await Core.init();
    const tz = await SettingsService.get('timezone');
    if (tz) AppSettings.timezone = tz;
    await PluginLoader.load();

    const runner = initJobRunner();
    await runner.start();

    const sleepWatchdog = new SleepWatchdog(runner);
    sleepWatchdog.start();

    HubPoller.start();
    ApprovalTimeoutService.start();
    CacheSweeper.start();
    TrashPurger.start();
    RunHistoryPurger.start();

    // -----------------------------------------------------------------------
    // API token — written to a file so CLI/Desktop/Server can read it directly instead of
    // fetching it over IPC itself (which would require the IPC transport to stay
    // unauthenticated for that one call, defeating the point of authenticating it at all).
    // Never logged: logs get copied around and pasted into bug reports.
    // -----------------------------------------------------------------------
    const token = await SettingsService.getOrCreateToken();
    writeTokenFile(token);
    console.log(`Tipeline Core API token saved in ${tokenFilePath()}`);

    // -----------------------------------------------------------------------
    // Transports
    // -----------------------------------------------------------------------
    const wsTransport = new WebSocketTransport(WS_PORT, token, BIND_HOST);

    ipc.config.id = 'tipeline_core';
    ipc.config.silent = true;
    if (process.env.TIPELINE_IPC_SOCKET_ROOT) {
      ipc.config.socketRoot = process.env.TIPELINE_IPC_SOCKET_ROOT;
    }
    const ipcTransport = new IpcTransport(ipc, token);

    const allTransports: ITransport[] = [ipcTransport, wsTransport];

    function globalBroadcast(event: string, data: any) {
      for (const t of allTransports) {
        t.broadcast(event, data);
      }
    }

    runner.setBroadcast?.(globalBroadcast);
    Core.setBroadcast(globalBroadcast);

    const mcpServer = new TipelineMcpServer(MCP_PORT, token, globalBroadcast, BIND_HOST);

    let shuttingDown = false;
    async function shutdown(options: { interrupt?: boolean } = {}) {
      // Already waiting for runs to finish: being told to interrupt them still counts.
      if (shuttingDown) {
        if (options.interrupt) await runner.stop(options);
        return;
      }
      shuttingDown = true;
      sleepWatchdog.stop();
      HubPoller.stop();
      ApprovalTimeoutService.stop();
      CacheSweeper.stop();
      TrashPurger.stop();
      RunHistoryPurger.stop();
      await runner.stop(options);
      for (const t of allTransports) {
        t.stop();
      }
      mcpServer.stop();
      await Core.stop();
      process.exit(0);
    }

    // WebSocket handlers registered immediately (WS server is already listening)
    registerHandlers(wsTransport, globalBroadcast, shutdown);

    // IPC handlers must be registered inside ipc.serve() callback — node-ipc only creates
    // ipc.server once serve() runs, so attach() (which touches ipc.server) can't happen
    // any earlier either.
    ipc.serve(() => {
      ipcTransport.attach();
      registerHandlers(ipcTransport, globalBroadcast, shutdown);
    });

    ipc.server.start();
    console.log('Tipeline Core started');

    // A signal can't wait for an answer, and the system may follow it with a hard kill.
    const interruptAndExit = () => shutdown({ interrupt: true });
    process.on('SIGTERM', interruptAndExit);
    process.on('SIGINT', interruptAndExit);
    process.on('SIGHUP', interruptAndExit);
  } catch (err) {
    // Exiting cleanly keeps the auto-start service from retrying: only an update can fix this.
    if (err instanceof DatabaseNewerThanCoreError) {
      logSync('ERROR', err.message);
      fs.writeFileSync(newerDatabaseMarker(), err.message);
      process.exit(0);
    }
    logSync('ERROR', 'Failed to initialize Tipeline Core:', err);
    process.exit(1);
  }
})();
