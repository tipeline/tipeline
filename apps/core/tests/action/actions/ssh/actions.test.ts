import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectMock: vi.fn(),
  execCommandMock: vi.fn(),
  disposeMock: vi.fn(),
  isConnectedMock: vi.fn(() => true),
  NodeSSHMock: vi.fn(),
}));

mocks.NodeSSHMock.mockImplementation(function (this: any) {
  this.connect = mocks.connectMock;
  this.execCommand = mocks.execCommandMock;
  this.dispose = mocks.disposeMock;
  this.isConnected = mocks.isConnectedMock;
});

vi.mock('node-ssh', () => ({
  NodeSSH: mocks.NodeSSHMock,
}));

import { GroupSSH } from '@/action/actions/ssh/actions';

const { connectMock, execCommandMock, disposeMock, NodeSSHMock } = mocks;

describe('GroupSSH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isConnectedMock.mockReturnValue(true);
  });

  describe('connect', () => {
    it('constructs a NodeSSH client and connects with the given config', async () => {
      connectMock.mockResolvedValue(undefined);
      const config = { host: 'example.com', username: 'root', privateKey: 'xxx' };

      const connection = await GroupSSH.connect({ config } as any);

      expect(NodeSSHMock).toHaveBeenCalledTimes(1);
      expect(connectMock).toHaveBeenCalledWith(config);
      expect(typeof (connection as any).execCommand).toBe('function');
      expect(typeof (connection as any).dispose).toBe('function');
    });

    it('propagates a rejection from the SSH client on connection failure', async () => {
      connectMock.mockRejectedValue(new Error('All configured authentication methods failed'));

      await expect(
        GroupSSH.connect({ config: { host: 'bad.example.com' } } as any)
      ).rejects.toThrow('All configured authentication methods failed');
    });

    it('throws when config is missing', async () => {
      await expect(GroupSSH.connect({} as any)).rejects.toThrow();
    });
  });

  describe('exec', () => {
    it('runs a command on the connection and returns the result', async () => {
      connectMock.mockResolvedValue(undefined);
      const connection = await GroupSSH.connect({ config: { host: 'example.com' } } as any);
      execCommandMock.mockResolvedValue({ stdout: 'ok', stderr: '', code: 0, signal: null });

      const result = await GroupSSH.exec({ connection, command: 'ls -la' } as any);

      expect(execCommandMock).toHaveBeenCalledWith('ls -la');
      expect(result).toEqual({ stdout: 'ok', stderr: '', code: 0, signal: null });
    });

    it('propagates a rejection when the remote command fails to execute', async () => {
      connectMock.mockResolvedValue(undefined);
      const connection = await GroupSSH.connect({ config: { host: 'example.com' } } as any);
      execCommandMock.mockRejectedValue(new Error('connection lost'));

      await expect(GroupSSH.exec({ connection, command: 'ls' } as any)).rejects.toThrow(
        'connection lost'
      );
    });

    it('throws when command is empty', async () => {
      connectMock.mockResolvedValue(undefined);
      const connection = await GroupSSH.connect({ config: { host: 'example.com' } } as any);

      await expect(GroupSSH.exec({ connection, command: '' } as any)).rejects.toThrow();
    });

    it('throws when connection is not a valid SSH instance', async () => {
      await expect(
        GroupSSH.exec({ connection: { notSsh: true } as any, command: 'ls' } as any)
      ).rejects.toThrow();
    });
  });

  describe('close', () => {
    it('disposes of the connection', async () => {
      connectMock.mockResolvedValue(undefined);
      disposeMock.mockReturnValue(undefined);
      const connection = await GroupSSH.connect({ config: { host: 'example.com' } } as any);

      await GroupSSH.close({ connection } as any);

      expect(disposeMock).toHaveBeenCalledTimes(1);
    });

    it('propagates an error thrown while disposing', async () => {
      connectMock.mockResolvedValue(undefined);
      const connection = await GroupSSH.connect({ config: { host: 'example.com' } } as any);
      disposeMock.mockImplementation(() => {
        throw new Error('dispose failed');
      });

      await expect(GroupSSH.close({ connection } as any)).rejects.toThrow('dispose failed');
    });

    it('throws when connection is not a valid SSH instance', async () => {
      await expect(GroupSSH.close({ connection: {} as any } as any)).rejects.toThrow();
    });
  });
});
