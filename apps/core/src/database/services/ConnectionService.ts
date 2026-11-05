import { generateIdentifier } from '@tipeline/utils';
import { Connection } from '@database/models/Connection';
import { SettingsService } from '@database/services/SettingsService';

const ACTIVE_KEY = 'active_connection';

export class ConnectionService {
  static async list(): Promise<Connection[]> {
    return Connection.query().orderBy('created_at');
  }

  static async add(name: string, host: string, token: string): Promise<Connection> {
    let parsedHost: URL;
    try {
      parsedHost = new URL(host);
    } catch {
      throw new Error(`Invalid host: "${host}" is not a valid URL (expected e.g. ws://192.168.1.10:4000)`);
    }
    if (parsedHost.protocol !== 'ws:' && parsedHost.protocol !== 'wss:') {
      throw new Error(`Invalid host: "${host}" must use the ws:// or wss:// protocol`);
    }

    return Connection.query().insertAndFetch({ id: generateIdentifier(), name, host, token });
  }

  static async remove(id: string): Promise<void> {
    const count = await Connection.query().deleteById(id);
    if (!count) throw new Error(`Connection "${id}" not found`);
    const activeId = await SettingsService.get(ACTIVE_KEY);
    if (activeId === id) await SettingsService.set(ACTIVE_KEY, '');
  }

  static async getActiveId(): Promise<string | null> {
    const id = await SettingsService.get(ACTIVE_KEY);
    return id || null;
  }

  static async getActive(): Promise<Connection | null> {
    const id = await this.getActiveId();
    if (!id) return null;
    return (await Connection.query().findById(id)) ?? null;
  }

  static async update(id: string, data: Partial<{ name: string; host: string; token: string }>): Promise<Connection> {
    return Connection.query().patchAndFetchById(id, data);
  }

  static async setActive(idOrName: string | null): Promise<void> {
    if (!idOrName) {
      await SettingsService.set(ACTIVE_KEY, '');
      return;
    }
    const byId = await Connection.query().findById(idOrName);
    if (byId) {
      await SettingsService.set(ACTIVE_KEY, byId.id);
      return;
    }
    const byName = await Connection.query().findOne({ name: idOrName });
    if (!byName) throw new Error(`Connection "${idOrName}" not found`);
    await SettingsService.set(ACTIVE_KEY, byName.id);
  }
}
