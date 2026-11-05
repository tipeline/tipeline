import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

import axios from 'axios';
import { RemoteHubProvider, resolveHubBase } from '@/hub/RemoteHubProvider';

const get = vi.mocked(axios.get);
const hubAt = (target: string, token?: string) => ({ id: 'h1', name: 'Hub', type: 'remote', target, token }) as any;

describe('resolveHubBase', () => {
  it.each([
    ['https://hub.example.com/', 'https://hub.example.com'],
    ['https://github.com/acme/hub', 'https://raw.githubusercontent.com/acme/hub/HEAD'],
    ['https://github.com/acme/hub/', 'https://raw.githubusercontent.com/acme/hub/HEAD'],
    ['https://github.com/acme/hub.git', 'https://raw.githubusercontent.com/acme/hub/HEAD'],
    ['https://www.github.com/acme/hub', 'https://raw.githubusercontent.com/acme/hub/HEAD'],
    ['https://github.com/acme/hub/tree/v2', 'https://raw.githubusercontent.com/acme/hub/v2'],
    ['https://github.com/acme/hub/tree/main/catalog', 'https://raw.githubusercontent.com/acme/hub/main/catalog'],
    ['https://raw.githubusercontent.com/acme/hub/main', 'https://raw.githubusercontent.com/acme/hub/main'],
  ])('%s → %s', (target, base) => {
    expect(resolveHubBase(target)).toBe(base);
  });
});

describe('RemoteHubProvider', () => {
  const provider = new RemoteHubProvider();
  const tmpDirs: string[] = [];

  beforeEach(() => get.mockReset());
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the catalog of a GitHub repo from its default branch, without a token', async () => {
    get.mockResolvedValueOnce({ data: { items: [] } } as any);
    await provider.fetchCatalog(hubAt('https://github.com/acme/hub'));
    expect(get).toHaveBeenCalledWith('https://raw.githubusercontent.com/acme/hub/HEAD/hub.json', {});
  });

  it('sends the token as a Bearer header to the hub host', async () => {
    get.mockResolvedValueOnce({ data: { items: [] } } as any);
    await provider.fetchCatalog(hubAt('https://github.com/acme/hub', 'secret'));
    expect(get).toHaveBeenCalledWith('https://raw.githubusercontent.com/acme/hub/HEAD/hub.json', {
      headers: { Authorization: 'Bearer secret' },
    });
  });

  it('turns a relative image into an absolute URL when there is no token', async () => {
    get.mockResolvedValueOnce({
      data: { items: [{ identifier: 'a', image: 'images/a.png' }, { identifier: 'b', image: 'https://cdn.example.com/b.png' }] },
    } as any);
    const items = await provider.fetchCatalog(hubAt('https://hub.example.com'));
    expect(items.map((i) => i.image)).toEqual([
      'https://hub.example.com/images/a.png',
      'https://cdn.example.com/b.png',
    ]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('inlines a hub-hosted image with the token, but leaves other hosts alone', async () => {
    get.mockImplementation(async (...args: any[]) => {
      const url = String(args[0]);
      if (url.endsWith('hub.json')) {
        return { data: { items: [{ identifier: 'a', image: 'images/a.png' }, { identifier: 'b', image: 'https://cdn.example.com/b.png' }] } };
      }
      return { data: Buffer.from('png-bytes'), headers: { 'content-type': 'image/png' } };
    });
    const items = await provider.fetchCatalog(hubAt('https://github.com/acme/hub', 'secret'));
    expect(items[0].image).toBe(`data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`);
    expect(items[1].image).toBe('https://cdn.example.com/b.png');
    expect(get).toHaveBeenCalledWith('https://raw.githubusercontent.com/acme/hub/HEAD/images/a.png', {
      headers: { Authorization: 'Bearer secret' },
      responseType: 'arraybuffer',
    });
  });

  it('drops an image it cannot load with the token instead of failing the catalog', async () => {
    get.mockImplementation(async (...args: any[]) => {
      const url = String(args[0]);
      if (url.endsWith('.png')) throw new Error('404');
      return { data: { items: [{ identifier: 'a', image: 'images/a.png' }] } };
    });
    const items = await provider.fetchCatalog(hubAt('https://hub.example.com', 'secret'));
    expect(items[0].image).toBeUndefined();
  });

  it('downloads item files with the token only from the hub host', async () => {
    get.mockImplementation(async () => ({ data: Readable.from([Buffer.from('x')]) }) as any);
    const hub = hubAt('https://github.com/acme/hub', 'secret');

    const own = await provider.fetchFile(hub, { type: 'task', identifier: 'a', name: 'A', version: '1', file: 'workflows/a.yml' });
    const other = await provider.fetchFile(hub, {
      type: 'task',
      identifier: 'b',
      name: 'B',
      version: '1',
      file: 'https://elsewhere.example.com/b.yml',
    });
    tmpDirs.push(path.dirname(own), path.dirname(other));

    expect(get).toHaveBeenNthCalledWith(1, 'https://raw.githubusercontent.com/acme/hub/HEAD/workflows/a.yml', {
      responseType: 'stream',
      headers: { Authorization: 'Bearer secret' },
    });
    expect(get).toHaveBeenNthCalledWith(2, 'https://elsewhere.example.com/b.yml', { responseType: 'stream' });
  });
});
