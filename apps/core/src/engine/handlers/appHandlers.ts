import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import { TaskStreamListener } from '@engine/TaskStreamListener';
import { coreEvents } from '@engine/CoreEvents';
import { ActiveAppRuns } from '@engine/ActiveAppRuns';
import { ActionError } from '@utils/ActionError';
import type { ITransport } from '@engine/ITransport';

type BroadcastFn = (event: string, data: any) => void;

export const registerAppHandlers = (transport: ITransport, broadcast: BroadcastFn) => {
  transport.on('appNew', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appNew(message.payload.data);
      transport.emit(client, 'onAppNew', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppNew', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appList();
      transport.emit(client, 'onAppList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appDetail', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appDetail(message.payload.identifier);
      transport.emit(client, 'onAppDetail', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppDetail', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appUpdateSource', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appUpdateSource(message.payload.identifier, message.payload.source);
      transport.emit(client, 'onAppUpdateSource', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppUpdateSource', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appUpdateMeta', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { identifier, ...data } = message.payload;
      const result = await Core.appUpdateMeta(identifier, data);
      transport.emit(client, 'onAppUpdateMeta', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppUpdateMeta', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appUploadImage', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appUploadImage(message.payload.identifier, message.payload.dataUrl);
      transport.emit(client, 'onAppUploadImage', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppUploadImage', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appExport', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appExport(message.payload.targetPath, message.payload.identifiers);
      transport.emit(client, 'onAppExport', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppExport', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appUninstall', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appUninstall(message.payload.identifier);
      transport.emit(client, 'onAppUninstall', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppUninstall', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appInstall', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appInstall(message.payload);
      transport.emit(client, 'onAppInstall', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppInstall', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('tableDataFetch', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.tableDataFetch(message.payload);
      transport.emit(client, 'onTableDataFetch', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTableDataFetch', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('appHistoryFetch', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.appHistoryFetch(message.payload);
      transport.emit(client, 'onAppHistoryFetch', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAppHistoryFetch', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  // Streams like `exec` (same onTaskStart/onAction/... events on the correlationId),
  // but the closing onTaskEndAll carries the run's outputs. Only the top-level run
  // reports `outputs` on taskEnd (sub-workflows never have requested outputs), which
  // is how its taskEnd is told apart from any child's.
  //
  // While it runs, the run is listed in ActiveAppRuns, and its first onTaskStart (the
  // top-level workflow's — children start later) names the app, page and runnable, so
  // other windows showing that page can follow the run.
  transport.on('appRun', async (message: any, client: any) => {
    if (!client) return;
    const correlationId = message.correlationId;
    const app = {
      appIdentifier: String(message.payload?.appIdentifier ?? ''),
      pageId: String(message.payload?.pageId ?? ''),
      runnable: String(message.payload?.runnable ?? ''),
    };
    const active = ActiveAppRuns.add({ correlationId, ...app, startedAt: Date.now() });
    const listener = new TaskStreamListener(correlationId, (event, msg) => {
      if (event === 'onTaskStart' && !active.pipelineIdentifier) {
        active.pipelineIdentifier = msg.data?.pipelineIdentifier ?? '';
        msg = IPCMessage.success({ ...msg.data, app }, correlationId);
      } else if (event === 'onAction') {
        active.steps++;
        active.lastStep = msg.data?.name ?? '';
      }
      broadcast(event, msg);
    });
    listener.bind();
    let finished: {
      pipelineIdentifier?: string;
      outputs?: Record<string, unknown>;
      status?: string;
      cachedAt?: string;
    } = {};
    const onTaskEnd = (data: any) => {
      if (data && data.outputs !== undefined) {
        finished = {
          pipelineIdentifier: data.pipelineIdentifier,
          outputs: data.outputs,
          status: data.status,
          ...(data.cached ? { cachedAt: data.cachedAt } : {}),
        };
      }
    };
    coreEvents.on(`taskEnd:${correlationId}`, onTaskEnd);
    try {
      const { taskIdentifier } = await Core.appRun(message.payload, correlationId);
      broadcast(
        'onTaskEndAll',
        IPCMessage.success(
          {
            taskIdentifier,
            pipelineIdentifier: finished.pipelineIdentifier ?? '',
            outputs: finished.outputs ?? {},
            // 'paused' when the workflow stopped at an approval step and will resume later;
            // 'canceled' when someone canceled it (or an approval was rejected).
            status:
              finished.status === 'paused' || finished.status === 'canceled'
                ? finished.status
                : 'completed',
            // Answered from the workflow cache: when those outputs were produced.
            ...(finished.cachedAt ? { cached: true, cachedAt: finished.cachedAt } : {}),
          },
          correlationId
        )
      );
    } catch (error: any) {
      broadcast(
        'onTaskError',
        IPCMessage.failure(
          error instanceof ActionError ? error.toData() : (error.message ?? String(error)),
          correlationId
        )
      );
    } finally {
      coreEvents.off(`taskEnd:${correlationId}`, onTaskEnd);
      listener.unbind();
      ActiveAppRuns.remove(correlationId);
    }
  });

  // Approvals: workflow-wide (run history) and app-scoped (Approvals component).
  const query = (event: string, run: (payload: any) => Promise<unknown>) => {
    const responseEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    transport.on(event, async (message: any, client: any) => {
      if (!client) return;
      try {
        transport.emit(client, responseEvent, IPCMessage.success(await run(message.payload ?? {}), message.correlationId));
      } catch (error: any) {
        transport.emit(client, responseEvent, IPCMessage.failure(error.message, message.correlationId));
      }
    });
  };
  query('approvalList', (p) => Core.approvalList(p.taskIdentifiers));
  query('approvalDecide', (p) => Core.approvalDecide(p));
  query('approvalHistory', (p) => Core.approvalHistory(p));
  query('appApprovalList', (p) => Core.appApprovalList(p));
  query('appApprovalDecide', (p) => Core.appApprovalDecide(p));
  query('appRunsList', (p) => Core.appRunsList(p));
  query('appRunsActive', async (p) =>
    ActiveAppRuns.list({ appIdentifier: String(p.appIdentifier ?? ''), pageId: p.pageId })
  );
};
