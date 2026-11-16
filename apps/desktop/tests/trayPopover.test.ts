import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), quit: vi.fn() },
  BrowserWindow: class {},
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false },
  nativeImage: { createEmpty: vi.fn() },
  Notification: class {},
  screen: {},
  Tray: class {},
}));

import { cleanTrayState, isAppPath, popoverPosition } from '../electron/main/TrayPopover';
import { renderTrayIconBitmap } from '../electron/main/trayIcon';
import { readTraySettings, writeTraySettings } from '../electron/main/traySettings';
import { firstOf, nextScheduled, NEEDS_LIMIT, RUNNING_LIMIT, trayNeeds } from '@/tray/trayItems';

const workArea = { x: 0, y: 25, width: 1440, height: 875 };
const size = { width: 360, height: 400 };

describe('popover position', () => {
  it('sits centred under a menu bar icon (macOS)', () => {
    // The menu bar is the icon's height (25): the popover starts just under it.
    expect(popoverPosition({ x: 1200, y: 0, width: 24, height: 25 }, size, workArea)).toEqual({ x: 1032, y: 31 });
  });

  it('stays inside the screen when the icon is near its edge', () => {
    expect(popoverPosition({ x: 1420, y: 0, width: 20, height: 24 }, size, workArea).x).toBe(1440 - 360 - 6);
  });

  it('opens above an icon at the bottom of the screen (Windows taskbar)', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1032 };
    expect(popoverPosition({ x: 1700, y: 1040, width: 24, height: 40 }, size, area)).toEqual({
      x: 1532,
      y: 1032 - 400 - 6,
    });
  });

  it('goes to the top right corner when the tray does not say where its icon is', () => {
    expect(popoverPosition({ x: 0, y: 0, width: 0, height: 0 }, size, workArea)).toEqual({ x: 1074, y: 31 });
  });
});

describe('tray state from the popover page', () => {
  it('keeps only paths inside the app', () => {
    expect(isAppPath('/approvals')).toBe(true);
    expect(isAppPath('/tasks/a/pipelines/b')).toBe(true);
    expect(isAppPath('/activity?status=running')).toBe(true);
    expect(isAppPath('https://example.com')).toBe(false);
    expect(isAppPath('//example.com')).toBe(false);
    expect(isAppPath('/a b')).toBe(false);
    expect(isAppPath(42)).toBe(false);
  });

  it('cleans what it is sent: bad entries dropped, missing labels in English, count bounded', () => {
    const state = cleanTrayState({
      count: 4.7,
      needs: [{ label: 'Alert: Spike', path: '/tasks/t' }, { label: 'x', path: 'file:///etc' }, null],
      labels: { open: 'Abrir Tipeline', quit: 42 },
    });
    expect(state.count).toBe(4);
    expect(state.needs).toEqual([{ label: 'Alert: Spike', path: '/tasks/t' }]);
    expect(state.labels.open).toBe('Abrir Tipeline');
    expect(state.labels.quit).toBe('Quit Tipeline');
    expect(cleanTrayState({ count: -3 }).count).toBe(0);
    expect(cleanTrayState(null).needs).toEqual([]);
  });
});

describe('tray icon', () => {
  const alphaAt = (buffer: Buffer, size: number, x: number, y: number) => buffer[(y * size + x) * 4 + 3];

  it('draws the three bars, transparent around them', () => {
    const size = 32;
    const bitmap = renderTrayIconBitmap(size, { color: [0, 0, 0] });
    expect(bitmap.length).toBe(size * size * 4);
    expect(alphaAt(bitmap, size, 16, 6)).toBe(255); // top bar
    expect(alphaAt(bitmap, size, 2, 28)).toBe(0); // left of the short bottom bar
  });

  it('adds a red dot at the top right when asked', () => {
    const size = 32;
    const plain = renderTrayIconBitmap(size, { color: [240, 240, 240] });
    const dotted = renderTrayIconBitmap(size, { color: [240, 240, 240], dot: true });
    const i = (5 * size + 26) * 4;
    expect(dotted[i + 2]).toBeGreaterThan(200); // red (BGRA)
    expect(dotted[i + 1]).toBeLessThan(80);
    expect(plain[i + 2]).not.toBe(dotted[i + 2]);
  });
});

describe('tray settings', () => {
  let dir = '';
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps running by default, and remembers a change', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tray-'));
    expect(readTraySettings(dir)).toEqual({ keepRunning: true, hintShown: false });
    writeTraySettings(dir, { keepRunning: false, hintShown: true });
    expect(readTraySettings(dir)).toEqual({ keepRunning: false, hintShown: true });
  });
});

describe('what the popover lists', () => {
  const alert = (id: string, level: 'info' | 'warning' | 'critical', at: string) => ({
    id,
    taskIdentifier: 'report',
    workflowName: 'Traffic report',
    pipelineIdentifier: 'run1',
    key: id,
    title: `Alert ${id}`,
    message: null,
    level,
    status: 'open' as const,
    count: 1,
    firstRaisedAt: at,
    lastRaisedAt: at,
    closedAt: null,
    closedBy: null,
  });
  const approval = {
    pipelineIdentifier: 'p1',
    taskIdentifier: 'pay',
    workflowName: 'Pay vendors',
    title: 'Vendor payment',
    details: null,
    requestedAt: '2026-11-14T08:00:00Z',
  };
  const failed = {
    identifier: 'backup',
    name: 'Nightly DB backup',
    last_run_status: 'failed',
    last_run_at: '2026-11-14T09:00:00Z',
    last_run_identifier: 'r9',
  } as any;
  const missed = { scheduleIdentifier: 's1', taskIdentifier: 'crm', taskName: 'Sync CRM', missedAt: '2026-11-14T09:30:00Z' } as any;

  it('puts the most urgent first, then the newest', () => {
    const needs = trayNeeds({
      approvals: [approval],
      alerts: [alert('info', 'info', '2026-11-14T10:00:00Z'), alert('warn', 'warning', '2026-11-14T10:00:00Z'), alert('crit', 'critical', '2026-11-14T07:00:00Z')],
      failing: [failed],
      missed: [missed],
    });
    expect(needs.map((n) => n.key)).toEqual([
      'alert:crit',
      'approval:p1',
      'failed:backup',
      'alert:warn',
      'missed:s1',
      'alert:info',
    ]);
  });

  it('links each to where it can be dealt with', () => {
    const [crit, appr, fail, , miss] = trayNeeds({
      approvals: [approval],
      alerts: [alert('crit', 'critical', '2026-11-14T07:00:00Z'), alert('w', 'warning', '2026-11-14T07:00:00Z')],
      failing: [failed],
      missed: [missed],
    });
    expect(crit.path).toBe('/tasks/report/pipelines/run1');
    expect(appr.path).toBe('/approvals');
    expect(fail.path).toBe('/tasks/backup/pipelines/r9');
    expect(miss.path).toBe('/tasks/crm');
  });

  it('shows 4 needs and 3 runs, and counts the rest', () => {
    expect(NEEDS_LIMIT).toBe(4);
    expect(RUNNING_LIMIT).toBe(3);
    expect(firstOf([1, 2, 3, 4, 5, 6], NEEDS_LIMIT)).toEqual({ shown: [1, 2, 3, 4], more: 2 });
    expect(firstOf([1, 2], RUNNING_LIMIT)).toEqual({ shown: [1, 2], more: 0 });
  });

  it('names the next enabled schedule', () => {
    const next = nextScheduled([
      { enabled: true, nextRunAt: '2026-11-15T02:00:00Z', taskName: 'Backup' },
      { enabled: false, nextRunAt: '2026-11-14T11:00:00Z', taskName: 'Paused' },
      { enabled: true, nextRunAt: '2026-11-14T12:00:00Z', taskName: 'Uptime' },
    ] as any);
    expect(next?.taskName).toBe('Uptime');
  });
});

describe('changes other windows hear about', () => {
  it('names only real channels, and the ones that change Needs you', async () => {
    vi.doMock('../electron/main/utils/WsClient', () => ({ WsClient: class {} }));
    vi.doMock('../electron/main/utils/CoreService', () => ({ CoreService: {} }));
    vi.doMock('../electron/main/utils/CoreClientProxy', () => ({ CoreClientProxy: {} }));
    vi.doMock('../electron/main/DetachedWindows', () => ({ closeDetachedWindows: vi.fn() }));
    const { NEEDS_YOU_CHANGES } = await import('../electron/main/MessageManager');
    const { SEND } = await import('../electron/main/utils/ipc-channels');
    const known = new Set(Object.values(SEND));
    expect([...NEEDS_YOU_CHANGES].every((channel) => typeof channel === 'string' && known.has(channel as any))).toBe(true);
    for (const channel of [SEND.TASK_UNINSTALL, SEND.APPROVAL_DECIDE, SEND.ALERT_DISMISS, SEND.TRASH_RESTORE, SEND.PIPELINE_CANCEL]) {
      expect(NEEDS_YOU_CHANGES.has(channel)).toBe(true);
    }
    expect(NEEDS_YOU_CHANGES.has(SEND.TASK_LIST)).toBe(false);
  });
});

