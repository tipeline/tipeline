import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    alertList: vi.fn(),
    alertDismiss: vi.fn(),
    alertReopen: vi.fn(),
  },
}));

import { registerAppHandlers } from '@engine/handlers/appHandlers';
import Core from '@engine/Core';
import IPCMessage from '@engine/IPCMessage';

function createFakeTransport() {
  const handlers = new Map<string, (message: any, client: any) => Promise<void>>();
  return {
    on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
    emit: vi.fn(),
    broadcast: vi.fn(),
    stop: vi.fn(),
    handlers,
  };
}

describe('alert handlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.alertList).mockReset();
    vi.mocked(Core.alertDismiss).mockReset();
    vi.mocked(Core.alertReopen).mockReset();
    transport = createFakeTransport();
    registerAppHandlers(transport as any, vi.fn());
  });

  it('alertList passes the query and answers on onAlertList', async () => {
    const alerts = [{ id: 'a1', title: 'Spike' }];
    vi.mocked(Core.alertList).mockResolvedValue(alerts as any);

    await transport.handlers.get('alertList')!(
      { payload: { includeClosed: true }, correlationId: 'c1' },
      client
    );

    expect(Core.alertList).toHaveBeenCalledWith({ includeClosed: true });
    expect(transport.emit).toHaveBeenCalledWith(
      client,
      'onAlertList',
      IPCMessage.success(alerts, 'c1')
    );
  });

  it('alertList works without a payload', async () => {
    vi.mocked(Core.alertList).mockResolvedValue([]);
    await transport.handlers.get('alertList')!({ correlationId: 'c1' }, client);
    expect(Core.alertList).toHaveBeenCalledWith({});
  });

  it('alertDismiss answers with how many were dismissed', async () => {
    vi.mocked(Core.alertDismiss).mockResolvedValue({ dismissed: 1 });
    await transport.handlers.get('alertDismiss')!(
      { payload: { id: 'a1' }, correlationId: 'c2' },
      client
    );
    expect(Core.alertDismiss).toHaveBeenCalledWith({ id: 'a1' });
    expect(transport.emit).toHaveBeenCalledWith(
      client,
      'onAlertDismiss',
      IPCMessage.success({ dismissed: 1 }, 'c2')
    );
  });

  it('failures come back on the response event', async () => {
    vi.mocked(Core.alertReopen).mockRejectedValue(new Error('No dismissed alert with this id'));
    await transport.handlers.get('alertReopen')!(
      { payload: { id: 'x' }, correlationId: 'c3' },
      client
    );
    expect(transport.emit).toHaveBeenCalledWith(
      client,
      'onAlertReopen',
      IPCMessage.failure('No dismissed alert with this id', 'c3')
    );
  });

  it('ignores messages without a client', async () => {
    await transport.handlers.get('alertList')!({ correlationId: 'c1' }, null);
    expect(Core.alertList).not.toHaveBeenCalled();
  });
});
