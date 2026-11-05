import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pluginsHome } = vi.hoisted(() => ({
  pluginsHome: `${process.env.TMPDIR ?? '/tmp'}/tipeline-reload-${process.pid}`,
}));

vi.mock('os', async (original) => {
  const actual = await original<typeof import('os')>();
  return { ...actual, default: { ...actual, homedir: () => pluginsHome } };
});
vi.mock('@database/services/PluginService', () => ({
  PluginService: {
    getByGroup: vi.fn(async () => undefined),
    registerOrUpdate: vi.fn(),
    getAll: vi.fn(async () => []),
    markMissingByGroups: vi.fn(),
  },
}));

import { PluginLoader, PLUGINS_DIR, PLUGIN_STAGING_DIR } from '@/plugin/PluginLoader';
import { PluginService } from '@database/services/PluginService';

const pluginCode = (version: string) =>
  `export default { group: 'greeting', version: '${version}', actions: {} };\n`;

const write = (dir: string, version: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.mjs'), pluginCode(version));
};

beforeEach(() => {
  vi.clearAllMocks();
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
});
afterEach(() => fs.rmSync(pluginsHome, { recursive: true, force: true }));

describe('PluginLoader', () => {
  it('sees the new code when a plugin is replaced at the same path', async () => {
    const dir = path.join(PLUGINS_DIR, 'greeting');
    write(dir, '1.0.0');
    await PluginLoader.reloadSingle(dir);
    write(dir, '1.1.0');
    await PluginLoader.reloadSingle(dir);

    const versions = vi.mocked(PluginService.registerOrUpdate).mock.calls.map(([data]) => data.version);
    expect(versions).toEqual(['1.0.0', '1.1.0']);
  });

  it('reads a package without registering it', async () => {
    const dir = path.join(PLUGINS_DIR, PLUGIN_STAGING_DIR, 'greeting-1');
    write(dir, '2.0.0');
    expect(await PluginLoader.inspect(dir)).toEqual({ group: 'greeting', version: '2.0.0' });
    expect(PluginService.registerOrUpdate).not.toHaveBeenCalled();
  });

  it('never scans the staging folder', async () => {
    write(path.join(PLUGINS_DIR, PLUGIN_STAGING_DIR), '2.0.0');
    await PluginLoader.load();
    expect(PluginService.registerOrUpdate).not.toHaveBeenCalled();
  });
});
