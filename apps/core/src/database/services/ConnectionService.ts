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

    const cleanName = await ConnectionService.checkName(name);
    return Connection.query().insertAndFetch({ id: generateIdentifier(), name: cleanName, host, token });
  }

  /**
   * A connection is picked by its name, so names must be unique (ignoring case), and
   * "local" always means this machine. Returns the trimmed name.
   */
  private static async checkName(name: string, exceptId?: string): Promise<string> {
    const clean = (name ?? '').trim();
    if (!clean) throw new Error('Give the connection a name.');
    if (clean.toLowerCase() === 'local') {
      throw new Error('"local" means this machine, so a connection can\'t be named that.');
    }
    const taken = (await Connection.query()).some(
      (c) => c.id !== exceptId && c.name.trim().toLowerCase() === clean.toLowerCase()
    );
    if (taken) throw new Error(`A connection named "${clean}" already exists. Pick another name.`);
    return clean;
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
    if (data.name !== undefined) data = { ...data, name: await ConnectionService.checkName(data.name, id) };
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
    const wanted = idOrName.trim().toLowerCase();
    const byName = (await Connection.query()).filter((c) => c.name.trim().toLowerCase() === wanted);
    if (byName.length === 0) throw new Error(`Connection "${idOrName}" not found`);
    // Saved before names had to be unique: say which ones, rather than pick one.
    if (byName.length > 1) {
      throw new Error(
        `${byName.length} connections are named "${idOrName}". Use one's ID instead: ${byName.map((c) => c.id).join(', ')}`
      );
    }
    await SettingsService.set(ACTIVE_KEY, byName[0].id);
  }
}
