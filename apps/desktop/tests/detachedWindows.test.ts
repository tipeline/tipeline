// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

// ---- Electron main process: which pages may open, one window per page, close on switch
const created: any[] = [];
vi.mock('electron', () => {
  class BrowserWindow {
    destroyed = false;
    handlers: Record<string, () => void> = {};
    loadURL = vi.fn();
    loadFile = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    isMinimized = () => false;
    isDestroyed = () => this.destroyed;
    on = (event: string, fn: () => void) => (this.handlers[event] = fn);
    close = vi.fn(() => {
      this.destroyed = true;
      this.handlers.closed?.();
    });
    constructor(public opts: any) {
      created.push(this);
    }
  }
  return { BrowserWindow };
});

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn() }));

import * as Main from '../electron/main/DetachedWindows';
import {
  detachedWindowPath,
  isDetachedPath,
  windowPaths,
} from '@/utils/detachedWindows';
import { invokeCore } from '@/utils/invoke';
import { i18n } from '@/i18n';
import TaskHistoryDetailTab from '@/components/task/TaskHistoryDetailTab.vue';

describe('detached windows (main process)', () => {
  beforeEach(() => {
    created.length = 0;
    Main.closeDetachedWindows();
    created.length = 0;
    Main.initDetachedWindows({
      preload: '/p.mjs',
      indexHtml: '/dist/index.html',
      icon: '/i.ico',
    });
  });

  it('opens only the allowed pages, with the secure preload, passing the page as ?window=', () => {
    Main.openDetachedWindow('/window/runs/wf-1/p-9', 'Run p-9');
    expect(created).toHaveLength(1);
    expect(created[0].opts).toMatchObject({
      title: 'Run p-9',
      webPreferences: { preload: '/p.mjs' },
    });
    expect(created[0].opts.webPreferences.nodeIntegration).toBeUndefined();
    expect(created[0].loadFile).toHaveBeenCalledWith('/dist/index.html', {
      query: { window: '/window/runs/wf-1/p-9' },
    });

    for (const bad of [
      '/settings',
      '/tasks/wf-1/edit',
      '/window/apps/../settings',
      '/window/apps/a b',
      'javascript:alert(1)',
      42,
    ]) {
      expect(() => Main.openDetachedWindow(bad, '')).toThrow(
        'cannot open in its own window'
      );
    }
    expect(created).toHaveLength(1);
  });

  it('focuses the window already showing a page instead of opening another', () => {
    Main.openDetachedWindow('/window/runs/wf-1/p-1', 'A');
    Main.openDetachedWindow('/window/runs/wf-1/p-1', 'A');
    expect(created).toHaveLength(1);
    expect(created[0].focus).toHaveBeenCalledTimes(1);
  });

  it('closes every window on a workspace switch and says how many', () => {
    Main.openDetachedWindow('/window/apps/app-1', 'App');
    Main.openDetachedWindow('/window/runs/wf-1/p-1', 'Wf');
    expect(Main.closeDetachedWindows()).toBe(2);
    expect(created.every((w) => w.close.mock.calls.length === 1)).toBe(true);
    expect(Main.closeDetachedWindows()).toBe(0);
    // and a closed page can open again
    Main.openDetachedWindow('/window/apps/app-1', 'App');
    expect(created).toHaveLength(3);
  });
});

describe('detached windows (renderer)', () => {
  it('builds and recognizes the same pages', () => {
    expect(isDetachedPath(windowPaths.app('a1'))).toBe(true);
    expect(isDetachedPath(windowPaths.run('wf', 'p1'))).toBe(true);
    for (const path of [windowPaths.app('a1'), windowPaths.run('wf', 'p1')]) {
      expect(Main.isDetachedPath(path)).toBe(true);
    }
    expect(isDetachedPath('/approvals')).toBe(false);
    expect(isDetachedPath('/window/workflows/wf')).toBe(false);
  });

  it('reads the page from ?window= only when it is an allowed one', () => {
    window.history.replaceState(
      null,
      '',
      '/index.html?window=%2Fwindow%2Fruns%2Fwf-1%2Fp-1'
    );
    expect(detachedWindowPath()).toBe('/window/runs/wf-1/p-1');
    window.history.replaceState(null, '', '/index.html?window=%2Fsettings');
    expect(detachedWindowPath()).toBeNull();
    window.history.replaceState(null, '', '/index.html');
  });
});

// ---- Pages shown in a window
function routerAt(path: string, routes: any[]) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  return router.push(path).then(() => router);
}

describe('run detail', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invokeCore).mockReset();
    (window as any).ipcRenderer = {
      invoke: vi.fn(async () => null),
      on: vi.fn(),
      off: vi.fn(),
    };
  });

  const routes = [
    {
      path: '/tasks/:tid/pipelines/:pipelineId',
      name: 'PipelineDetail',
      component: TaskHistoryDetailTab,
    },
    {
      path: '/window/runs/:tid/:pipelineId',
      name: 'RunWindow',
      component: TaskHistoryDetailTab,
    },
  ];

  it('offers Open in window (and Back) in the main window only', async () => {
    const main = mount(TaskHistoryDetailTab, {
      global: {
        plugins: [i18n, await routerAt('/tasks/wf/pipelines/p-1', routes)],
      },
    });
    await flushPromises();
    expect(main.text()).toContain('Open in window');
    expect(main.text()).toContain('Back');

    await main
      .findAll('button')
      .find((b) => b.text() === 'Open in window')!
      .trigger('click');
    expect((window as any).ipcRenderer.invoke).toHaveBeenCalledWith(
      'openWindow',
      {
        path: '/window/runs/wf/p-1',
        title: 'Run p-1',
      }
    );

    const inWindow = mount(TaskHistoryDetailTab, {
      global: {
        plugins: [i18n, await routerAt('/window/runs/wf/p-1', routes)],
      },
    });
    await flushPromises();
    expect(inWindow.text()).not.toContain('Open in window');
    expect(inWindow.text()).not.toContain('Back');
  });
});

describe('Open in window from lists', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    (window as any).ipcRenderer = {
      invoke: vi.fn(async () => null),
      on: vi.fn(),
      off: vi.fn(),
    };
  });

  it("a workflow's runs list opens a run in its own window", async () => {
    const { createColumns } = await import('@/config/tables/TaskHistoryTab');
    const { ref } = await import('vue');
    const DataTable = (await import('@/components/DataTable.vue')).default;
    const router = await routerAt('/', [
      { path: '/', component: { template: '<div />' } },
    ]);
    const t = (key: string, params?: Record<string, unknown>) =>
      i18n.global.t(key, params ?? {});
    const table = mount(DataTable, {
      props: {
        columns: createColumns(
          t,
          router,
          'wf-1',
          () => {},
          ref(null),
          () => {},
          ref(null)
        ),
        data: [
          {
            identifier: 'p-7',
            status: 'completed',
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
          },
        ],
        hiddenColumns: ['status'],
      },
      global: { plugins: [i18n, router] },
    });

    await table.find('button[title="Open in window"]').trigger('click');
    expect((window as any).ipcRenderer.invoke).toHaveBeenCalledWith(
      'openWindow',
      { path: '/window/runs/wf-1/p-7', title: 'Run p-7' }
    );
  });

  it('the apps list opens an app in its own window', async () => {
    const AppListActions = (await import('@/components/app/AppListActions.vue'))
      .default;
    const router = await routerAt('/', [
      { path: '/', component: { template: '<div />' } },
    ]);
    const actions = mount(AppListActions, {
      props: {
        item: { identifier: 'app-1', name: 'Expenses' } as any,
        onDeleted: () => {},
      },
      global: { plugins: [i18n, router] },
    });

    await actions.find('button[title="Open in window"]').trigger('click');
    expect((window as any).ipcRenderer.invoke).toHaveBeenCalledWith(
      'openWindow',
      { path: '/window/apps/app-1', title: 'Expenses' }
    );
  });
});

describe('Open in window from the global Runs page', () => {
  beforeEach(() => {
    (window as any).ipcRenderer = {
      invoke: vi.fn(async () => null),
      on: vi.fn(),
      off: vi.fn(),
    };
  });

  it('opens the run, and offers nothing when the run has no known workflow', async () => {
    const { createColumns } = await import('@/config/tables/ActivityTable');
    const DataTable = (await import('@/components/DataTable.vue')).default;
    const router = await routerAt('/', [
      { path: '/', component: { template: '<div />' } },
    ]);
    const t = (key: string, params?: Record<string, unknown>) =>
      i18n.global.t(key, params ?? {});
    const now = new Date().toISOString();
    const table = mount(DataTable, {
      props: {
        columns: createColumns(t, router),
        data: [
          {
            identifier: 'p-1',
            status: 'completed',
            started_at: now,
            finished_at: now,
            task_identifier: 'wf-1',
            task_name: 'Pay',
          },
          {
            identifier: 'p-2',
            status: 'completed',
            started_at: now,
            finished_at: now,
          },
        ],
      },
      global: { plugins: [i18n, router] },
    });

    const buttons = table.findAll('button[title="Open in window"]');
    expect(buttons).toHaveLength(1);
    await buttons[0].trigger('click');
    expect((window as any).ipcRenderer.invoke).toHaveBeenCalledWith(
      'openWindow',
      { path: '/window/runs/wf-1/p-1', title: 'Run p-1' }
    );
  });
});
