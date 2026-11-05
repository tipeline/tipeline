import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({
  axiosRequestMock: vi.fn(),
  axiosGetMock: vi.fn(),
  existsSyncMock: vi.fn(),
  lstatSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  createWriteStreamMock: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    request: mocks.axiosRequestMock,
    get: mocks.axiosGetMock,
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mocks.existsSyncMock,
    lstatSync: mocks.lstatSyncMock,
    mkdirSync: mocks.mkdirSyncMock,
    createWriteStream: mocks.createWriteStreamMock,
  },
}));

import { GroupHTTP } from '@/action/actions/http/actions';

const {
  axiosRequestMock,
  axiosGetMock,
  existsSyncMock,
  lstatSyncMock,
  mkdirSyncMock,
  createWriteStreamMock,
} = mocks;

describe('GroupHTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('request', () => {
    it('builds a default GET config and returns status, headers and data', async () => {
      axiosRequestMock.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { id: 1 },
      });
      const result = await GroupHTTP.request({ url: 'https://api.example.com/items/1' } as any);

      expect(axiosRequestMock).toHaveBeenCalledWith({
        url: 'https://api.example.com/items/1',
        method: 'get',
        baseURL: undefined,
        headers: undefined,
        params: undefined,
        data: undefined,
        timeout: 0,
        withCredentials: false,
        auth: undefined,
        responseType: 'json',
        responseEncoding: 'utf8',
        lookup: expect.any(Function),
      });
      expect(result).toEqual({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { id: 1 },
      });
    });

    it('forwards all optional options to axios', async () => {
      axiosRequestMock.mockResolvedValue({ data: 'ok' });
      await GroupHTTP.request({
        url: 'https://api.example.com/items',
        method: 'post',
        baseURL: 'https://api.example.com',
        headers: { Authorization: 'Bearer token' },
        params: { verbose: true },
        data: { name: 'test' },
        timeout: 5000,
        withCredentials: true,
        auth: { username: 'u', password: 'p' },
        responseType: 'text',
        responseEncoding: 'ascii',
      } as any);

      expect(axiosRequestMock).toHaveBeenCalledWith({
        url: 'https://api.example.com/items',
        method: 'post',
        baseURL: 'https://api.example.com',
        headers: { Authorization: 'Bearer token' },
        params: { verbose: true },
        data: { name: 'test' },
        timeout: 5000,
        withCredentials: true,
        auth: { username: 'u', password: 'p' },
        responseType: 'text',
        responseEncoding: 'ascii',
        lookup: expect.any(Function),
      });
    });

    it('propagates a rejection from axios', async () => {
      axiosRequestMock.mockRejectedValue(new Error('Network Error'));
      await expect(GroupHTTP.request({ url: 'https://api.example.com' } as any)).rejects.toThrow(
        'Network Error'
      );
    });

    it('throws when url is missing', async () => {
      await expect(GroupHTTP.request({} as any)).rejects.toThrow();
    });
  });

  describe('downloadFile', () => {
    function mockWriter() {
      return new EventEmitter() as any;
    }

    it('downloads to an absolute file path and creates parent directories', async () => {
      existsSyncMock.mockReturnValue(false);
      const writer = mockWriter();
      createWriteStreamMock.mockReturnValue(writer);
      const pipeMock = vi.fn((dest: any) => {
        queueMicrotask(() => dest.emit('finish'));
      });
      axiosGetMock.mockResolvedValue({ data: { pipe: pipeMock } });

      const result = await GroupHTTP.downloadFile(
        { url: 'https://example.com/reports/report.pdf', path: '/tmp/out/report.pdf' } as any,
        undefined as any
      );

      expect(axiosGetMock).toHaveBeenCalledWith('https://example.com/reports/report.pdf', {
        responseType: 'stream',
        lookup: expect.any(Function),
      });
      expect(mkdirSyncMock).toHaveBeenCalledWith('/tmp/out', { recursive: true });
      expect(createWriteStreamMock).toHaveBeenCalledWith('/tmp/out/report.pdf');
      expect(pipeMock).toHaveBeenCalledWith(writer);
      expect(result).toBe('/tmp/out/report.pdf');
    });

    it('derives the file name from the URL when path is an existing directory', async () => {
      existsSyncMock.mockReturnValue(true);
      lstatSyncMock.mockReturnValue({ isDirectory: () => true });
      const writer = mockWriter();
      createWriteStreamMock.mockReturnValue(writer);
      axiosGetMock.mockResolvedValue({
        data: { pipe: (dest: any) => queueMicrotask(() => dest.emit('finish')) },
      });

      const result = await GroupHTTP.downloadFile(
        { url: 'https://example.com/reports/daily-report.pdf', path: '/tmp/downloads' } as any,
        undefined as any
      );

      expect(result).toBe('/tmp/downloads/daily-report.pdf');
    });

    it('resolves a relative path against the task file directory', async () => {
      existsSyncMock.mockReturnValue(false);
      const writer = mockWriter();
      createWriteStreamMock.mockReturnValue(writer);
      axiosGetMock.mockResolvedValue({
        data: { pipe: (dest: any) => queueMicrotask(() => dest.emit('finish')) },
      });

      const fakeTask = { getFilePath: () => '/home/user/tasks/my-task.yaml' } as any;
      const result = await GroupHTTP.downloadFile(
        { url: 'https://example.com/file.txt', path: './downloads/file.txt' } as any,
        fakeTask
      );

      expect(result).toBe('/home/user/tasks/downloads/file.txt');
    });

    it('rejects when the write stream errors', async () => {
      existsSyncMock.mockReturnValue(false);
      const writer = mockWriter();
      createWriteStreamMock.mockReturnValue(writer);
      axiosGetMock.mockResolvedValue({
        data: {
          pipe: (dest: any) => queueMicrotask(() => dest.emit('error', new Error('disk full'))),
        },
      });

      await expect(
        GroupHTTP.downloadFile(
          { url: 'https://example.com/file.txt', path: '/tmp/out/file.txt' } as any,
          undefined as any
        )
      ).rejects.toThrow('disk full');
    });

    it('throws when url is missing', async () => {
      await expect(
        GroupHTTP.downloadFile({ path: '/tmp/out' } as any, undefined as any)
      ).rejects.toThrow();
    });

    it('propagates a rejection from axios.get', async () => {
      existsSyncMock.mockReturnValue(false);
      axiosGetMock.mockRejectedValue(new Error('ENOTFOUND'));

      await expect(
        GroupHTTP.downloadFile(
          { url: 'https://example.com/file.txt', path: '/tmp/out/file.txt' } as any,
          undefined as any
        )
      ).rejects.toThrow('ENOTFOUND');
    });
  });
});
