import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  waitPortMock: vi.fn(),
  resolveMock: vi.fn(),
  reverseMock: vi.fn(),
  lookupMock: vi.fn(),
  probeMock: vi.fn(),
  tlsConnectMock: vi.fn(),
}));

vi.mock('wait-port', () => ({
  default: mocks.waitPortMock,
}));

vi.mock('node:dns/promises', () => ({
  resolve: mocks.resolveMock,
  reverse: mocks.reverseMock,
  lookup: mocks.lookupMock,
}));

vi.mock('ping', () => ({
  default: { promise: { probe: mocks.probeMock } },
}));

vi.mock('tls', () => ({
  connect: mocks.tlsConnectMock,
  default: { connect: mocks.tlsConnectMock },
}));

import { GroupNetwork } from '@/action/actions/network/actions';

const { waitPortMock, resolveMock, reverseMock, lookupMock, probeMock, tlsConnectMock } = mocks;

describe('GroupNetwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('waitPort', () => {
    it('resolves true and forwards host/port/timeout to wait-port', async () => {
      waitPortMock.mockResolvedValue({ open: true });
      const result = await GroupNetwork.waitPort({ host: 'localhost', port: 22, timeout: 5000 });

      expect(result).toBe(true);
      expect(waitPortMock).toHaveBeenCalledWith({
        host: 'localhost',
        port: 22,
        timeout: 5000,
        output: 'silent',
      });
    });

    it('applies the default timeout of 60000 when not provided', async () => {
      waitPortMock.mockResolvedValue({ open: true });
      await GroupNetwork.waitPort({ host: 'localhost', port: 22 } as any);

      expect(waitPortMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: 60000 }));
    });

    it('propagates a rejection from wait-port', async () => {
      waitPortMock.mockRejectedValue(new Error('timeout waiting for port'));

      await expect(
        GroupNetwork.waitPort({ host: 'localhost', port: 22, timeout: 1000 })
      ).rejects.toThrow('timeout waiting for port');
    });

    it('throws when host is missing', async () => {
      await expect(GroupNetwork.waitPort({ port: 22 } as any)).rejects.toThrow();
    });

    it('throws when port is out of range', async () => {
      await expect(GroupNetwork.waitPort({ host: 'localhost', port: 70000 } as any)).rejects.toThrow();
    });
  });

  describe('resolveDNS', () => {
    it('resolves records of a specific type', async () => {
      resolveMock.mockResolvedValue(['1.2.3.4']);
      const result = await GroupNetwork.resolveDNS({ host: 'example.com', type: 'A' });

      expect(resolveMock).toHaveBeenCalledWith('example.com', 'A');
      expect(result).toEqual(['1.2.3.4']);
    });

    it('resolves default records when type is omitted', async () => {
      resolveMock.mockResolvedValue(['1.2.3.4']);
      await GroupNetwork.resolveDNS({ host: 'example.com' } as any);

      expect(resolveMock).toHaveBeenCalledWith('example.com');
    });

    it('propagates a rejection from dns resolve', async () => {
      resolveMock.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(GroupNetwork.resolveDNS({ host: 'bad.example' } as any)).rejects.toThrow(
        'ENOTFOUND'
      );
    });

    it('throws for an invalid record type', async () => {
      await expect(
        GroupNetwork.resolveDNS({ host: 'example.com', type: 'BOGUS' as any })
      ).rejects.toThrow();
    });
  });

  describe('reverseDNS', () => {
    it('resolves hostnames for an IP', async () => {
      reverseMock.mockResolvedValue(['host.example.com']);
      const result = await GroupNetwork.reverseDNS({ ip: '1.2.3.4' });

      expect(reverseMock).toHaveBeenCalledWith('1.2.3.4');
      expect(result).toEqual(['host.example.com']);
    });

    it('propagates a rejection from dns reverse', async () => {
      reverseMock.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(GroupNetwork.reverseDNS({ ip: '9.9.9.9' })).rejects.toThrow('ENOTFOUND');
    });

    it('throws when ip is missing', async () => {
      await expect(GroupNetwork.reverseDNS({} as any)).rejects.toThrow();
    });
  });

  describe('lookup', () => {
    it('resolves all addresses for a hostname', async () => {
      lookupMock.mockResolvedValue([{ address: '1.2.3.4', family: 4 }]);
      const result = await GroupNetwork.lookup({ hostname: 'example.com' });

      expect(lookupMock).toHaveBeenCalledWith('example.com', { all: true });
      expect(result).toEqual([{ address: '1.2.3.4', family: 4 }]);
    });

    it('propagates a rejection from dns lookup', async () => {
      lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(GroupNetwork.lookup({ hostname: 'bad.example' })).rejects.toThrow('ENOTFOUND');
    });

    it('throws when hostname is missing', async () => {
      await expect(GroupNetwork.lookup({} as any)).rejects.toThrow();
    });
  });

  describe('ping', () => {
    it('returns true when the host is alive', async () => {
      probeMock.mockResolvedValue({ alive: true });
      const result = await GroupNetwork.ping({ host: '1.2.3.4' });

      expect(probeMock).toHaveBeenCalledWith('1.2.3.4');
      expect(result).toBe(true);
    });

    it('returns false when the host is not alive', async () => {
      probeMock.mockResolvedValue({ alive: false });
      const result = await GroupNetwork.ping({ host: '1.2.3.4' });

      expect(result).toBe(false);
    });

    it('propagates a rejection from ping', async () => {
      probeMock.mockRejectedValue(new Error('probe failed'));
      await expect(GroupNetwork.ping({ host: '1.2.3.4' })).rejects.toThrow('probe failed');
    });

    it('throws when host is missing', async () => {
      await expect(GroupNetwork.ping({} as any)).rejects.toThrow();
    });
  });

  describe('checkTlsCertificate', () => {
    function mockSocket(cert: any) {
      const listeners: Record<string, (...args: any[]) => void> = {};
      const socket = {
        getPeerCertificate: vi.fn(() => cert),
        end: vi.fn(),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          listeners[event] = cb;
        }),
      };
      return { socket, listeners };
    }

    it('resolves certificate details on a successful connection', async () => {
      const validTo = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      const cert = {
        subject: { CN: 'example.com' },
        issuer: { CN: 'Test CA' },
        valid_from: '2024-01-01T00:00:00.000Z',
        valid_to: validTo,
        subjectaltname: 'DNS:example.com, DNS:www.example.com',
      };
      const { socket } = mockSocket(cert);

      tlsConnectMock.mockImplementation((_port: number, _host: string, _opts: any, cb: () => void) => {
        queueMicrotask(cb);
        return socket;
      });

      const result = await GroupNetwork.checkTlsCertificate({ host: 'example.com', port: 443 });

      expect(tlsConnectMock).toHaveBeenCalledWith(
        443,
        'example.com',
        { servername: 'example.com' },
        expect.any(Function)
      );
      expect(result.subjectCN).toBe('example.com');
      expect(result.issuerCN).toBe('Test CA');
      expect(result.subject_alt_names).toEqual(['example.com', 'www.example.com']);
      expect(result.days_remaining).toBeGreaterThanOrEqual(9);
      expect(socket.end).toHaveBeenCalled();
    });

    it('defaults the port to 443 when omitted', async () => {
      const cert = { subject: { CN: 'x' }, issuer: {}, valid_to: new Date().toISOString() };
      const { socket } = mockSocket(cert);
      tlsConnectMock.mockImplementation((_port: number, _host: string, _opts: any, cb: () => void) => {
        queueMicrotask(cb);
        return socket;
      });

      await GroupNetwork.checkTlsCertificate({ host: 'example.com' } as any);

      expect(tlsConnectMock).toHaveBeenCalledWith(
        443,
        'example.com',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('rejects when no certificate is returned', async () => {
      const { socket } = mockSocket({});
      tlsConnectMock.mockImplementation((_port: number, _host: string, _opts: any, cb: () => void) => {
        queueMicrotask(cb);
        return socket;
      });

      await expect(
        GroupNetwork.checkTlsCertificate({ host: 'example.com', port: 443 })
      ).rejects.toThrow('No certificate found');
    });

    it('rejects when the socket emits an error', async () => {
      const { socket, listeners } = mockSocket({});
      tlsConnectMock.mockImplementation(() => socket);

      const promise = GroupNetwork.checkTlsCertificate({ host: 'unreachable.example', port: 443 });
      listeners.error(new Error('connect ECONNREFUSED'));

      await expect(promise).rejects.toThrow('connect ECONNREFUSED');
    });

    it('throws when host is missing', async () => {
      await expect(GroupNetwork.checkTlsCertificate({} as any)).rejects.toThrow();
    });
  });
});
