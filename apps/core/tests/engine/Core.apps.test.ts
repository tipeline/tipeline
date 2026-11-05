import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/AppService', () => ({
  AppService: { getByIdentifier: vi.fn(), updateSource: vi.fn(), install: vi.fn() },
}));

vi.mock('@database/services/TaskService', () => ({
  TaskService: { getByIdentifier: vi.fn() },
}));

vi.mock('@database/services/PipelineService', async (importOriginal) => {
  const actual: any = await importOriginal();
  actual.PipelineService.getByTaskIdentifiers = vi.fn();
  return actual;
});

import Core from '@engine/Core';
import { AppService } from '@database/services/AppService';
import { TaskService } from '@database/services/TaskService';
import { PipelineService } from '@database/services/PipelineService';

const appSource = {
  schemaVersion: 2,
  workflows: { approve: { identifier: 'task-approve' } },
  state: {},
  pages: [
    {
      id: 'queue',
      name: 'Queue',
      runnables: {
        approveInvoice: {
          mode: 'run',
          workflow: 'approve',
          inputs: { invoiceId: '{{ table1.selectedRow.id }}' },
          outputs: ['status'],
          persist: false,
        },
        recent: {
          mode: 'history',
          workflow: 'approve',
          source: 'variables',
          filter: { mode: 'range', count: 3 },
          variableName: 'status',
        },
      },
      components: [],
    },
  ],
};

function workflow(variables: any[]) {
  return {
    id: 1,
    identifier: 'task-approve',
    source: JSON.stringify({ pipeline: { variables, actions: [] } }),
  };
}

const run = (overrides: Record<string, unknown> = {}) =>
  Core.appRun(
    {
      appIdentifier: 'app-1',
      pageId: 'queue',
      runnable: 'approveInvoice',
      inputs: { invoiceId: 7 },
      ...overrides,
    } as any,
    'corr-1'
  );

describe('Core app runnables', () => {
  let execSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(AppService.getByIdentifier).mockResolvedValue({
      identifier: 'app-1',
      name: 'Invoices',
      source: JSON.stringify(appSource),
    } as any);
    vi.mocked(TaskService.getByIdentifier).mockResolvedValue(
      workflow([
        { name: 'invoiceId', type: 'number', visibility: 'public' },
        { name: 'status', type: 'string', visibility: 'protected' },
        { name: 'apiKey', type: 'string', visibility: 'public', secret: true },
        { name: 'internal', type: 'string' },
      ]) as any
    );
    execSpy = vi.spyOn(Core, 'exec').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    execSpy.mockRestore();
  });

  describe('appRun', () => {
    it('runs the aliased workflow with the stored outputs and persistence', async () => {
      await expect(run()).resolves.toEqual({ taskIdentifier: 'task-approve' });

      expect(execSpy).toHaveBeenCalledWith(
        'task-approve',
        'corr-1',
        { invoiceId: 7 },
        false,
        false,
        {
          ephemeral: true,
          outputs: ['status'],
          trigger: {
            type: 'app',
            appIdentifier: 'app-1',
            appName: 'Invoices',
            pageId: 'queue',
            runnable: 'approveInvoice',
          },
          cacheMode: 'use',
        }
      );
    });

    it('drops empty inputs for non-string variables so the workflow default applies', async () => {
      const source = structuredClone(appSource);
      (source.pages[0].runnables.approveInvoice as any).inputs = { invoiceId: '', note: '' };
      vi.mocked(AppService.getByIdentifier).mockResolvedValue({
        source: JSON.stringify(source),
      } as any);
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue(
        workflow([
          { name: 'invoiceId', type: 'number', visibility: 'public' },
          { name: 'note', type: 'string', visibility: 'public' },
          { name: 'status', type: 'string', visibility: 'public' },
        ]) as any
      );

      await run({ inputs: { invoiceId: '', note: '' } });

      expect(execSpy).toHaveBeenCalledWith(
        'task-approve',
        'corr-1',
        { note: '' },
        false,
        false,
        expect.anything()
      );
    });

    it('rejects inputs the runnable does not declare', async () => {
      await expect(run({ inputs: { status: 'x' } })).rejects.toThrow(
        'Input "status" is not declared on runnable "approveInvoice"'
      );
      expect(execSpy).not.toHaveBeenCalled();
    });

    it('rejects inputs targeting private variables (private is the default visibility)', async () => {
      vi.mocked(TaskService.getByIdentifier).mockResolvedValue(
        workflow([
          { name: 'invoiceId', type: 'number' },
          { name: 'status', type: 'string', visibility: 'public' },
        ]) as any
      );
      await expect(run()).rejects.toThrow(
        'Variable "invoiceId" is private and cannot be set by an app.'
      );
    });

    it('rejects private or secret outputs', async () => {
      const source = structuredClone(appSource);
      (source.pages[0].runnables.approveInvoice as any).outputs = ['apiKey'];
      vi.mocked(AppService.getByIdentifier).mockResolvedValue({
        source: JSON.stringify(source),
      } as any);
      await expect(run()).rejects.toThrow(
        'Variable "apiKey" is secret and cannot be read by an app.'
      );

      (source.pages[0].runnables.approveInvoice as any).outputs = ['internal'];
      vi.mocked(AppService.getByIdentifier).mockResolvedValue({
        source: JSON.stringify(source),
      } as any);
      await expect(run()).rejects.toThrow(
        'Variable "internal" is private and cannot be read by an app.'
      );
    });

    it('rejects unknown apps, pages, runnables, and history runnables', async () => {
      await expect(run({ pageId: 'nope' })).rejects.toThrow('Page "nope" not found in app');
      await expect(run({ runnable: 'nope' })).rejects.toThrow(
        'Runnable "nope" not found on page "queue"'
      );
      await expect(run({ runnable: 'recent', inputs: {} })).rejects.toThrow(
        "reads run history and can't be run"
      );
      vi.mocked(AppService.getByIdentifier).mockResolvedValue(undefined as any);
      await expect(run()).rejects.toThrow('App not found: app-1');
    });
  });

  describe('appHistoryFetch', () => {
    it('reads history with the stored source and filter', async () => {
      const fetchSpy = vi
        .spyOn(Core, 'tableDataFetch')
        .mockResolvedValue([{ name: 'status' }] as any);

      const rows = await Core.appHistoryFetch({
        appIdentifier: 'app-1',
        pageId: 'queue',
        runnable: 'recent',
      });

      expect(rows).toEqual([{ name: 'status' }]);
      expect(fetchSpy).toHaveBeenCalledWith({
        taskIdentifier: 'task-approve',
        sourceType: 'variables',
        filterMode: 'range',
        pipelineIdentifier: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        count: 3,
        actionIdentifier: undefined,
        variableName: 'status',
      });
      fetchSpy.mockRestore();
    });

    it('uses the filter values the app resolved instead of the saved ones', async () => {
      const fetchSpy = vi.spyOn(Core, 'tableDataFetch').mockResolvedValue([] as any);
      await Core.appHistoryFetch({
        appIdentifier: 'app-1',
        pageId: 'queue',
        runnable: 'recent',
        filter: { count: 10, dateFrom: '2026-10-01T06:00:00.000Z' },
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ filterMode: 'range', count: 10, dateFrom: '2026-10-01T06:00:00.000Z', variableName: 'status' })
      );
      fetchSpy.mockRestore();
    });

        it('refuses run-mode runnables', async () => {
      await expect(
        Core.appHistoryFetch({
          appIdentifier: 'app-1',
          pageId: 'queue',
          runnable: 'approveInvoice',
        })
      ).rejects.toThrow("doesn't read history");
    });
  });

  describe('appRunsList', () => {
    const row = (over: Record<string, unknown>) => ({
      identifier: 'p-1',
      status: 'completed',
      started_at: '2026-10-06T10:00:00Z',
      finished_at: '2026-10-06T10:00:05Z',
      metadata: { trigger: { type: 'app', appName: 'Invoices' } },
      task_name: 'Approve',
      task_identifier: 'task-approve',
      ...over,
    });

    it("lists runs of the app's workflows with their alias, trigger and failure message", async () => {
      vi.mocked(PipelineService.getByTaskIdentifiers).mockResolvedValue([
        row({ identifier: 'p-2', status: 'failed', metadata: JSON.stringify({ message: 'Boom', trigger: { type: 'app', appName: 'Invoices' } }) }),
        row({ metadata: null }),
      ] as any);
      const runs = await Core.appRunsList({ appIdentifier: 'app-1', statuses: ['failed', 'nonsense'], limit: 999 });
      expect(PipelineService.getByTaskIdentifiers).toHaveBeenCalledWith(['task-approve'], { statuses: ['failed'], limit: 200 });
      expect(runs[0]).toEqual({
        pipelineIdentifier: 'p-2',
        taskIdentifier: 'task-approve',
        workflow: 'approve',
        workflowName: 'Approve',
        status: 'failed',
        startedAt: '2026-10-06T10:00:00Z',
        finishedAt: '2026-10-06T10:00:05Z',
        trigger: { type: 'app', name: 'Invoices' },
        message: 'Boom',
      });
      expect(runs[1]).toMatchObject({ trigger: { type: null, name: null }, message: null });
    });

    it('omitted workflows means all of them; an empty list means none (never widened)', async () => {
      vi.mocked(PipelineService.getByTaskIdentifiers).mockResolvedValue([]);
      await Core.appRunsList({ appIdentifier: 'app-1', workflows: [] });
      expect(PipelineService.getByTaskIdentifiers).toHaveBeenLastCalledWith([], { statuses: [], limit: 20 });
      await Core.appRunsList({ appIdentifier: 'app-1', workflows: ['nope'] });
      expect(PipelineService.getByTaskIdentifiers).toHaveBeenLastCalledWith([], { statuses: [], limit: 20 });
    });
  });

  describe('historyFilter', () => {
    it('lays the sent values over the saved ones; empty clears, bad counts are dropped', () => {
      const saved = { dateFrom: '2026-01-01', dateTo: '2026-12-31', count: 5, pipelineIdentifier: 'p-1' };
      expect(Core.historyFilter(saved)).toEqual(saved);
      expect(Core.historyFilter(saved, { dateFrom: '2026-10-01', dateTo: '', count: 'lots' })).toEqual({
        dateFrom: '2026-10-01',
        dateTo: undefined,
        count: undefined,
        pipelineIdentifier: 'p-1',
      });
    });

    it('never filters by a binding nothing resolved (e.g. a direct call without filter)', () => {
      expect(
        Core.historyFilter({ dateFrom: '{= period.from =}', dateTo: '{{ period.to }}', count: '{= n =}' })
      ).toEqual({ dateFrom: undefined, dateTo: undefined, count: undefined, pipelineIdentifier: undefined });
    });
  });

  describe('appDetail', () => {
    it('returns stored v1 sources migrated to the current version', async () => {
      vi.mocked(AppService.getByIdentifier).mockResolvedValue({
        identifier: 'app-1',
        source: JSON.stringify({
          version: '1.0.0',
          pages: [{ id: 'home', name: 'Home', showInMenu: true, components: [] }],
          variables: [],
        }),
      } as any);

      const app: any = await Core.appDetail('app-1');

      expect(app.source_error).toBeNull();
      expect(JSON.parse(app.source).schemaVersion).toBe(4);
    });

    it('returns an unreadable source untouched with source_error set', async () => {
      vi.mocked(AppService.getByIdentifier).mockResolvedValue({
        identifier: 'app-1',
        source: '{"schemaVersion":9}',
      } as any);

      const app: any = await Core.appDetail('app-1');

      expect(app.source).toBe('{"schemaVersion":9}');
      expect(app.source_error).toBe('app.validationFailed\nunsupported schemaVersion 9');
    });
  });

  describe('appUpdateSource', () => {
    it('stores the validated, normalized source and refuses invalid ones', async () => {
      vi.mocked(AppService.updateSource).mockResolvedValue({} as any);

      await Core.appUpdateSource('app-1', JSON.stringify(appSource));
      const stored = JSON.parse(vi.mocked(AppService.updateSource).mock.calls[0][1] as string);
      expect(stored.pages[0].runnables.approveInvoice.onSuccess).toEqual([]);

      await expect(Core.appUpdateSource('app-1', { schemaVersion: 2, pages: [] })).rejects.toThrow(
        'app.validationFailed'
      );
    });
  });
});
